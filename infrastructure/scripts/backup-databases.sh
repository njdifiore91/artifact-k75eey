#!/bin/bash

# Art Knowledge Graph Database Backup Script
# Version: 1.0.0
# Description: Enterprise-grade backup solution for PostgreSQL, Neo4j, and Redis databases
# with encryption, compression, and cloud storage integration

set -euo pipefail
IFS=$'\n\t'

# Global Configuration
BACKUP_ROOT="/var/backups/artknowledgegraph"
RETENTION_DAYS=30
ENCRYPTION_KEY_PATH="/etc/artknowledgegraph/backup-key.asc"
S3_BUCKET="artknowledgegraph-backups"
LOG_FILE="/var/log/artknowledgegraph/backups.log"
COMPRESSION_LEVEL=9
MAX_PARALLEL_OPERATIONS=4
BACKUP_TEMP_DIR="/tmp/artknowledgegraph/backups"
HEALTH_CHECK_ENDPOINT="https://hc-ping.com/backup-service-uuid"
ERROR_NOTIFICATION_WEBHOOK="https://alerts.artknowledgegraph.com/backup-webhook"

# Load database configurations from environment or config files
source /etc/artknowledgegraph/db-config.env

setup_logging() {
    local log_dir=$(dirname "$LOG_FILE")
    
    # Create log directory with secure permissions
    mkdir -p "$log_dir"
    chmod 750 "$log_dir"
    
    # Initialize log file with proper permissions
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
    
    # Configure log rotation
    cat > /etc/logrotate.d/artknowledgegraph-backups << EOF
$LOG_FILE {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 root root
    missingok
}
EOF
}

log() {
    local level=$1
    local message=$2
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"$message\"}" >> "$LOG_FILE"
    
    # Send critical errors to webhook
    if [ "$level" = "ERROR" ]; then
        curl -s -X POST "$ERROR_NOTIFICATION_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"level\":\"$level\",\"message\":\"$message\",\"timestamp\":\"$timestamp\"}" || true
    fi
}

verify_prerequisites() {
    local required_space=10737418240  # 10GB minimum free space
    
    # Check available disk space
    local available_space=$(df -B1 "$BACKUP_TEMP_DIR" | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt "$required_space" ]; then
        log "ERROR" "Insufficient disk space. Required: 10GB, Available: $(($available_space/1024/1024/1024))GB"
        return 1
    fi
    
    # Verify encryption key
    if [ ! -f "$ENCRYPTION_KEY_PATH" ]; then
        log "ERROR" "Encryption key not found at $ENCRYPTION_KEY_PATH"
        return 1
    fi
    
    # Check required tools
    for tool in pg_dump neo4j-admin redis-cli aws gpg parallel; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool not found: $tool"
            return 1
        fi
    done
}

backup_postgres() {
    local timestamp=$1
    local is_full_backup=$2
    local backup_dir="$BACKUP_TEMP_DIR/postgres/$timestamp"
    local backup_file="postgres_${timestamp}.sql.gz"
    
    log "INFO" "Starting PostgreSQL backup - Full backup: $is_full_backup"
    
    mkdir -p "$backup_dir"
    
    # Acquire backup lock
    psql "$POSTGRES_URL" -c "SELECT pg_advisory_lock(1);" || {
        log "ERROR" "Failed to acquire PostgreSQL backup lock"
        return 1
    }
    
    # Perform backup with parallel compression
    if [ "$is_full_backup" = true ]; then
        pg_dump "$POSTGRES_URL" \
            --format=custom \
            --compress=$COMPRESSION_LEVEL \
            --jobs=$MAX_PARALLEL_OPERATIONS \
            --file="$backup_dir/$backup_file" || {
            log "ERROR" "PostgreSQL backup failed"
            psql "$POSTGRES_URL" -c "SELECT pg_advisory_unlock(1);"
            return 1
        }
    else
        pg_dump "$POSTGRES_URL" \
            --format=custom \
            --compress=$COMPRESSION_LEVEL \
            --jobs=$MAX_PARALLEL_OPERATIONS \
            --exclude-table-data='audit_log' \
            --file="$backup_dir/$backup_file" || {
            log "ERROR" "PostgreSQL incremental backup failed"
            psql "$POSTGRES_URL" -c "SELECT pg_advisory_unlock(1);"
            return 1
        }
    fi
    
    # Release backup lock
    psql "$POSTGRES_URL" -c "SELECT pg_advisory_unlock(1);"
    
    # Encrypt backup
    gpg --batch --yes --trust-model always \
        --encrypt --recipient-file "$ENCRYPTION_KEY_PATH" \
        --output "$backup_dir/$backup_file.gpg" \
        "$backup_dir/$backup_file"
    
    # Upload to S3 with integrity verification
    aws s3 cp "$backup_dir/$backup_file.gpg" \
        "s3://$S3_BUCKET/postgres/$backup_file.gpg" \
        --storage-class STANDARD_IA \
        --metadata "timestamp=$timestamp,type=postgres,full=$is_full_backup"
    
    # Cleanup
    rm -rf "$backup_dir"
    
    log "INFO" "PostgreSQL backup completed successfully"
}

