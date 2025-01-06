# AWS Provider version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# CloudWatch Log Groups for each service
resource "aws_cloudwatch_log_group" "service_logs" {
  for_each = toset(var.service_names)

  name              = "/aws/ecs/${var.environment}/${each.value}"
  retention_in_days = var.retention_days

  # Enforce encryption at rest
  kms_key_id = aws_kms_key.log_encryption.arn

  tags = {
    Environment = var.environment
    Service     = each.value
    ManagedBy   = "terraform"
  }
}

# KMS key for log encryption
resource "aws_kms_key" "log_encryption" {
  description             = "KMS key for CloudWatch Logs encryption - ${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Service Error Rate Alarms
resource "aws_cloudwatch_metric_alarm" "service_errors" {
  for_each = toset(var.service_names)

  alarm_name          = "${var.environment}-${each.value}-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarm_evaluation_periods
  metric_name         = "ErrorCount"
  namespace           = var.metric_namespace
  period             = var.alarm_period_seconds
  statistic          = "Sum"
  threshold          = 5 # Alert if more than 5 errors in the evaluation period
  alarm_description  = "Error rate exceeded threshold for ${each.value} in ${var.environment}"

  alarm_actions             = [var.alert_notification_arn]
  ok_actions               = [var.alert_notification_arn]
  insufficient_data_actions = [var.alert_notification_arn]
  treat_missing_data       = "notBreaching"

  dimensions = merge({
    Service     = each.value
    Environment = var.environment
  }, var.metric_dimensions)

  tags = {
    Environment = var.environment
    Service     = each.value
    ManagedBy   = "terraform"
  }
}

# Service Latency Alarms
resource "aws_cloudwatch_metric_alarm" "service_latency" {
  for_each = toset(var.service_names)

  alarm_name          = "${var.environment}-${each.value}-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarm_evaluation_periods
  metric_name         = "Latency"
  namespace           = var.metric_namespace
  period             = var.alarm_period_seconds
  statistic          = "Average"
  threshold          = 1000 # Alert if average latency exceeds 1000ms
  alarm_description  = "High latency detected for ${each.value} in ${var.environment}"

  alarm_actions             = [var.alert_notification_arn]
  ok_actions               = [var.alert_notification_arn]
  insufficient_data_actions = [var.alert_notification_arn]
  treat_missing_data       = "notBreaching"

  dimensions = merge({
    Service     = each.value
    Environment = var.environment
  }, var.metric_dimensions)

  tags = {
    Environment = var.environment
    Service     = each.value
    ManagedBy   = "terraform"
  }
}

# Comprehensive Service Dashboard
resource "aws_cloudwatch_dashboard" "services_dashboard" {
  dashboard_name = "${var.environment}-services-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        x    = 0
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["${var.metric_namespace}", "RequestCount", "Service", "*", "Environment", "${var.environment}"],
            ["${var.metric_namespace}", "ErrorCount", "Service", "*", "Environment", "${var.environment}"]
          ]
          period = var.dashboard_refresh_interval
          stat   = "Sum"
          region = data.aws_region.current.name
          title  = "Request and Error Counts"
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["${var.metric_namespace}", "Latency", "Service", "*", "Environment", "${var.environment}"]
          ]
          period = var.dashboard_refresh_interval
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Service Latency"
        }
      },
      {
        type = "metric"
        x    = 0
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["${var.metric_namespace}", "CPUUtilization", "Service", "*", "Environment", "${var.environment}"]
          ]
          period = var.dashboard_refresh_interval
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "CPU Utilization"
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["${var.metric_namespace}", "MemoryUtilization", "Service", "*", "Environment", "${var.environment}"]
          ]
          period = var.dashboard_refresh_interval
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Memory Utilization"
        }
      }
    ]
  })
}

# Log Metric Filters for Error Detection
resource "aws_cloudwatch_log_metric_filter" "error_logs" {
  for_each = toset(var.service_names)

  name           = "${var.environment}-${each.value}-errors"
  pattern        = "[timestamp, requestid, level = ERROR, ...]"
  log_group_name = aws_cloudwatch_log_group.service_logs[each.key].name

  metric_transformation {
    name          = "ErrorCount"
    namespace     = var.metric_namespace
    value         = "1"
    default_value = 0

    dimensions = {
      Service     = each.value
      Environment = var.environment
    }
  }
}

# Data source for current AWS region
data "aws_region" "current" {}

# Outputs
output "log_group_arns" {
  description = "Map of service names to their corresponding CloudWatch log group ARNs"
  value       = { for name, group in aws_cloudwatch_log_group.service_logs : name => group.arn }
}

output "dashboard_arn" {
  description = "ARN of the created CloudWatch dashboard for service monitoring"
  value       = aws_cloudwatch_dashboard.services_dashboard.dashboard_arn
}

output "alarm_arns" {
  description = "Map of service names to their corresponding CloudWatch alarm ARNs"
  value       = { for name, alarm in aws_cloudwatch_metric_alarm.service_errors : name => alarm.arn }
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for log encryption"
  value       = aws_kms_key.log_encryption.arn
}