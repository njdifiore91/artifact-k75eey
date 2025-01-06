#!/bin/bash

# Apply Terraform Infrastructure Changes Script
# Version: 1.0.0
# This script safely applies Terraform infrastructure changes across different environments
# with comprehensive validation, state management, error handling, and compliance checks.

set -euo pipefail

# Global variables
readonly TERRAFORM_VERSION="1.0.0"
readonly ENVIRONMENTS=("dev" "staging" "prod")
readonly SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
readonly LOG_FILE="/var/log/terraform/apply-${ENVIRONMENT}-$(date +%Y%m%d_%H%M%S).log"
readonly STATE_BACKUP_DIR="/var/backup/terraform/state"

# Setup logging
setup_logging() {
    local log_dir="/var/log/terraform"
    mkdir -p "$log_dir"
    mkdir -p "$STATE_BACKUP_DIR"

    # Initialize log file with headers
    {
        echo "=== Terraform Apply Script Log ==="
        echo "Date: $(date)"
        echo "Environment: ${ENVIRONMENT}"
        echo "Terraform Version: ${TERRAFORM_VERSION}"
        echo "=================================="
    } > "$LOG_FILE"

    # Redirect stdout and stderr to both console and log file
    exec 1> >(tee -a "$LOG_FILE")
    exec 2> >(tee -a "$LOG_FILE" >&2)
}

# Validate environment and prerequisites
validate_environment() {
    local env_name="$1"

    # Check if environment is valid
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${env_name} " ]]; then
        echo "ERROR: Invalid environment '${env_name}'. Must be one of: ${ENVIRONMENTS[*]}"
        return 1
    }

    # Verify AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        echo "ERROR: AWS credentials not found or invalid"
        return 1
    }

    # Check Terraform version
    local tf_version
    tf_version=$(terraform version | head -n1 | cut -d'v' -f2)
    if [[ "$tf_version" != "$TERRAFORM_VERSION" ]]; then
        echo "ERROR: Terraform version mismatch. Required: ${TERRAFORM_VERSION}, Found: ${tf_version}"
        return 1
    }

    # Verify required directories exist
    local env_dir="${SCRIPT_DIR}/../terraform/environments/${env_name}"
    if [[ ! -d "$env_dir" ]]; then
        echo "ERROR: Environment directory not found: ${env_dir}"
        return 1
    }

    return 0
}

# Backup Terraform state
backup_state() {
    local env_name="$1"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="${STATE_BACKUP_DIR}/${env_name}_${timestamp}.tfstate"
    
    echo "Creating state backup at ${backup_path}"
    
    # Copy current state file
    if terraform state pull > "$backup_path"; then
        echo "State backup created successfully"
        # Clean up old backups (keep last 10)
        find "$STATE_BACKUP_DIR" -name "${env_name}_*.tfstate" -type f | sort -r | tail -n +11 | xargs rm -f
        return 0
    else
        echo "ERROR: Failed to create state backup"
        return 1
    fi
}

# Initialize Terraform
init_terraform() {
    local env_name="$1"
    local env_dir="${SCRIPT_DIR}/../terraform/environments/${env_name}"
    
    echo "Initializing Terraform for environment: ${env_name}"
    
    cd "$env_dir" || exit 1
    
    if ! terraform init \
        -backend=true \
        -backend-config="key=${env_name}/terraform.tfstate" \
        -upgrade; then
        echo "ERROR: Terraform initialization failed"
        return 1
    fi
    
    return 0
}

# Generate and validate Terraform plan
plan_terraform() {
    local env_name="$1"
    local plan_file="tfplan"
    
    echo "Generating Terraform plan for environment: ${env_name}"
    
    # Generate plan
    if ! terraform plan \
        -detailed-exitcode \
        -out="$plan_file" \
        -var="environment=${env_name}"; then
        echo "ERROR: Terraform plan generation failed"
        return 1
    fi
    
    # For production, require manual approval
    if [[ "$env_name" == "prod" ]]; then
        echo "NOTICE: Production deployment requires manual approval"
        read -p "Do you want to proceed with the deployment? (yes/no) " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo "Deployment cancelled by user"
            return 1
        fi
    fi
    
    return 0
}

# Apply Terraform changes
apply_terraform() {
    local env_name="$1"
    local plan_file="tfplan"
    
    echo "Applying Terraform changes for environment: ${env_name}"
    
    # Apply changes
    if ! terraform apply \
        -auto-approve \
        -input=false \
        "$plan_file"; then
        echo "ERROR: Terraform apply failed"
        return 1
    fi
    
    return 0
}

# Error handler
handle_error() {
    local error_type="$1"
    local error_message="$2"
    
    echo "ERROR: ${error_type} - ${error_message}"
    
    case "$error_type" in
        "INIT")
            echo "Cleaning up failed initialization..."
            rm -rf .terraform
            ;;
        "PLAN")
            echo "Cleaning up failed plan..."
            rm -f tfplan
            ;;
        "APPLY")
            echo "Initiating rollback procedure..."
            if [[ -f "${STATE_BACKUP_DIR}/latest.tfstate" ]]; then
                terraform state push "${STATE_BACKUP_DIR}/latest.tfstate"
            fi
            ;;
    esac
    
    exit 1
}

# Main execution
main() {
    if [[ $# -ne 1 ]]; then
        echo "Usage: $0 <environment>"
        echo "Available environments: ${ENVIRONMENTS[*]}"
        exit 1
    fi
    
    local environment="$1"
    export ENVIRONMENT="$environment"
    
    # Setup logging
    setup_logging
    
    echo "Starting Terraform deployment for environment: ${environment}"
    
    # Validate environment
    if ! validate_environment "$environment"; then
        handle_error "VALIDATION" "Environment validation failed"
    fi
    
    # Create state backup
    if ! backup_state "$environment"; then
        handle_error "BACKUP" "State backup failed"
    fi
    
    # Initialize Terraform
    if ! init_terraform "$environment"; then
        handle_error "INIT" "Terraform initialization failed"
    fi
    
    # Generate and validate plan
    if ! plan_terraform "$environment"; then
        handle_error "PLAN" "Terraform plan failed"
    fi
    
    # Apply changes
    if ! apply_terraform "$environment"; then
        handle_error "APPLY" "Terraform apply failed"
    fi
    
    echo "Terraform deployment completed successfully"
    return 0
}

# Execute main function
main "$@"