# AWS Provider version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources for organizational context
data "aws_organizations_organization" "current" {}
data "aws_caller_identity" "current" {}

# KMS key resource for Art Knowledge Graph application
resource "aws_kms_key" "main" {
  description             = "KMS key for Art Knowledge Graph application data encryption with multi-region support"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = var.enable_key_rotation
  multi_region           = var.multi_region
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage              = "ENCRYPT_DECRYPT"

  # Merge provided tags with standard tags
  tags = merge(var.tags, {
    Name        = format("%s-kms-key", var.environment)
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  # Key policy with organizational boundary controls
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableIAMUserPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "RestrictToOrganization"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:PrincipalOrgID" = data.aws_organizations_organization.current.id
          }
        }
      }
    ]
  })
}

# KMS alias for friendly naming
resource "aws_kms_alias" "main" {
  name          = "alias/${var.environment}-art-knowledge-graph"
  target_key_id = aws_kms_key.main.key_id
}

# Output values for use by other modules
output "kms_key_id" {
  description = "The ID of the KMS key"
  value       = aws_kms_key.main.key_id
}

output "kms_key_arn" {
  description = "The ARN of the KMS key"
  value       = aws_kms_key.main.arn
}

output "kms_alias_arn" {
  description = "The ARN of the KMS alias"
  value       = aws_kms_alias.main.arn
}