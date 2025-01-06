# AWS Provider version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Common tags for all resources
locals {
  common_tags = {
    Environment         = var.environment
    Module             = "security"
    ManagedBy          = "terraform"
    Application        = "art-knowledge-graph"
    SecurityCompliance = "owasp-gdpr-pci-ccpa"
  }
}

# Application Security Group
resource "aws_security_group" "application" {
  name_prefix = "app-sg-"
  vpc_id      = var.vpc_id
  description = "Security group for Art Knowledge Graph application tier"

  # Dynamic ingress rules based on variable input
  dynamic "ingress" {
    for_each = var.app_security_group_rules
    content {
      protocol    = ingress.value.protocol
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      cidr_blocks = ingress.value.cidr_blocks
      description = "Application ingress rule ${ingress.key + 1}"
    }
  }

  # Allow all outbound traffic
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(local.common_tags, var.tags, {
    Name = "${var.environment}-app-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# WAF Web ACL with OWASP Top 10 protections
resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0

  name        = "${var.environment}-web-acl"
  description = "WAF rules for Art Knowledge Graph application"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rules - Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${var.environment}-common-rules"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${var.environment}-known-bad-inputs"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - SQL Injection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${var.environment}-sqli-rules"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${var.environment}-waf-metrics"
    sampled_requests_enabled  = true
  }

  tags = merge(local.common_tags, var.tags, {
    Name = "${var.environment}-waf-acl"
  })
}

# KMS Key for data encryption
resource "aws_kms_key" "main" {
  count = var.enable_secrets_encryption ? 1 : 0

  description             = "KMS key for encrypting Art Knowledge Graph application data"
  deletion_window_in_days = var.kms_key_deletion_window
  enable_key_rotation     = true
  multi_region           = false

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Key Management"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "kms:Create*",
          "kms:Describe*",
          "kms:Enable*",
          "kms:List*",
          "kms:Put*",
          "kms:Update*",
          "kms:Revoke*",
          "kms:Disable*",
          "kms:Get*",
          "kms:Delete*",
          "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, var.tags, {
    Name = "${var.environment}-kms-key"
  })
}

# KMS Alias for easier reference
resource "aws_kms_alias" "main" {
  count = var.enable_secrets_encryption ? 1 : 0

  name          = "alias/${var.environment}-art-knowledge-graph"
  target_key_id = aws_kms_key.main[0].key_id
}

# Outputs
output "app_security_group_id" {
  description = "ID of the application security group for network access control"
  value       = aws_security_group.application.id
}

output "waf_web_acl_id" {
  description = "ID of the WAF web ACL for application protection"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].id : null
}

output "kms_key_id" {
  description = "ID of the KMS key for data encryption"
  value       = var.enable_secrets_encryption ? aws_kms_key.main[0].key_id : null
}

output "kms_key_arn" {
  description = "ARN of the KMS key for cross-account access"
  value       = var.enable_secrets_encryption ? aws_kms_key.main[0].arn : null
}