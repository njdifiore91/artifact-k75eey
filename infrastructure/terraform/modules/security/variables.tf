# Core environment variable with validation
variable "environment" {
  type        = string
  description = "Deployment environment identifier (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# VPC ID variable with validation
variable "vpc_id" {
  type        = string
  description = "ID of the VPC where security groups will be created"
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be valid"
  }
}

# Application security group rules configuration
variable "app_security_group_rules" {
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
  }))
  description = "List of security group rules for application tier"
  default     = []
}

# Database security group rules configuration
variable "db_security_group_rules" {
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
  }))
  description = "List of security group rules for database tier"
  default     = []
}

# WAF enablement flag
variable "enable_waf" {
  type        = bool
  description = "Flag to enable WAF protection"
  default     = true
}

# KMS key deletion window configuration with validation
variable "kms_key_deletion_window" {
  type        = number
  description = "Number of days before KMS key deletion"
  default     = 30
  validation {
    condition     = var.kms_key_deletion_window >= 7 && var.kms_key_deletion_window <= 30
    error_message = "KMS key deletion window must be between 7 and 30 days"
  }
}

# Secrets encryption enablement flag
variable "enable_secrets_encryption" {
  type        = bool
  description = "Flag to enable KMS encryption for secrets and sensitive data"
  default     = true
}

# Resource tagging configuration
variable "tags" {
  type        = map(string)
  description = "Tags to be applied to all security resources"
  default     = {}
}