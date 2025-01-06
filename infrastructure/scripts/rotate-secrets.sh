#!/bin/bash

# Art Knowledge Graph - Secret and Key Rotation Script
# Version: 1.0.0
# Required AWS CLI version: 2.0+
# Required jq version: 1.6+

set -euo pipefail

# Global Constants
readonly ENVIRONMENTS=("dev" "staging" "prod")
readonly SERVICES=("api-gateway" "auth-service" "data-processor" "graph-service")
readonly ROTATION_WINDOW_DAYS=7
readonly MAX_CONCURRENT_ROTATIONS=3
readonly HEALTH_CHECK_RETRIES=5
readonly ROTATION_LOCK_TIMEOUT=3600
readonly LOG_FILE="/var/log/secret-rotation.log"
readonly AUDIT_LOG="/var/log/secret-audit.log"
readonly LOCK_FILE="/tmp/secret-rotation.lock"

# Logging functions
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "${timestamp}|${level}|${ENVIRONMENT:-NA}|${SERVICE:-NA}|${message}" >> "${LOG_FILE}"
}

audit_log() {
    local operation="$1"
    local details="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "${timestamp}|AUDIT|${ENVIRONMENT:-NA}|${SERVICE:-NA}|${operation}|${details}" >> "${AUDIT_LOG}"
}

# Validation functions
validate_environment() {
    local env="$1"
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${env} " ]]; then
        log "ERROR" "Invalid environment: ${env}"
        return 1
    fi
}

validate_service() {
    local svc="$1"
    if [[ ! " ${SERVICES[@]} " =~ " ${svc} " ]]; then
        log "ERROR" "Invalid service: ${svc}"
        return 1
    fi
}

# Lock management
acquire_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        local lock_age=$(($(date +%s) - $(stat -c %Y "${LOCK_FILE}")))
        if [ ${lock_age} -gt ${ROTATION_LOCK_TIMEOUT} ]; then
            log "WARN" "Stale lock found, removing"
            rm -f "${LOCK_FILE}"
        else
            log "ERROR" "Another rotation process is running"
            return 1
        fi
    fi
    echo $$ > "${LOCK_FILE}"
}

release_lock() {
    rm -f "${LOCK_FILE}"
}

# KMS key rotation
rotate_kms_key() {
    local environment="$1"
    local key_alias="$2"
    
    log "INFO" "Starting KMS key rotation for ${key_alias}"
    
    # Verify current key status
    local current_key_id=$(aws kms describe-key --key-id "alias/${key_alias}" \
        --query 'KeyMetadata.KeyId' --output text)
    
    if [ -z "${current_key_id}" ]; then
        log "ERROR" "Failed to retrieve current key ID"
        return 2
    }
    
    # Create new key
    local new_key_id=$(aws kms create-key \
        --description "Rotated key for ${key_alias}" \
        --tags "TagKey=Environment,TagValue=${environment}" \
        --query 'KeyMetadata.KeyId' --output text)
    
    # Validate new key
    local test_data="rotation_test_$(date +%s)"
    local encrypted=$(aws kms encrypt \
        --key-id "${new_key_id}" \
        --plaintext "${test_data}" \
        --query 'CiphertextBlob' --output text)
    
    local decrypted=$(aws kms decrypt \
        --key-id "${new_key_id}" \
        --ciphertext-blob "${encrypted}" \
        --query 'Plaintext' --output text)
    
    if [ "${test_data}" != "${decrypted}" ]; then
        log "ERROR" "Key validation failed"
        return 3
    }
    
    # Update alias
    aws kms update-alias \
        --alias-name "alias/${key_alias}" \
        --target-key-id "${new_key_id}"
    
    # Schedule old key deletion
    aws kms schedule-key-deletion \
        --key-id "${current_key_id}" \
        --pending-window-in-days "${ROTATION_WINDOW_DAYS}"
    
    audit_log "KMS_ROTATION" "Rotated ${key_alias} from ${current_key_id} to ${new_key_id}"
    return 0
}

