# Environment variable for KMS key naming and tagging
variable "environment" {
  description = "Environment name for KMS key naming and tagging (e.g., dev, staging, prod). Used to enforce environment-specific key policies and access controls."
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Deletion window configuration for GDPR compliance
variable "deletion_window_in_days" {
  description = "Duration in days before the key is deleted after requesting deletion. GDPR compliance requires minimum 7 days for data protection."
  type        = number
  default     = 30

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "Deletion window must be between 7 and 30 days"
  }
}

# Key rotation configuration for security compliance
variable "enable_key_rotation" {
  description = "Specifies whether automatic key rotation is enabled. Default is true for security best practices and compliance requirements."
  type        = bool
  default     = true
}

# Multi-region support configuration
variable "multi_region" {
  description = "Specifies whether the key is a multi-Region key. Enables replication across primary (us-east-1) and DR (us-west-2) regions."
  type        = bool
  default     = true
}

# Resource tagging configuration
variable "tags" {
  description = "A map of tags to assign to the KMS key. Should include environment, purpose, and compliance-related tags."
  type        = map(string)
  default     = {}
}