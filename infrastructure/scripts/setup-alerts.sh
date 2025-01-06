#!/bin/bash

# Setup Alerts Script for Art Knowledge Graph Application
# Version: 1.0
# Dependencies: curl 7.0+, jq 1.6+
# Purpose: Configure comprehensive monitoring alerts across the infrastructure

set -euo pipefail

# Global variables
PROMETHEUS_URL=${PROMETHEUS_URL:-"http://prometheus:9090"}
ALERTMANAGER_URL=${ALERTMANAGER_URL:-"http://alertmanager:9093"}
GRAFANA_URL=${GRAFANA_URL:-"http://grafana:3000"}
CONFIG_DIR=${CONFIG_DIR:-"/etc/prometheus"}
BACKUP_DIR="${CONFIG_DIR}/backups/$(date +%Y%m%d)"
LOG_FILE="/var/log/setup-alerts.log"

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Validate prerequisites
validate_prerequisites() {
    local missing_deps=()
    
    # Check required tools
    for cmd in curl jq promtool amtool; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log "ERROR" "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    # Verify access to monitoring endpoints
    for endpoint in "$PROMETHEUS_URL" "$ALERTMANAGER_URL" "$GRAFANA_URL"; do
        if ! curl -sf "$endpoint/-/healthy" >/dev/null 2>&1; then
            log "ERROR" "Cannot access $endpoint"
            exit 1
        fi
    done
}

# Setup Prometheus alerts
setup_prometheus_alerts() {
    local rules_file=$1
    local temp_file
    temp_file=$(mktemp)
    
    log "INFO" "Setting up Prometheus alerts from $rules_file"
    
    # Backup existing rules
    mkdir -p "$BACKUP_DIR"
    if [ -f "${CONFIG_DIR}/rules/alerts.yml" ]; then
        cp "${CONFIG_DIR}/rules/alerts.yml" "${BACKUP_DIR}/alerts.yml.bak"
    fi
    
    # Validate rules syntax
    if ! promtool check rules "$rules_file"; then
        log "ERROR" "Invalid alert rules syntax in $rules_file"
        return 1
    fi
    
    # Copy and reload rules
    cp "$rules_file" "${CONFIG_DIR}/rules/alerts.yml"
    
    # Reload Prometheus configuration
    if ! curl -X POST "${PROMETHEUS_URL}/-/reload" 2>/dev/null; then
        log "ERROR" "Failed to reload Prometheus configuration"
        return 1
    fi
    
    # Verify rules are loaded
    if ! curl -sf "${PROMETHEUS_URL}/api/v1/rules" | jq -e '.data.groups[].rules[] | select(.type=="alerting")' >/dev/null; then
        log "ERROR" "Alert rules not properly loaded in Prometheus"
        return 1
    fi
    
    log "INFO" "Successfully configured Prometheus alerts"
    return 0
}

# Setup AlertManager
setup_alertmanager() {
    local config_file=$1
    
    log "INFO" "Setting up AlertManager with config $config_file"
    
    # Backup existing config
    if [ -f "${CONFIG_DIR}/alertmanager.yml" ]; then
        cp "${CONFIG_DIR}/alertmanager.yml" "${BACKUP_DIR}/alertmanager.yml.bak"
    fi
    
    # Validate AlertManager config
    if ! amtool check-config "$config_file"; then
        log "ERROR" "Invalid AlertManager configuration"
        return 1
    }
    
    # Test notification channels
    for channel in slack email pagerduty; do
        if ! amtool check-config --receiver="$channel" "$config_file"; then
            log "WARN" "Configuration issue with $channel notification channel"
        fi
    done
    
    # Apply configuration
    cp "$config_file" "${CONFIG_DIR}/alertmanager.yml"
    
    # Reload AlertManager
    if ! curl -X POST "${ALERTMANAGER_URL}/-/reload" 2>/dev/null; then
        log "ERROR" "Failed to reload AlertManager configuration"
        return 1
    }
    
    log "INFO" "Successfully configured AlertManager"
    return 0
}

# Setup Grafana alerts
setup_grafana_alerts() {
    local dashboard_file=$1
    local api_key=${GRAFANA_API_KEY:-""}
    
    if [ -z "$api_key" ]; then
        log "ERROR" "Grafana API key not provided"
        return 1
    }
    
    log "INFO" "Setting up Grafana alerts from $dashboard_file"
    
    # Validate dashboard JSON
    if ! jq empty "$dashboard_file" 2>/dev/null; then
        log "ERROR" "Invalid dashboard JSON format"
        return 1
    }
    
    # Import dashboard with alerts
    if ! curl -X POST -H "Authorization: Bearer $api_key" \
         -H "Content-Type: application/json" \
         -d "@$dashboard_file" \
         "${GRAFANA_URL}/api/dashboards/db" 2>/dev/null; then
        log "ERROR" "Failed to import Grafana dashboard"
        return 1
    }
    
    log "INFO" "Successfully configured Grafana alerts"
    return 0
}

# Validate alert configurations
validate_alert_config() {
    local validation_errors=0
    
    log "INFO" "Validating alert configurations"
    
    # Check Prometheus rules
    if ! promtool check rules "${CONFIG_DIR}/rules/alerts.yml"; then
        log "ERROR" "Prometheus rules validation failed"
        ((validation_errors++))
    fi
    
    # Check AlertManager config
    if ! amtool check-config "${CONFIG_DIR}/alertmanager.yml"; then
        log "ERROR" "AlertManager config validation failed"
        ((validation_errors++))
    fi
    
    # Test alert routing
    if ! curl -sf "${ALERTMANAGER_URL}/api/v2/status" >/dev/null; then
        log "ERROR" "AlertManager routing test failed"
        ((validation_errors++))
    fi
    
    # Verify Grafana alert conditions
    if ! curl -sf -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
         "${GRAFANA_URL}/api/alerts" >/dev/null; then
        log "ERROR" "Grafana alerts validation failed"
        ((validation_errors++))
    fi
    
    if [ "$validation_errors" -gt 0 ]; then
        log "ERROR" "Alert configuration validation failed with $validation_errors errors"
        return 1
    fi
    
    log "INFO" "Alert configuration validation successful"
    return 0
}

# Main setup function
main() {
    log "INFO" "Starting alert setup process"
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Setup Prometheus alerts
    if ! setup_prometheus_alerts "${CONFIG_DIR}/rules/alerts.yml"; then
        log "ERROR" "Failed to setup Prometheus alerts"
        exit 1
    fi
    
    # Setup AlertManager
    if ! setup_alertmanager "${CONFIG_DIR}/alertmanager.yml"; then
        log "ERROR" "Failed to setup AlertManager"
        exit 1
    fi
    
    # Setup Grafana alerts
    if ! setup_grafana_alerts "${CONFIG_DIR}/grafana/dashboards/api-gateway.json"; then
        log "ERROR" "Failed to setup Grafana alerts"
        exit 1
    fi
    
    # Validate all configurations
    if ! validate_alert_config; then
        log "ERROR" "Alert configuration validation failed"
        exit 1
    fi
    
    log "INFO" "Alert setup completed successfully"
}

# Execute main function
main "$@"