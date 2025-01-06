# Core Terraform functionality for variable definitions
terraform {
  required_version = "~> 1.0"
}

variable "environment" {
  type        = string
  description = "Environment identifier for backup resource naming and configuration (dev/staging/prod)"
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain daily backups (30 days for production, configurable for other environments)"
  default     = 30
  
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention days must be between 1 and 365"
  }
}

variable "kms_key_arn" {
  type        = string
  description = "ARN of KMS key used for encrypting backups with AES-256-CBC"
  
  validation {
    condition     = can(regex("^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", var.kms_key_arn))
    error_message = "KMS key ARN must be a valid AWS KMS key ARN in the format: arn:aws:kms:region:account:key/key-id"
  }
}

variable "rds_instance_arn" {
  type        = string
  description = "ARN of RDS PostgreSQL instance to backup (requires 5-minute RPO capability)"
  
  validation {
    condition     = can(regex("^arn:aws:rds:[a-z0-9-]+:[0-9]{12}:db:[a-zA-Z0-9-]{1,63}$", var.rds_instance_arn))
    error_message = "RDS instance ARN must be a valid AWS RDS instance ARN in the format: arn:aws:rds:region:account:db:instance-id"
  }
}

variable "neo4j_cluster_arn" {
  type        = string
  description = "ARN of Neo4j cluster to backup (requires 15-minute RPO capability)"
  
  validation {
    condition     = can(regex("^arn:aws:ec2:[a-z0-9-]+:[0-9]{12}:instance/i-[a-f0-9]{8,17}$", var.neo4j_cluster_arn))
    error_message = "Neo4j cluster ARN must be a valid AWS EC2 instance ARN in the format: arn:aws:ec2:region:account:instance/instance-id"
  }
}

variable "backup_schedule_expression" {
  type        = string
  description = "Cron expression for backup schedule (daily incremental and weekly full backups)"
  default     = "cron(0 0 ? * * *)"
  
  validation {
    condition     = can(regex("^cron\\([0-9*/, -?]+\\)$", var.backup_schedule_expression))
    error_message = "Backup schedule must be a valid AWS cron expression"
  }
}

variable "enable_cross_region_backup" {
  type        = bool
  description = "Enable cross-region backup replication for disaster recovery"
  default     = true
}

variable "destination_region" {
  type        = string
  description = "AWS region for cross-region backup replication"
  default     = "us-west-2"
  
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.destination_region))
    error_message = "Destination region must be a valid AWS region identifier"
  }
}