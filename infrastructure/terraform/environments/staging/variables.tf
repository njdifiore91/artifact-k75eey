# Variable definitions for Art Knowledge Graph staging environment
# Terraform version: ~> 1.0

variable "environment" {
  type        = string
  description = "Deployment environment identifier"
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "This is a staging-specific configuration, environment must be 'staging'"
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region for resource deployment"
  default     = "us-east-2"
}

variable "project_name" {
  type        = string
  description = "Name of the project for resource naming"
  default     = "art-knowledge-graph"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.1.0.0/16"
}

variable "enable_multi_az" {
  type        = string
  description = "Enable Multi-AZ deployment for services"
  default     = false
}

variable "ecs_service_configs" {
  type = map(object({
    cpu          = number
    memory       = number
    min_capacity = number
    max_capacity = number
  }))
  description = "ECS service configurations for staging environment"
  default = {
    api_service = {
      cpu          = 1024
      memory       = 2048
      min_capacity = 2
      max_capacity = 4
    }
    graph_service = {
      cpu          = 2048
      memory       = 4096
      min_capacity = 2
      max_capacity = 4
    }
    auth_service = {
      cpu          = 512
      memory       = 1024
      min_capacity = 2
      max_capacity = 4
    }
  }
}

variable "rds_instance_class" {
  type        = string
  description = "RDS instance type for PostgreSQL database"
  default     = "db.r5.xlarge"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type for Redis"
  default     = "cache.r5.large"
}

variable "neo4j_instance_type" {
  type        = string
  description = "EC2 instance type for Neo4j database"
  default     = "r5.xlarge"
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain backups"
  default     = 14
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced monitoring interval in seconds"
  default     = 60
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags"
  default = {
    Environment = "staging"
    Project     = "ArtKnowledgeGraph"
    ManagedBy   = "Terraform"
  }
}