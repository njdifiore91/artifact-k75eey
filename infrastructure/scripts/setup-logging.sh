#!/bin/bash

# Art Knowledge Graph Logging Infrastructure Setup Script
# Version: 1.0
# Dependencies: aws-cli v2.0+, kubectl v1.25+

set -euo pipefail

# Global configuration
readonly LOG_RETENTION_DAYS=90
readonly TRACE_RETENTION_DAYS=30
readonly SCRAPE_INTERVAL="15s"
readonly BACKUP_RETENTION_DAYS=365
readonly ALERT_NOTIFICATION_CHANNEL="slack-monitoring"
readonly HA_REPLICA_COUNT=3

# Environment variables validation
validate_env_vars() {
    required_vars=(
        "ENV"
        "AWS_REGION"
        "AWS_ACCESS_KEY"
        "AWS_SECRET_KEY"
        "METRICS_USER"
        "METRICS_PASSWORD"
        "ALERTMANAGER_USER"
        "ALERTMANAGER_PASSWORD"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "Error: Required environment variable $var is not set"
            exit 1
        fi
    done
}

# S3 bucket setup for logs and traces
setup_s3_buckets() {
    local environment=$1
    local region=$2

    echo "Setting up S3 buckets for logging infrastructure..."

    # Create logs bucket
    aws s3api create-bucket \
        --bucket "art-knowledge-graph-logs-${environment}" \
        --region "${region}" \
        --create-bucket-configuration LocationConstraint="${region}"

    # Create traces bucket
    aws s3api create-bucket \
        --bucket "art-knowledge-graph-traces-${environment}" \
        --region "${region}" \
        --create-bucket-configuration LocationConstraint="${region}"

    # Configure bucket encryption
    for bucket in "logs" "traces"; do
        aws s3api put-bucket-encryption \
            --bucket "art-knowledge-graph-${bucket}-${environment}" \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }'

        # Configure lifecycle rules
        aws s3api put-bucket-lifecycle-configuration \
            --bucket "art-knowledge-graph-${bucket}-${environment}" \
            --lifecycle-configuration '{
                "Rules": [
                    {
                        "ID": "RetentionRule",
                        "Status": "Enabled",
                        "ExpirationInDays": '"$LOG_RETENTION_DAYS"',
                        "Transitions": [
                            {
                                "Days": 30,
                                "StorageClass": "STANDARD_IA"
                            }
                        ]
                    }
                ]
            }'

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "art-knowledge-graph-${bucket}-${environment}" \
            --versioning-configuration Status=Enabled
    done
}

# Deploy Loki for log aggregation
deploy_loki() {
    local environment=$1

    echo "Deploying Loki log aggregation..."

    # Create Loki namespace if it doesn't exist
    kubectl create namespace logging --dry-run=client -o yaml | kubectl apply -f -

    # Apply Loki configuration
    kubectl create configmap loki-config \
        --from-file=loki.yml=infrastructure/monitoring/loki/loki.yml \
        -n logging --dry-run=client -o yaml | kubectl apply -f -

    # Deploy Loki StatefulSet
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: loki
  namespace: logging
spec:
  replicas: $HA_REPLICA_COUNT
  selector:
    matchLabels:
      app: loki
  serviceName: loki
  template:
    metadata:
      labels:
        app: loki
    spec:
      containers:
        - name: loki
          image: grafana/loki:2.8.0
          ports:
            - containerPort: 3100
              name: http
            - containerPort: 9096
              name: grpc
          volumeMounts:
            - name: config
              mountPath: /etc/loki
            - name: data
              mountPath: /loki
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 1
              memory: 1Gi
      volumes:
        - name: config
          configMap:
            name: loki-config
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 10Gi
EOF
}

