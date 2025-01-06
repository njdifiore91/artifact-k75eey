#!/bin/bash

# Art Knowledge Graph Infrastructure Destruction Script
# Version: 1.0.0
# Dependencies:
# - aws-cli 2.x
# - terraform 1.5.0+

set -euo pipefail

# Global Variables
BACKUP_BUCKET="art-knowledge-graph-backups"
ENVIRONMENTS=("dev" "staging" "prod")
TERRAFORM_DIR="../terraform"
LOG_FILE="/var/log/terraform-destroy.log"
BACKUP_RETENTION_DAYS=30
EMERGENCY_CONTACTS=("ops@artknowledge.com" "security@artknowledge.com")

# Logging setup
exec 1> >(tee -a "${LOG_FILE}")
exec 2> >(tee -a "${LOG_FILE}" >&2)

log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] $*"
}

error_handler() {
    local line_no=$1
    local error_code=$2
    log "ERROR" "Error occurred in script at line: ${line_no}, error code: ${error_code}"
    for contact in "${EMERGENCY_CONTACTS[@]}"; do
        aws ses send-email \
            --from "noreply@artknowledge.com" \
            --to "${contact}" \
            --subject "URGENT: Infrastructure Destruction Error" \
            --text "Error occurred during infrastructure destruction. Check logs at ${LOG_FILE}"
    done
    exit 1
}

trap 'error_handler ${LINENO} $?' ERR

check_environment() {
    local env=$1
    log "INFO" "Validating environment: ${env}"
    
    # Validate environment name
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${env} " ]]; then
        log "ERROR" "Invalid environment: ${env}"
        return 1
    }

    # Check AWS credentials
    aws sts get-caller-identity >/dev/null || {
        log "ERROR" "Invalid AWS credentials"
        return 1
    }

    # Verify Terraform workspace
    cd "${TERRAFORM_DIR}"
    terraform workspace select "${env}" || {
        log "ERROR" "Failed to select Terraform workspace: ${env}"
        return 1
    }

    # Enhanced safety checks for production
    if [[ "${env}" == "prod" ]]; then
        log "WARNING" "PRODUCTION ENVIRONMENT DESTRUCTION REQUESTED"
        log "WARNING" "This will permanently delete all production resources!"
        
        read -p "Type 'DESTROY PRODUCTION' to confirm (1/3): " confirm1
        read -p "Type 'I UNDERSTAND THE CONSEQUENCES' to confirm (2/3): " confirm2
        read -p "Type 'THIS ACTION CANNOT BE UNDONE' to confirm (3/3): " confirm3
        
        if [[ "${confirm1}" != "DESTROY PRODUCTION" ]] || \
           [[ "${confirm2}" != "I UNDERSTAND THE CONSEQUENCES" ]] || \
           [[ "${confirm3}" != "THIS ACTION CANNOT BE UNDONE" ]]; then
            log "INFO" "Production destruction cancelled by user"
            return 1
        fi
    fi

    return 0
}

