# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "art-knowledge-graph-${var.environment}"
  common_tags = {
    Environment = var.environment
    Service     = "art-knowledge-graph"
    ManagedBy   = "terraform"
  }
}

# DB subnet group for RDS instance
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-subnet-group"
  subnet_ids = var.database_subnet_ids
  tags       = local.common_tags
}

# Security group for RDS instance
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for RDS PostgreSQL instance"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL access from within VPC"
    from_port   = var.database_port
    to_port     = var.database_port
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# RDS PostgreSQL instance
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgresql"
  
  # Engine configuration
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class
  
  # Storage configuration
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = var.kms_key_id
  
  # Database configuration
  db_name  = var.database_name
  username = "admin"
  port     = var.database_port
  
  # Network configuration
  multi_az             = var.multi_az
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  
  # Backup configuration
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  
  # Performance and monitoring
  performance_insights_enabled    = var.performance_insights_enabled
  monitoring_interval            = var.monitoring_interval
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  # Security configuration
  auto_minor_version_upgrade = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot      = false
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot-${formatdate("YYYYMMDDHHmmss", timestamp())}"
  
  # Parameter group configuration
  parameter_group_name = aws_db_parameter_group.main.name
  
  tags = local.common_tags
}

# RDS parameter group
resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.name_prefix}-pg15"
  family      = "postgres15"
  
  parameter {
    name  = "log_connections"
    value = "1"
  }
  
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  
  parameter {
    name  = "log_checkpoints"
    value = "1"
  }
  
  tags = local.common_tags
}

# Data source for VPC CIDR
data "aws_vpc" "selected" {
  id = var.vpc_id
}

# Outputs
output "db_instance_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "db_instance_id" {
  description = "The identifier of the RDS instance"
  value       = aws_db_instance.main.id
}

output "db_instance_arn" {
  description = "The ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

output "db_security_group_id" {
  description = "The ID of the security group associated with the RDS instance"
  value       = aws_security_group.rds.id
}