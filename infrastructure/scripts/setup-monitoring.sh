#!/bin/bash

# Art Knowledge Graph Monitoring Setup Script
# Version: 1.0.0
# Sets up a highly available monitoring stack with Prometheus, Loki, Grafana, and Tempo

set -euo pipefail

# Global variables
MONITORING_NAMESPACE="monitoring"
GRAFANA_VERSION="9.0.0"
PROMETHEUS_VERSION="2.40.0"
LOKI_VERSION="2.8.0"
TEMPO_VERSION="2.0.0"
HA_REPLICAS="3"
RETENTION_DAYS="30"
BACKUP_BUCKET="art-knowledge-monitoring-backup"
TLS_SECRET_NAME="monitoring-tls"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling
error_handler() {
    log "Error occurred in script at line: $1"
    exit 1
}
trap 'error_handler ${LINENO}' ERR

# Validate prerequisites
validate_prerequisites() {
    log "Validating prerequisites..."
    
    # Check required tools
    for tool in kubectl helm aws; do
        if ! command -v $tool &> /dev/null; then
            log "Error: $tool is required but not installed"
            exit 1
        fi
    done

    # Verify Kubernetes connection
    kubectl cluster-info > /dev/null || { log "Error: Cannot connect to Kubernetes cluster"; exit 1; }
    
    # Verify AWS credentials
    aws sts get-caller-identity > /dev/null || { log "Error: Invalid AWS credentials"; exit 1; }
}

# Setup TLS certificates
setup_tls() {
    log "Setting up TLS certificates..."
    
    # Generate self-signed certificates for internal communication
    openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
        -keyout monitoring-key.pem \
        -out monitoring-cert.pem \
        -subj "/CN=monitoring.artknowledge.internal"

    # Create Kubernetes TLS secret
    kubectl create secret tls $TLS_SECRET_NAME \
        --cert=monitoring-cert.pem \
        --key=monitoring-key.pem \
        -n $MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
}

# Setup Prometheus
setup_prometheus() {
    local namespace=$1
    local version=$2
    local replicas=$3
    local retention_days=$4

    log "Setting up Prometheus v${version}..."

    # Add Prometheus Helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    # Create values file for Prometheus
    cat > prometheus-values.yaml <<EOF
prometheus:
  prometheusSpec:
    replicas: ${replicas}
    retention: ${retention_days}d
    serviceMonitorSelector: {}
    podMonitorSelector: {}
    ruleSelector: {}
    securityContext:
      fsGroup: 2000
      runAsNonRoot: true
      runAsUser: 1000
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
    additionalScrapeConfigs:
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
EOF

    # Install Prometheus with custom configuration
    helm upgrade --install prometheus prometheus-community/prometheus \
        --namespace $namespace \
        --version $version \
        --values prometheus-values.yaml \
        --set alertmanager.persistentVolume.enabled=true \
        --set server.persistentVolume.enabled=true \
        --wait
}

# Setup Loki
setup_loki() {
    local namespace=$1
    local version=$2
    local bucket_name=$3
    local retention_days=$4

    log "Setting up Loki v${version}..."

    # Add Loki Helm repo
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Create values file for Loki
    cat > loki-values.yaml <<EOF
loki:
  auth_enabled: true
  storage:
    bucketNames:
      chunks: ${bucket_name}
      ruler: ${bucket_name}-ruler
      admin: ${bucket_name}-admin
    type: s3
    s3:
      region: ${AWS_REGION}
  retention_period: ${retention_days}d
  replicas: ${HA_REPLICAS}
EOF

    # Install Loki with custom configuration
    helm upgrade --install loki grafana/loki \
        --namespace $namespace \
        --version $version \
        --values loki-values.yaml \
        --wait
}

# Setup Grafana
setup_grafana() {
    local namespace=$1
    local version=$2
    local admin_password=$3
    local oauth_config=$4

    log "Setting up Grafana v${version}..."

    # Create values file for Grafana
    cat > grafana-values.yaml <<EOF
grafana:
  replicas: ${HA_REPLICAS}
  persistence:
    enabled: true
    size: 10Gi
  adminPassword: ${admin_password}
  auth:
    oauth:
      enabled: true
      config:
        ${oauth_config}
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-server:9090
          isDefault: true
        - name: Loki
          type: loki
          url: http://loki:3100
EOF

    # Install Grafana with custom configuration
    helm upgrade --install grafana grafana/grafana \
        --namespace $namespace \
        --version $version \
        --values grafana-values.yaml \
        --wait
}

# Verify monitoring stack
verify_monitoring_stack() {
    local namespace=$1
    
    log "Verifying monitoring stack..."

    # Check Prometheus
    kubectl rollout status statefulset/prometheus-server -n $namespace || return 1
    
    # Check Loki
    kubectl rollout status statefulset/loki -n $namespace || return 1
    
    # Check Grafana
    kubectl rollout status deployment/grafana -n $namespace || return 1

    # Verify endpoints are responding
    local prometheus_pod=$(kubectl get pods -n $namespace -l app=prometheus -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n $namespace $prometheus_pod -- wget --spider http://localhost:9090/-/healthy || return 1

    log "All components verified successfully"
}

# Setup backup procedures
setup_backups() {
    log "Setting up backup procedures..."

    # Create S3 bucket for backups if it doesn't exist
    aws s3api create-bucket --bucket $BACKUP_BUCKET \
        --region ${AWS_REGION} \
        --create-bucket-configuration LocationConstraint=${AWS_REGION}

    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket $BACKUP_BUCKET \
        --versioning-configuration Status=Enabled

    # Create backup cronjob
    cat > monitoring-backup.yaml <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: monitoring-backup
  namespace: ${MONITORING_NAMESPACE}
spec:
  schedule: "0 1 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: amazon/aws-cli
            command:
            - /bin/sh
            - -c
            - |
              aws s3 sync /prometheus-data s3://${BACKUP_BUCKET}/prometheus/
              aws s3 sync /loki-data s3://${BACKUP_BUCKET}/loki/
          restartPolicy: OnFailure
EOF

    kubectl apply -f monitoring-backup.yaml
}

# Main setup function
main() {
    log "Starting monitoring stack setup..."

    # Validate prerequisites
    validate_prerequisites

    # Create namespace
    kubectl create namespace $MONITORING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

    # Setup TLS
    setup_tls

    # Setup components
    setup_prometheus $MONITORING_NAMESPACE $PROMETHEUS_VERSION $HA_REPLICAS $RETENTION_DAYS
    setup_loki $MONITORING_NAMESPACE $LOKI_VERSION $BACKUP_BUCKET $RETENTION_DAYS
    setup_grafana $MONITORING_NAMESPACE $GRAFANA_VERSION "${GRAFANA_ADMIN_PASSWORD:-admin}" "${OAUTH_CONFIG:-}"

    # Setup backups
    setup_backups

    # Verify setup
    verify_monitoring_stack $MONITORING_NAMESPACE

    log "Monitoring stack setup completed successfully"
}

# Execute main function
main "$@"