backup_critical_data() {
    local env=$1
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="s3://${BACKUP_BUCKET}/${env}/${timestamp}"
    
    log "INFO" "Starting critical data backup for environment: ${env}"

    # Create RDS snapshots
    log "INFO" "Creating RDS snapshots"
    aws rds describe-db-instances --query 'DBInstances[*].DBInstanceIdentifier' --output text | \
    while read -r instance; do
        aws rds create-db-snapshot \
            --db-instance-identifier "${instance}" \
            --db-snapshot-identifier "${instance}-${timestamp}" || {
            log "ERROR" "Failed to create RDS snapshot for ${instance}"
            return 1
        }
    done

    # Export Neo4j data
    log "INFO" "Backing up Neo4j data"
    aws ecs list-tasks --cluster "${env}-cluster" --service-name neo4j | \
    jq -r '.taskArns[]' | while read -r task; do
        aws ecs execute-command \
            --cluster "${env}-cluster" \
            --task "${task}" \
            --container neo4j \
            --command "neo4j-admin dump --to=/backup/neo4j-${timestamp}.dump" || {
            log "ERROR" "Failed to backup Neo4j data"
            return 1
        }
    done

    # Backup ElastiCache
    log "INFO" "Creating ElastiCache snapshots"
    aws elasticache describe-cache-clusters --query 'CacheClusters[*].CacheClusterId' --output text | \
    while read -r cluster; do
        aws elasticache create-snapshot \
            --cache-cluster-id "${cluster}" \
            --snapshot-name "${cluster}-${timestamp}" || {
            log "ERROR" "Failed to create ElastiCache snapshot for ${cluster}"
            return 1
        }
    done

    # Generate backup manifest
    log "INFO" "Generating backup manifest"
    cat > "backup-manifest-${timestamp}.json" << EOF
{
    "environment": "${env}",
    "timestamp": "${timestamp}",
    "components": {
        "rds": "snapshot-${timestamp}",
        "neo4j": "neo4j-${timestamp}.dump",
        "elasticache": "snapshot-${timestamp}"
    }
}
EOF

    # Upload manifest with checksum
    sha256sum "backup-manifest-${timestamp}.json" > "backup-manifest-${timestamp}.sha256"
    aws s3 cp "backup-manifest-${timestamp}.json" "${backup_path}/manifest.json"
    aws s3 cp "backup-manifest-${timestamp}.sha256" "${backup_path}/manifest.sha256"

    log "INFO" "Backup completed successfully"
    return 0
}

destroy_environment() {
    local env=$1
    log "INFO" "Starting destruction of environment: ${env}"

    # Initialize Terraform
    cd "${TERRAFORM_DIR}"
    terraform init -backend=true || {
        log "ERROR" "Failed to initialize Terraform"
        return 1
    }

    # Create and verify destruction plan
    log "INFO" "Creating destruction plan"
    terraform plan -destroy -out=destroy.plan || {
        log "ERROR" "Failed to create destruction plan"
        return 1
    }

    # Execute destruction
    log "INFO" "Executing Terraform destroy"
    terraform apply destroy.plan || {
        log "ERROR" "Terraform destroy failed"
        return 1
    }

    # Verify destruction
    log "INFO" "Verifying resource destruction"
    terraform show || {
        log "ERROR" "Failed to verify destruction"
        return 1
    }

    return 0
}

cleanup_resources() {
    local env=$1
    log "INFO" "Starting post-destruction cleanup for environment: ${env}"

    # Clean up S3 buckets
    log "INFO" "Cleaning up S3 buckets"
    aws s3 ls "s3://art-knowledge-graph-${env}-" | while read -r bucket; do
        aws s3 rb "s3://${bucket}" --force || {
            log "WARNING" "Failed to remove bucket: ${bucket}"
        }
    done

    # Clean up CloudWatch log groups
    log "INFO" "Cleaning up CloudWatch logs"
    aws logs describe-log-groups --log-group-name-prefix "/art-knowledge-graph/${env}/" | \
    jq -r '.logGroups[].logGroupName' | while read -r log_group; do
        aws logs delete-log-group --log-group-name "${log_group}" || {
            log "WARNING" "Failed to delete log group: ${log_group}"
        }
    done

    # Clean up ECR repositories
    log "INFO" "Cleaning up ECR repositories"
    aws ecr describe-repositories --query "repositories[?contains(repositoryName, '${env}')].repositoryName" | \
    jq -r '.[]' | while read -r repo; do
        aws ecr delete-repository --repository-name "${repo}" --force || {
            log "WARNING" "Failed to delete ECR repository: ${repo}"
        }
    done

    return 0
}

main() {
    if [ "$#" -ne 1 ]; then
        log "ERROR" "Usage: $0 <environment>"
        exit 1
    fi

    local env=$1
    
    # Validate environment and confirm destruction
    check_environment "${env}" || {
        log "ERROR" "Environment validation failed"
        exit 1
    }

    # Backup critical data
    backup_critical_data "${env}" || {
        log "ERROR" "Critical data backup failed"
        exit 1
    }

    # Destroy infrastructure
    destroy_environment "${env}" || {
        log "ERROR" "Environment destruction failed"
        exit 1
    }

    # Cleanup remaining resources
    cleanup_resources "${env}" || {
        log "ERROR" "Resource cleanup failed"
        exit 1
    }

    log "INFO" "Infrastructure destruction completed successfully"
}

main "$@"