# Core project variables
variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming"
  default     = "art-knowledge-graph"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "region" {
  type        = string
  description = "AWS region where the S3 bucket will be created"
  default     = "us-east-1"
}

# Bucket feature flags
variable "enable_versioning" {
  type        = bool
  description = "Enable versioning for the S3 bucket"
  default     = true
}

variable "enable_encryption" {
  type        = bool
  description = "Enable AES-256 server-side encryption for the S3 bucket"
  default     = true
}

variable "enable_replication" {
  type        = bool
  description = "Enable cross-region replication for disaster recovery"
  default     = false
}

variable "replication_region" {
  type        = string
  description = "Target region for cross-region replication"
  default     = "us-west-2"
}

# Lifecycle management configuration
variable "lifecycle_rules" {
  type = list(object({
    name     = string
    enabled  = bool
    transition = list(object({
      days          = number
      storage_class = string
    }))
    expiration = object({
      days = number
    })
    noncurrent_version_expiration = object({
      days = number
    })
  }))
  description = "Lifecycle rules for managing object transitions and expirations"
  default = [
    {
      name     = "standard_lifecycle"
      enabled  = true
      transition = [
        {
          days          = 90
          storage_class = "STANDARD_IA"
        },
        {
          days          = 180
          storage_class = "GLACIER"
        }
      ]
      expiration = {
        days = 365
      }
      noncurrent_version_expiration = {
        days = 90
      }
    }
  ]
}

# CORS configuration
variable "cors_rules" {
  type = list(object({
    allowed_headers = list(string)
    allowed_methods = list(string)
    allowed_origins = list(string)
    expose_headers  = list(string)
    max_age_seconds = number
  }))
  description = "CORS configuration rules for the S3 bucket"
  default = [
    {
      allowed_headers = ["*"]
      allowed_methods = ["GET", "PUT", "POST"]
      allowed_origins = ["*"]
      expose_headers  = ["ETag"]
      max_age_seconds = 3000
    }
  ]
}

# Security configuration
variable "bucket_public_access" {
  type = object({
    block_public_acls       = bool
    block_public_policy     = bool
    ignore_public_acls      = bool
    restrict_public_buckets = bool
  })
  description = "Settings for bucket public access blocking"
  default = {
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to the S3 bucket"
  default     = {}
}