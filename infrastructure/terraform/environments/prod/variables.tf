# Production environment-specific Terraform variables configuration
# Defines variables for deploying the Art Knowledge Graph application's production infrastructure
# with high availability, enhanced security controls, and performance optimizations

variable "environment" {
  type        = string
  default     = "prod"
  description = "Production environment identifier"

  validation {
    condition     = var.environment == "prod"
    error_message = "Environment must be 'prod' for production configuration"
  }
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Primary AWS region for production deployment"
}

variable "dr_region" {
  type        = string
  default     = "us-west-2"
  description = "Disaster recovery AWS region"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR block for production VPC"

  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for multi-AZ deployment"

  validation {
    condition     = length(var.availability_zones) >= 3
    error_message = "Production environment requires at least 3 availability zones"
  }
}

variable "ecs_cluster_config" {
  type = map(any)
  default = {
    instance_type     = "t3.large"
    min_size         = 2
    max_size         = 10
    desired_capacity = 4
    cpu_threshold    = 75
  }
  description = "ECS cluster configuration including instance types and scaling parameters"
}

variable "rds_instance_class" {
  type        = string
  default     = "db.r5.xlarge"
  description = "Production-grade RDS instance class"

  validation {
    condition     = can(regex("^db\\.(r5|r6g)\\.(xlarge|2xlarge|4xlarge)", var.rds_instance_class))
    error_message = "RDS instance class must be at least db.r5.xlarge for production"
  }
}

variable "elasticache_node_type" {
  type        = string
  default     = "cache.r5.large"
  description = "ElastiCache node type for production caching"

  validation {
    condition     = can(regex("^cache\\.(r5|r6g)\\.(large|xlarge)", var.elasticache_node_type))
    error_message = "ElastiCache node type must be at least cache.r5.large for production"
  }
}

variable "neo4j_instance_type" {
  type        = string
  default     = "r5.2xlarge"
  description = "Neo4j instance type for production graph database"
}

variable "backup_retention_days" {
  type        = number
  default     = 30
  description = "Number of days to retain backups"

  validation {
    condition     = var.backup_retention_days >= 30
    error_message = "Backup retention must be at least 30 days for production"
  }
}

variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for production alerts and notifications"

  validation {
    condition     = can(regex("^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[a-zA-Z0-9-_]+$", var.sns_topic_arn))
    error_message = "SNS topic ARN must be valid"
  }
}

variable "enable_enhanced_monitoring" {
  type        = bool
  default     = true
  description = "Flag to enable enhanced monitoring"
}

variable "ssl_certificate_arn" {
  type        = string
  description = "ARN of SSL certificate for production HTTPS endpoints"

  validation {
    condition     = can(regex("^arn:aws:acm:[a-z0-9-]+:[0-9]{12}:certificate/[a-zA-Z0-9-]+$", var.ssl_certificate_arn))
    error_message = "SSL certificate ARN must be valid"
  }
}