# Core environment variables
variable "environment" {
  description = "Environment name (e.g. dev, staging, prod) for resource tagging and configuration"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Network configuration
variable "vpc_id" {
  description = "ID of the VPC where monitoring resources will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs where monitoring components will be deployed"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnet IDs are required for high availability."
  }
}

# Component versions
variable "prometheus_version" {
  description = "Version of Prometheus Helm chart to deploy"
  type        = string
  default     = "15.10.0" # Specify the latest stable version
}

variable "grafana_version" {
  description = "Version of Grafana Helm chart to deploy"
  type        = string
  default     = "6.32.0" # Specify the latest stable version
}

variable "loki_version" {
  description = "Version of Loki Helm chart to deploy"
  type        = string
  default     = "3.8.0" # Specify the latest stable version
}

variable "tempo_version" {
  description = "Version of Tempo Helm chart to deploy"
  type        = string
  default     = "1.0.0" # Specify the latest stable version
}

# Data retention configuration
variable "retention_period_days" {
  description = "Number of days to retain monitoring data"
  type        = number
  default     = 30
  validation {
    condition     = var.retention_period_days >= 7 && var.retention_period_days <= 90
    error_message = "Retention period must be between 7 and 90 days."
  }
}

# Alerting configuration
variable "enable_alerting" {
  description = "Flag to enable alerting configuration"
  type        = bool
  default     = true
}

variable "alert_notification_endpoints" {
  description = "List of endpoints (e.g. Slack webhooks, email addresses) for alert notifications"
  type        = list(string)
  default     = []
  sensitive   = true
}

# Access configuration
variable "grafana_admin_password" {
  description = "Admin password for Grafana dashboard access"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.grafana_admin_password) >= 12
    error_message = "Grafana admin password must be at least 12 characters long."
  }
}

# Kubernetes configuration
variable "monitoring_namespace" {
  description = "Kubernetes namespace where monitoring components will be deployed"
  type        = string
  default     = "monitoring"
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.monitoring_namespace))
    error_message = "Namespace must consist of lowercase alphanumeric characters or '-'."
  }
}

# Resource tagging
variable "tags" {
  description = "Map of tags to apply to all monitoring resources"
  type        = map(string)
  default     = {}
  validation {
    condition     = length(var.tags) <= 50
    error_message = "Maximum of 50 tags can be specified."
  }
}

# Advanced configuration options
variable "prometheus_scrape_interval" {
  description = "Interval at which Prometheus will scrape targets (in seconds)"
  type        = number
  default     = 15
  validation {
    condition     = var.prometheus_scrape_interval >= 10 && var.prometheus_scrape_interval <= 300
    error_message = "Scrape interval must be between 10 and 300 seconds."
  }
}

variable "grafana_plugins" {
  description = "List of Grafana plugins to install"
  type        = list(string)
  default     = ["grafana-piechart-panel", "grafana-worldmap-panel"]
}

variable "loki_storage_size" {
  description = "Storage size for Loki in gigabytes"
  type        = number
  default     = 100
  validation {
    condition     = var.loki_storage_size >= 50
    error_message = "Loki storage size must be at least 50GB."
  }
}

variable "tempo_storage_size" {
  description = "Storage size for Tempo in gigabytes"
  type        = number
  default     = 50
  validation {
    condition     = var.tempo_storage_size >= 20
    error_message = "Tempo storage size must be at least 20GB."
  }
}

variable "enable_service_monitors" {
  description = "Enable Kubernetes ServiceMonitor resources for automatic service discovery"
  type        = bool
  default     = true
}