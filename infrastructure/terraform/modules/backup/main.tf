# AWS Backup configuration for Art Knowledge Graph application
# Provider version ~> 5.0 required for AWS Backup features
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data source for current AWS account information
data "aws_caller_identity" "current" {}

# Local variables for resource naming and tagging
locals {
  name_prefix = "art-knowledge-graph-${var.environment}"
  common_tags = {
    Environment = var.environment
    Service     = "art-knowledge-graph"
    ManagedBy   = "terraform"
  }
}

# AWS Backup vault with KMS encryption
resource "aws_backup_vault" "main" {
  name        = "${local.name_prefix}-vault"
  kms_key_arn = var.kms_key_arn
  tags        = local.common_tags
}

# AWS Backup vault in destination region for cross-region copies
resource "aws_backup_vault" "destination" {
  provider    = aws.destination
  name        = "${local.name_prefix}-vault"
  kms_key_arn = var.kms_key_arn
  tags        = local.common_tags
}

# AWS Backup plan with daily incremental and weekly full backups
resource "aws_backup_plan" "main" {
  name = "${local.name_prefix}-plan"

  # Daily incremental backup rule
  rule {
    rule_name         = "daily_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 1 * * ? *)" # Run at 1 AM UTC daily
    start_window      = 3600  # 1 hour
    completion_window = 7200  # 2 hours

    lifecycle {
      delete_after = var.backup_retention_days
    }

    # Cross-region copy for disaster recovery
    copy_action {
      destination_vault_arn = aws_backup_vault.destination.arn
      lifecycle {
        delete_after = var.backup_retention_days
      }
    }
  }

  # Weekly full backup rule
  rule {
    rule_name         = "weekly_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 1 ? * SUN *)" # Run at 1 AM UTC on Sundays
    start_window      = 3600  # 1 hour
    completion_window = 7200  # 2 hours

    lifecycle {
      delete_after = 90 # 90-day retention for weekly backups
    }

    # Cross-region copy for disaster recovery
    copy_action {
      destination_vault_arn = aws_backup_vault.destination.arn
      lifecycle {
        delete_after = 90 # 90-day retention for weekly backups
      }
    }
  }

  tags = local.common_tags
}

# IAM role for AWS Backup service
resource "aws_iam_role" "backup" {
  name = "${local.name_prefix}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach AWS Backup service role policy
resource "aws_iam_role_policy_attachment" "backup" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
  role       = aws_iam_role.backup.name
}

# Selection of resources to backup
resource "aws_backup_selection" "databases" {
  name          = "${local.name_prefix}-selection"
  iam_role_arn  = aws_iam_role.backup.arn
  plan_id       = aws_backup_plan.main.id

  resources = [
    var.rds_instance_arn,    # PostgreSQL database
    var.neo4j_cluster_arn    # Neo4j cluster
  ]
}

# Output the backup vault ARN
output "backup_vault_arn" {
  description = "ARN of the AWS Backup vault"
  value       = aws_backup_vault.main.arn
}

# Output the backup plan ARN
output "backup_plan_arn" {
  description = "ARN of the AWS Backup plan"
  value       = aws_backup_plan.main.arn
}

# Provider configuration for destination region
provider "aws" {
  alias  = "destination"
  region = var.destination_region
}