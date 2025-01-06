# Configure required providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Local variables for configuration
locals {
  monitoring_namespace = var.monitoring_namespace
  storage_class       = var.enable_service_monitors ? "aws-ebs-gp3-ha" : "aws-ebs-gp3"
  retention_period    = "${var.retention_period_days * 24}h"
  common_labels = {
    environment = var.environment
    managed-by  = "terraform"
  }
}

# Create monitoring namespace
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = local.monitoring_namespace
    labels = merge(local.common_labels, {
      name = local.monitoring_namespace
    })
  }
}

# Deploy Prometheus stack
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = var.prometheus_version

  values = [
    yamlencode({
      server = {
        replicaCount = var.enable_service_monitors ? 3 : 1
        retention    = local.retention_period
        persistentVolume = {
          storageClass = local.storage_class
          size         = "50Gi"
        }
        securityContext = {
          runAsNonRoot = true
          runAsUser    = 65534
        }
        resources = {
          requests = {
            cpu    = "500m"
            memory = "2Gi"
          }
          limits = {
            cpu    = "1000m"
            memory = "4Gi"
          }
        }
        global = {
          scrape_interval = "${var.prometheus_scrape_interval}s"
          evaluation_interval = "15s"
        }
      }
      alertmanager = {
        enabled     = var.enable_alerting
        replicaCount = var.enable_service_monitors ? 3 : 1
        config = {
          receivers = var.alert_notification_endpoints
        }
      }
      serviceMonitors = var.enable_service_monitors
    })
  ]

  depends_on = [kubernetes_namespace.monitoring]
}

# Deploy Grafana
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = var.grafana_version

  values = [
    yamlencode({
      replicas = var.enable_service_monitors ? 2 : 1
      persistence = {
        enabled      = true
        storageClass = local.storage_class
        size         = "10Gi"
      }
      adminPassword = var.grafana_admin_password
      plugins       = var.grafana_plugins
      datasources = {
        "prometheus.yaml" = {
          apiVersion  = 1
          datasources = [{
            name      = "Prometheus"
            type      = "prometheus"
            url       = "http://prometheus-server:80"
            access    = "proxy"
            isDefault = true
          }]
        }
        "loki.yaml" = {
          apiVersion  = 1
          datasources = [{
            name = "Loki"
            type = "loki"
            url  = "http://loki:3100"
          }]
        }
        "tempo.yaml" = {
          apiVersion  = 1
          datasources = [{
            name = "Tempo"
            type = "tempo"
            url  = "http://tempo:3100"
          }]
        }
      }
      securityContext = {
        runAsNonRoot = true
        runAsUser    = 472
      }
      resources = {
        requests = {
          cpu    = "200m"
          memory = "512Mi"
        }
        limits = {
          cpu    = "500m"
          memory = "1Gi"
        }
      }
    })
  ]

  depends_on = [helm_release.prometheus]
}

# Deploy Loki
resource "helm_release" "loki" {
  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki-stack"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = var.loki_version

  values = [
    yamlencode({
      loki = {
        auth_enabled = true
        storage = {
          type = "s3"
          bucketNames = {
            chunks = "art-knowledge-graph-logs-${var.environment}"
            ruler  = "art-knowledge-graph-rules-${var.environment}"
          }
        }
        persistence = {
          enabled      = true
          storageClass = local.storage_class
          size         = "${var.loki_storage_size}Gi"
        }
        resources = {
          requests = {
            cpu    = "200m"
            memory = "256Mi"
          }
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
        }
      }
      promtail = {
        enabled = true
        config = {
          snippets = {
            extraRelabelConfigs = []
          }
        }
      }
    })
  ]

  depends_on = [kubernetes_namespace.monitoring]
}

# Deploy Tempo
resource "helm_release" "tempo" {
  name       = "tempo"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "tempo"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = var.tempo_version

  values = [
    yamlencode({
      tempo = {
        replicaCount = var.enable_service_monitors ? 3 : 1
        storage = {
          trace = {
            backend = "s3"
            s3 = {
              bucket = "art-knowledge-graph-traces-${var.environment}"
            }
          }
        }
        persistence = {
          enabled      = true
          storageClass = local.storage_class
          size         = "${var.tempo_storage_size}Gi"
        }
        resources = {
          requests = {
            cpu    = "200m"
            memory = "512Mi"
          }
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
        }
      }
    })
  ]

  depends_on = [kubernetes_namespace.monitoring]
}

# Export monitoring endpoints
output "prometheus_endpoint" {
  value = "http://prometheus-server.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local"
}

output "grafana_endpoint" {
  value = "http://grafana.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local"
}

output "loki_endpoint" {
  value = "http://loki.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local:3100"
}

output "tempo_endpoint" {
  value = "http://tempo.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local:3100"
}