backup_neo4j() {
    local timestamp=$1
    local is_full_backup=$2
    local backup_dir="$BACKUP_TEMP_DIR/neo4j/$timestamp"
    local backup_file="neo4j_${timestamp}.tar.gz"
    
    log "INFO" "Starting Neo4j backup - Full backup: $is_full_backup"
    
    mkdir -p "$backup_dir"
    
    # Create consistent backup
    neo4j-admin backup \
        --backup-dir="$backup_dir" \
        --database=graph.db \
        --pagecache=2G \
        --check-consistency=true \
        --verbose || {
        log "ERROR" "Neo4j backup failed"
        return 1
    }
    
    # Compress backup
    tar czf "$backup_dir/$backup_file" -C "$backup_dir" graph.db
    
    # Encrypt backup
    gpg --batch --yes --trust-model always \
        --encrypt --recipient-file "$ENCRYPTION_KEY_PATH" \
        --output "$backup_dir/$backup_file.gpg" \
        "$backup_dir/$backup_file"
    
    # Upload to S3
    aws s3 cp "$backup_dir/$backup_file.gpg" \
        "s3://$S3_BUCKET/neo4j/$backup_file.gpg" \
        --storage-class STANDARD_IA \
        --metadata "timestamp=$timestamp,type=neo4j,full=$is_full_backup"
    
    # Cleanup
    rm -rf "$backup_dir"
    
    log "INFO" "Neo4j backup completed successfully"
}

backup_redis() {
    local timestamp=$1
    local backup_dir="$BACKUP_TEMP_DIR/redis/$timestamp"
    local backup_file="redis_${timestamp}.rdb.gz"
    
    log "INFO" "Starting Redis backup"
    
    mkdir -p "$backup_dir"
    
    # Trigger BGSAVE
    redis-cli BGSAVE || {
        log "ERROR" "Redis BGSAVE failed"
        return 1
    }
    
    # Wait for BGSAVE completion
    while redis-cli INFO persistence | grep -q "rdb_bgsave_in_progress:1"; do
        sleep 1
    done
    
    # Copy and compress RDB file
    cp "$REDIS_RDB_PATH" "$backup_dir/dump.rdb"
    gzip -$COMPRESSION_LEVEL "$backup_dir/dump.rdb"
    
    # Encrypt backup
    gpg --batch --yes --trust-model always \
        --encrypt --recipient-file "$ENCRYPTION_KEY_PATH" \
        --output "$backup_dir/$backup_file.gpg" \
        "$backup_dir/dump.rdb.gz"
    
    # Upload to S3
    aws s3 cp "$backup_dir/$backup_file.gpg" \
        "s3://$S3_BUCKET/redis/$backup_file.gpg" \
        --storage-class STANDARD_IA \
        --metadata "timestamp=$timestamp,type=redis"
    
    # Cleanup
    rm -rf "$backup_dir"
    
    log "INFO" "Redis backup completed successfully"
}

cleanup_old_backups() {
    log "INFO" "Starting cleanup of old backups"
    
    # List and delete old backups in parallel
    aws s3 ls "s3://$S3_BUCKET" --recursive | \
        awk -v cutoff=$(date -d "$RETENTION_DAYS days ago" +%s) \
        '{if ($1" "$2 < cutoff) print $4}' | \
        parallel -j "$MAX_PARALLEL_OPERATIONS" \
            aws s3 rm "s3://$S3_BUCKET/{}"
    
    log "INFO" "Backup cleanup completed"
}

main() {
    local start_time=$(date +%s)
    local timestamp=$(date -u +"%Y%m%d_%H%M%S")
    local is_full_backup=false
    local exit_code=0
    
    # Notify monitoring of backup start
    curl -s "$HEALTH_CHECK_ENDPOINT/start" || true
    
    # Setup logging
    setup_logging
    
    log "INFO" "Starting database backup process"
    
    # Create temporary directory
    mkdir -p "$BACKUP_TEMP_DIR"
    chmod 700 "$BACKUP_TEMP_DIR"
    
    # Verify prerequisites
    if ! verify_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        curl -s "$HEALTH_CHECK_ENDPOINT/fail" || true
        return 1
    fi
    
    # Determine if this is a full backup (weekly)
    if [ "$(date +%u)" = "7" ]; then
        is_full_backup=true
        log "INFO" "Performing full weekly backup"
    fi
    
    # Perform backups
    if ! backup_postgres "$timestamp" "$is_full_backup"; then
        log "ERROR" "PostgreSQL backup failed"
        exit_code=1
    fi
    
    if ! backup_neo4j "$timestamp" "$is_full_backup"; then
        log "ERROR" "Neo4j backup failed"
        exit_code=1
    fi
    
    if ! backup_redis "$timestamp"; then
        log "ERROR" "Redis backup failed"
        exit_code=1
    fi
    
    # Cleanup old backups if all backups succeeded
    if [ $exit_code -eq 0 ]; then
        cleanup_old_backups
    fi
    
    # Calculate duration
    local duration=$(($(date +%s) - start_time))
    log "INFO" "Backup process completed in $duration seconds"
    
    # Cleanup temporary directory
    rm -rf "$BACKUP_TEMP_DIR"
    
    # Notify monitoring of backup completion
    if [ $exit_code -eq 0 ]; then
        curl -s "$HEALTH_CHECK_ENDPOINT" || true
    else
        curl -s "$HEALTH_CHECK_ENDPOINT/fail" || true
    fi
    
    return $exit_code
}

# Execute main function
main