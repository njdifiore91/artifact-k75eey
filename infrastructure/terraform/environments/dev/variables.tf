# Terraform variables definition file for development environment
# Defines configuration parameters for AWS infrastructure resources with validation rules

variable "environment" {
  type        = string
  description = "Deployment environment identifier, strictly enforced as 'dev'"
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "Environment must be 'dev' for development environment"
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region for development environment resources, restricted to us-east-2"
  default     = "us-east-2"

  validation {
    condition     = can(regex("^us-east-2$", var.aws_region))
    error_message = "AWS region must be us-east-2 for development environment"
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the development VPC with validation"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "Single availability zone for development environment"
  default     = ["us-east-2a"]

  validation {
    condition     = length(var.availability_zones) == 1
    error_message = "Development environment must use single AZ deployment"
  }
}

variable "ecs_task_cpu" {
  type        = map(number)
  description = "CPU units for ECS tasks in development environment"
  default = {
    api   = 1024
    graph = 2048
    auth  = 512
  }
}

variable "ecs_task_memory" {
  type        = map(number)
  description = "Memory allocation for ECS tasks in development environment"
  default = {
    api   = 2048
    graph = 4096
    auth  = 1024
  }
}

variable "rds_instance_class" {
  type        = string
  description = "RDS instance class for development PostgreSQL database"
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type for development cache"
  default     = "cache.t3.medium"
}

variable "neo4j_instance_type" {
  type        = string
  description = "EC2 instance type for Neo4j graph database in development"
  default     = "t3.medium"
}

variable "enable_monitoring" {
  type        = bool
  description = "Toggle for CloudWatch monitoring in development environment"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for development environment"
  default = {
    Environment = "dev"
    Project     = "art-knowledge-graph"
    ManagedBy   = "terraform"
  }
}