# Secrets rotation
rotate_secrets() {
    local environment="$1"
    local service_name="$2"
    
    log "INFO" "Starting secrets rotation for ${service_name}"
    
    # List secrets for service
    local secrets=$(aws secretsmanager list-secrets \
        --filters Key=tag-key,Values=Service Key=tag-value,Values="${service_name}" \
        --query 'SecretList[].ARN' --output text)
    
    for secret_arn in ${secrets}; do
        log "INFO" "Rotating secret: ${secret_arn}"
        
        # Create backup
        local backup_value=$(aws secretsmanager get-secret-value \
            --secret-id "${secret_arn}" \
            --query 'SecretString' --output text)
        
        # Rotate secret
        aws secretsmanager rotate-secret --secret-id "${secret_arn}"
        
        # Verify rotation
        local retry_count=0
        while [ ${retry_count} -lt ${HEALTH_CHECK_RETRIES} ]; do
            if aws secretsmanager describe-secret \
                --secret-id "${secret_arn}" \
                --query 'RotationEnabled' --output text; then
                break
            fi
            ((retry_count++))
            sleep 5
        done
        
        if [ ${retry_count} -eq ${HEALTH_CHECK_RETRIES} ]; then
            log "ERROR" "Secret rotation verification failed: ${secret_arn}"
            # Restore backup
            aws secretsmanager put-secret-value \
                --secret-id "${secret_arn}" \
                --secret-string "${backup_value}"
            return 4
        fi
        
        audit_log "SECRET_ROTATION" "Rotated secret: ${secret_arn}"
    done
    
    return 0
}

# Service configuration update
update_service_configs() {
    local environment="$1"
    local service_name="$2"
    local secret_arns="$3"
    
    log "INFO" "Updating service configurations for ${service_name}"
    
    # Update ECS service
    local cluster_name="${environment}-art-knowledge-graph"
    local service_arn=$(aws ecs list-services \
        --cluster "${cluster_name}" \
        --query "serviceArns[?contains(@, '${service_name}')]" \
        --output text)
    
    if [ -n "${service_arn}" ]; then
        # Get current task definition
        local task_def=$(aws ecs describe-services \
            --cluster "${cluster_name}" \
            --services "${service_arn}" \
            --query 'services[0].taskDefinition' \
            --output text)
        
        # Create new task definition with updated secrets
        local new_task_def=$(aws ecs register-task-definition \
            --family "${service_name}" \
            --cli-input-json "$(aws ecs describe-task-definition \
                --task-definition "${task_def}" \
                --query 'taskDefinition' \
                --output json | \
                jq --arg arns "${secret_arns}" \
                '.containerDefinitions[].secrets = ($arns | fromjson)')")
        
        # Update service
        aws ecs update-service \
            --cluster "${cluster_name}" \
            --service "${service_name}" \
            --task-definition "${new_task_def}"
        
        # Monitor deployment
        local retry_count=0
        while [ ${retry_count} -lt ${HEALTH_CHECK_RETRIES} ]; do
            local status=$(aws ecs describe-services \
                --cluster "${cluster_name}" \
                --services "${service_name}" \
                --query 'services[0].deployments[0].status' \
                --output text)
            
            if [ "${status}" = "PRIMARY" ]; then
                break
            fi
            ((retry_count++))
            sleep 10
        done
        
        if [ ${retry_count} -eq ${HEALTH_CHECK_RETRIES} ]; then
            log "ERROR" "Service update failed: ${service_name}"
            return 5
        fi
        
        audit_log "SERVICE_UPDATE" "Updated service configuration: ${service_name}"
    fi
    
    return 0
}

# Main execution
main() {
    local environment="$1"
    local operation="$2"
    shift 2
    
    validate_environment "${environment}" || exit 1
    
    if ! acquire_lock; then
        log "ERROR" "Failed to acquire rotation lock"
        exit 6
    fi
    
    trap release_lock EXIT
    
    export ENVIRONMENT="${environment}"
    
    case "${operation}" in
        "rotate-keys")
            for service in "${SERVICES[@]}"; do
                export SERVICE="${service}"
                rotate_kms_key "${environment}" "${service}-key" || exit 3
            done
            ;;
        "rotate-secrets")
            for service in "${SERVICES[@]}"; do
                export SERVICE="${service}"
                rotate_secrets "${environment}" "${service}" || exit 4
            done
            ;;
        *)
            log "ERROR" "Invalid operation: ${operation}"
            exit 1
            ;;
    esac
    
    log "INFO" "Rotation completed successfully"
    exit 0
}

# Script entry point
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <environment> <operation>"
    echo "Operations: rotate-keys, rotate-secrets"
    exit 1
fi

main "$@"