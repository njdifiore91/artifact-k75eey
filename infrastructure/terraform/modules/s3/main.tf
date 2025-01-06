# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables
locals {
  bucket_name = "${var.project_name}-${var.environment}-artwork-storage"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Main S3 bucket for artwork storage
resource "aws_s3_bucket" "artwork_storage" {
  bucket        = local.bucket_name
  force_destroy = false

  tags = merge(local.common_tags, var.tags)
}

# Bucket versioning configuration
resource "aws_s3_bucket_versioning" "artwork_storage_versioning" {
  bucket = aws_s3_bucket.artwork_storage.id
  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Disabled"
  }
}

# Server-side encryption configuration using KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "artwork_storage_encryption" {
  bucket = aws_s3_bucket.artwork_storage.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.encryption_key.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle configuration for object management
resource "aws_s3_bucket_lifecycle_configuration" "artwork_storage_lifecycle" {
  bucket = aws_s3_bucket.artwork_storage.id
  
  dynamic "rule" {
    for_each = var.lifecycle_rules
    content {
      id      = rule.value.name
      status  = rule.value.enabled ? "Enabled" : "Disabled"

      dynamic "transition" {
        for_each = rule.value.transition
        content {
          days          = transition.value.days
          storage_class = transition.value.storage_class
        }
      }

      expiration {
        days = rule.value.expiration.days
      }

      noncurrent_version_expiration {
        noncurrent_days = rule.value.noncurrent_version_expiration.days
      }
    }
  }
}

# CORS configuration for mobile access
resource "aws_s3_bucket_cors_configuration" "artwork_storage_cors" {
  bucket = aws_s3_bucket.artwork_storage.id

  dynamic "cors_rule" {
    for_each = var.cors_rules
    content {
      allowed_headers = cors_rule.value.allowed_headers
      allowed_methods = cors_rule.value.allowed_methods
      allowed_origins = cors_rule.value.allowed_origins
      expose_headers  = cors_rule.value.expose_headers
      max_age_seconds = cors_rule.value.max_age_seconds
    }
  }
}

# Block public access configuration
resource "aws_s3_bucket_public_access_block" "artwork_storage_public_access" {
  bucket = aws_s3_bucket.artwork_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Access logging configuration
resource "aws_s3_bucket" "artwork_storage_logs" {
  bucket        = "${local.bucket_name}-logs"
  force_destroy = false

  tags = merge(local.common_tags, var.tags, {
    Purpose = "S3 Access Logging"
  })
}

resource "aws_s3_bucket_logging" "artwork_storage_logging" {
  bucket = aws_s3_bucket.artwork_storage.id

  target_bucket = aws_s3_bucket.artwork_storage_logs.id
  target_prefix = "access-logs/"
}

# KMS key data source for encryption
data "aws_kms_key" "encryption_key" {
  key_id = "alias/art-knowledge-graph-${var.environment}"
}

# Output values
output "bucket_name" {
  description = "Name of the created S3 bucket"
  value       = aws_s3_bucket.artwork_storage.id
}

output "bucket_arn" {
  description = "ARN of the created S3 bucket"
  value       = aws_s3_bucket.artwork_storage.arn
}