# Deploy Tempo for distributed tracing
deploy_tempo() {
    local environment=$1

    echo "Deploying Tempo distributed tracing..."

    # Create Tempo namespace if it doesn't exist
    kubectl create namespace tracing --dry-run=client -o yaml | kubectl apply -f -

    # Apply Tempo configuration
    kubectl create configmap tempo-config \
        --from-file=tempo.yml=infrastructure/monitoring/tempo/tempo.yml \
        -n tracing --dry-run=client -o yaml | kubectl apply -f -

    # Deploy Tempo StatefulSet
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: tempo
  namespace: tracing
spec:
  replicas: $HA_REPLICA_COUNT
  selector:
    matchLabels:
      app: tempo
  serviceName: tempo
  template:
    metadata:
      labels:
        app: tempo
    spec:
      containers:
        - name: tempo
          image: grafana/tempo:2.1.0
          ports:
            - containerPort: 3200
              name: http
            - containerPort: 9095
              name: grpc
          volumeMounts:
            - name: config
              mountPath: /etc/tempo
            - name: data
              mountPath: /tmp/tempo
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2
              memory: 2Gi
      volumes:
        - name: config
          configMap:
            name: tempo-config
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 50Gi
EOF
}

# Configure Prometheus for metrics monitoring
configure_prometheus() {
    local environment=$1

    echo "Configuring Prometheus metrics monitoring..."

    # Create Prometheus namespace if it doesn't exist
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

    # Apply Prometheus configuration
    kubectl create configmap prometheus-config \
        --from-file=prometheus.yml=infrastructure/monitoring/prometheus/prometheus.yml \
        --from-file=alerts.yml=infrastructure/monitoring/prometheus/rules/alerts.yml \
        --from-file=recording.yml=infrastructure/monitoring/prometheus/rules/recording.yml \
        -n monitoring --dry-run=client -o yaml | kubectl apply -f -

    # Deploy Prometheus StatefulSet
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: $HA_REPLICA_COUNT
  selector:
    matchLabels:
      app: prometheus
  serviceName: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
        - name: prometheus
          image: prom/prometheus:v2.40.0
          args:
            - "--config.file=/etc/prometheus/prometheus.yml"
            - "--storage.tsdb.retention.time=15d"
            - "--web.enable-lifecycle"
          ports:
            - containerPort: 9090
              name: http
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
            - name: data
              mountPath: /prometheus
          resources:
            requests:
              cpu: 500m
              memory: 2Gi
            limits:
              cpu: 2
              memory: 4Gi
      volumes:
        - name: config
          configMap:
            name: prometheus-config
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 100Gi
EOF
}

# Verify logging infrastructure setup
verify_setup() {
    local environment=$1

    echo "Verifying logging infrastructure setup..."

    # Check S3 buckets
    for bucket in "logs" "traces"; do
        if ! aws s3api head-bucket --bucket "art-knowledge-graph-${bucket}-${environment}" 2>/dev/null; then
            echo "Error: Bucket art-knowledge-graph-${bucket}-${environment} not found"
            return 1
        fi
    done

    # Check Kubernetes deployments
    for deployment in "loki" "tempo" "prometheus"; do
        if ! kubectl get statefulset -n "${deployment/-*/}" "${deployment}" >/dev/null 2>&1; then
            echo "Error: ${deployment} deployment not found"
            return 1
        fi
    done

    # Verify services are running
    for service in "loki" "tempo" "prometheus"; do
        if [[ $(kubectl get pods -n "${service/-*/}" -l "app=${service}" -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running") -lt $HA_REPLICA_COUNT ]]; then
            echo "Error: ${service} does not have enough running replicas"
            return 1
        fi
    done

    echo "Logging infrastructure verification completed successfully"
    return 0
}

# Main execution
main() {
    local environment="${ENV}"
    local region="${AWS_REGION}"

    # Validate environment variables
    validate_env_vars

    # Setup infrastructure components
    setup_s3_buckets "$environment" "$region"
    deploy_loki "$environment"
    deploy_tempo "$environment"
    configure_prometheus "$environment"

    # Verify setup
    verify_setup "$environment"
}

# Execute main function
main "$@"