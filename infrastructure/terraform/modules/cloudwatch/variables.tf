# Environment variable with validation to ensure only allowed values
variable "environment" {
  description = "Environment name (dev, staging, prod) for resource naming and tagging"
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Log retention configuration with validation for valid range
variable "retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
  
  validation {
    condition     = var.retention_days >= 1 && var.retention_days <= 365
    error_message = "Retention days must be between 1 and 365"
  }
}

# Metric namespace configuration
variable "metric_namespace" {
  description = "CloudWatch metrics namespace for the application"
  type        = string
  default     = "ArtKnowledgeGraph"
}

# Alarm evaluation configuration with validation
variable "alarm_evaluation_periods" {
  description = "Number of periods to evaluate for alarm conditions"
  type        = number
  default     = 3
  
  validation {
    condition     = var.alarm_evaluation_periods >= 1
    error_message = "Alarm evaluation periods must be at least 1"
  }
}

# Alarm period configuration with validation for allowed values
variable "alarm_period_seconds" {
  description = "Period in seconds over which to evaluate alarms"
  type        = number
  default     = 300
  
  validation {
    condition     = contains([60, 300, 900, 3600], var.alarm_period_seconds)
    error_message = "Alarm period must be one of: 60, 300, 900, 3600 seconds"
  }
}

# Dashboard refresh configuration with validation
variable "dashboard_refresh_interval" {
  description = "Refresh interval in seconds for CloudWatch dashboards"
  type        = number
  default     = 60
  
  validation {
    condition     = var.dashboard_refresh_interval >= 60
    error_message = "Dashboard refresh interval must be at least 60 seconds"
  }
}

# SNS topic ARN configuration with validation
variable "alert_notification_arn" {
  description = "ARN of the SNS topic for alarm notifications"
  type        = string
  
  validation {
    condition     = can(regex("^arn:aws:sns:", var.alert_notification_arn))
    error_message = "Alert notification ARN must be a valid SNS topic ARN"
  }
}

# Service names configuration
variable "service_names" {
  description = "List of service names to monitor"
  type        = list(string)
  default     = ["api-gateway", "auth-service", "data-processor", "graph-service"]
}

# Metric dimensions configuration
variable "metric_dimensions" {
  description = "Common dimensions to apply to all metrics"
  type        = map(string)
  default     = {
    Application = "ArtKnowledgeGraph"
  }
}