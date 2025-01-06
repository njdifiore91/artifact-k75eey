#!/usr/bin/env bash

# =============================================================================
# Art Knowledge Graph - Terraform Initialization Script
# Version: 1.0.0
# 
# This script initializes the Terraform environment and backend configuration
# for the Art Knowledge Graph infrastructure deployment.
# =============================================================================

# Strict error checking
set -euo pipefail
IFS=$'\n\t'

# =============================================================================
# Global Variables
# =============================================================================
readonly STATE_BUCKET="art-knowledge-graph-terraform-state"
readonly LOCK_TABLE="art-knowledge-graph-terraform-locks"
readonly KMS_KEY_ALIAS="alias/terraform-state-key"
readonly PRIMARY_REGION="us-east-1"
readonly DR_REGION="us-west-2"
readonly LOG_LEVEL="INFO"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"

# =============================================================================
# Logging Functions
# =============================================================================
log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    echo "[${timestamp}] [${level}] ${message}"
    
    if [[ "${level}" == "ERROR" ]]; then
        echo "[${timestamp}] [${level}] ${message}" >&2
    fi
}

# =============================================================================
# Error Handling
# =============================================================================
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR" "Script failed with exit code: ${exit_code}"
    fi
    exit $exit_code
}

trap cleanup EXIT
trap 'log "ERROR" "Received signal SIGINT"; exit 1' SIGINT
trap 'log "ERROR" "Received signal SIGTERM"; exit 1' SIGTERM

# =============================================================================
# Prerequisite Check Functions
# =============================================================================
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log "ERROR" "AWS CLI is not installed"
        return 1
    fi

    # Check AWS CLI version
    local aws_version
    aws_version=$(aws --version | cut -d/ -f2 | cut -d. -f1)
    if [[ "${aws_version}" -lt 2 ]]; then
        log "ERROR" "AWS CLI version must be >= 2.0"
        return 1
    fi

    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log "ERROR" "Terraform is not installed"
        return 1
    fi

    # Check Terraform version
    if ! terraform version -json | grep -q '"version":"[1-9]\.[5-9]'; then
        log "ERROR" "Terraform version must be >= 1.5.0"
        return 1
    }

    # Verify AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "AWS credentials not configured or invalid"
        return 1
    }

    log "INFO" "Prerequisites check passed"
    return 0
}

# =============================================================================
# KMS Key Management Functions
# =============================================================================
create_kms_key() {
    log "INFO" "Creating KMS key for state encryption..."

    # Check if key alias exists
    if ! aws kms describe-key --key-id "${KMS_KEY_ALIAS}" --region "${PRIMARY_REGION}" &> /dev/null; then
        # Create KMS key
        local key_id
        key_id=$(aws kms create-key \
            --description "Terraform state encryption key for Art Knowledge Graph" \
            --region "${PRIMARY_REGION}" \
            --tags Key=Project,Value=ArtKnowledgeGraph Key=Environment,Value=Infrastructure \
            --enable-key-rotation \
            --query 'KeyMetadata.KeyId' \
            --output text)

        # Create alias
        aws kms create-alias \
            --alias-name "${KMS_KEY_ALIAS}" \
            --target-key-id "${key_id}" \
            --region "${PRIMARY_REGION}"

        # Replicate to DR region
        aws kms replicate-key \
            --key-id "${key_id}" \
            --replica-region "${DR_REGION}" \
            --region "${PRIMARY_REGION}"

        log "INFO" "KMS key created successfully"
    else
        log "INFO" "KMS key already exists"
    fi
}

# =============================================================================
# S3 State Bucket Functions
# =============================================================================
create_state_bucket() {
    log "INFO" "Creating S3 bucket for Terraform state..."

    # Check if bucket exists
    if ! aws s3api head-bucket --bucket "${STATE_BUCKET}" 2>/dev/null; then
        # Create bucket in primary region
        aws s3api create-bucket \
            --bucket "${STATE_BUCKET}" \
            --region "${PRIMARY_REGION}" \
            --create-bucket-configuration LocationConstraint="${PRIMARY_REGION}"

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "${STATE_BUCKET}" \
            --versioning-configuration Status=Enabled

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "${STATE_BUCKET}" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "aws:kms",
                        "KMSMasterKeyID": "'${KMS_KEY_ALIAS}'"
                    },
                    "BucketKeyEnabled": true
                }]
            }'

        # Enable replication to DR region
        local replication_role
        replication_role="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/terraform-state-replication"
        
        aws s3api put-bucket-replication \
            --bucket "${STATE_BUCKET}" \
            --replication-configuration '{
                "Role": "'${replication_role}'",
                "Rules": [{
                    "Status": "Enabled",
                    "Destination": {
                        "Bucket": "arn:aws:s3:::'${STATE_BUCKET}'-dr",
                        "Region": "'${DR_REGION}'"
                    }
                }]
            }'

        log "INFO" "S3 bucket created successfully"
    else
        log "INFO" "S3 bucket already exists"
    fi
}

# =============================================================================
# DynamoDB Lock Table Functions
# =============================================================================
create_lock_table() {
    log "INFO" "Creating DynamoDB table for state locking..."

    # Check if table exists
    if ! aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${PRIMARY_REGION}" &> /dev/null; then
        # Create table
        aws dynamodb create-table \
            --table-name "${LOCK_TABLE}" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
            --region "${PRIMARY_REGION}" \
            --tags Key=Project,Value=ArtKnowledgeGraph Key=Environment,Value=Infrastructure

        # Enable point-in-time recovery
        aws dynamodb update-continuous-backups \
            --table-name "${LOCK_TABLE}" \
            --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
            --region "${PRIMARY_REGION}"

        # Create global table (replicate to DR region)
        aws dynamodb create-global-table \
            --global-table-name "${LOCK_TABLE}" \
            --replication-group RegionName="${PRIMARY_REGION}" RegionName="${DR_REGION}" \
            --region "${PRIMARY_REGION}"

        log "INFO" "DynamoDB table created successfully"
    else
        log "INFO" "DynamoDB table already exists"
    fi
}

# =============================================================================
# Terraform Initialization Functions
# =============================================================================
initialize_terraform() {
    log "INFO" "Initializing Terraform..."

    # Navigate to Terraform directory
    cd "${TERRAFORM_DIR}"

    # Generate backend configuration
    cat > backend.tf <<EOF
terraform {
  backend "s3" {
    bucket         = "${STATE_BUCKET}"
    key            = "terraform.tfstate"
    region         = "${PRIMARY_REGION}"
    dynamodb_table = "${LOCK_TABLE}"
    encrypt        = true
    kms_key_id     = "${KMS_KEY_ALIAS}"
  }
}
EOF

    # Initialize Terraform
    terraform init \
        -backend=true \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="key=terraform.tfstate" \
        -backend-config="region=${PRIMARY_REGION}" \
        -backend-config="dynamodb_table=${LOCK_TABLE}" \
        -backend-config="encrypt=true" \
        -backend-config="kms_key_id=${KMS_KEY_ALIAS}"

    # Validate configuration
    terraform validate

    log "INFO" "Terraform initialized successfully"
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    log "INFO" "Starting Terraform initialization script..."

    # Check prerequisites
    check_prerequisites || exit 1

    # Create infrastructure components
    create_kms_key
    create_state_bucket
    create_lock_table
    initialize_terraform

    log "INFO" "Terraform initialization completed successfully"
}

# Execute main function
main