# Core project configuration
variable "project_name" {
  description = "Name of the project used for resource naming and tagging across all environments"
  type        = string
  default     = "art-knowledge-graph"
}

variable "aws_account_id" {
  description = "AWS account ID where resources will be created, used for ARN construction and cross-account access"
  type        = string
  sensitive   = true
}

variable "default_tags" {
  description = "Default tags applied to all resources for cost tracking and resource management"
  type        = map(string)
  default = {
    Project    = "art-knowledge-graph"
    ManagedBy  = "terraform"
    Repository = "github.com/art-knowledge-graph"
  }
}

# Security configuration
variable "kms_key_administrators" {
  description = "List of IAM users/roles that can administer KMS keys for data encryption"
  type        = list(string)
  sensitive   = true
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the infrastructure through security groups and NACLs"
  type        = list(string)
  sensitive   = true
}

variable "enable_waf" {
  description = "Enable WAF protection for public endpoints with OWASP rule set and rate limiting"
  type        = bool
  default     = true
}

# Monitoring and logging configuration
variable "enable_cloudwatch_logs" {
  description = "Global flag to enable CloudWatch logs for all services including ECS, RDS, and Lambda functions"
  type        = bool
  default     = true
}

variable "cloudwatch_retention_days" {
  description = "Number of days to retain CloudWatch logs, affecting storage costs and compliance requirements"
  type        = number
  default     = 30

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudwatch_retention_days)
    error_message = "CloudWatch retention days must be one of the allowed values: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653."
  }
}

# Domain and DNS configuration
variable "domain_name" {
  description = "Base domain name for the application, used for Route 53 and ACM certificate configuration"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\\.[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid domain name format."
  }
}

# Data retention and backup configuration
variable "backup_retention_period" {
  description = "Default number of days to retain backups for RDS, ElastiCache, and other data stores"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

# Environment-specific configuration
variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

# Service configuration
variable "ecs_task_cpu" {
  description = "Default CPU units for ECS tasks (1024 units = 1 vCPU)"
  type        = number
  default     = 1024

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.ecs_task_cpu)
    error_message = "ECS task CPU must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "ecs_task_memory" {
  description = "Default memory (in MiB) for ECS tasks"
  type        = number
  default     = 2048

  validation {
    condition     = contains([512, 1024, 2048, 4096, 8192, 16384], var.ecs_task_memory)
    error_message = "ECS task memory must be one of: 512, 1024, 2048, 4096, 8192, 16384."
  }
}

# High availability configuration
variable "multi_az" {
  description = "Enable Multi-AZ deployment for supported services"
  type        = bool
  default     = false
}

variable "enable_disaster_recovery" {
  description = "Enable cross-region disaster recovery configuration"
  type        = bool
  default     = false
}

# Performance and scaling configuration
variable "enable_autoscaling" {
  description = "Enable auto-scaling for ECS services"
  type        = bool
  default     = true
}

variable "rds_instance_class" {
  description = "RDS instance class for PostgreSQL database"
  type        = string
  default     = "db.t3.medium"

  validation {
    condition     = can(regex("^db\\.[t3|r5|m5]\\.", var.rds_instance_class))
    error_message = "RDS instance class must be a valid instance type starting with db.t3, db.r5, or db.m5."
  }
}