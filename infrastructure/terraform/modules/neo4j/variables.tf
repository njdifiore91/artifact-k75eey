# Core Terraform configuration requiring version >= 1.0.0
terraform {
  required_version = ">=1.0.0"
}

# Cluster identification
variable "cluster_name" {
  description = "Name of the Neo4j cluster for resource identification"
  type        = string
  default     = "art-knowledge-graph-neo4j"
}

# Environment configuration
variable "environment" {
  description = "Deployment environment (dev/staging/prod) determining resource allocation and redundancy"
  type        = string
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Networking configuration
variable "vpc_id" {
  description = "ID of the VPC where Neo4j cluster will be deployed for network isolation"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for Multi-AZ Neo4j cluster deployment"
  type        = list(string)
}

# Instance configuration
variable "instance_type" {
  description = "ECS Fargate instance type optimized for graph database workloads"
  type        = string
  default     = "db.r6g.2xlarge"
}

# Cluster configuration
variable "cluster_size" {
  description = "Number of nodes in the Neo4j cluster for high availability"
  type        = number
  default     = 3
  validation {
    condition     = var.cluster_size >= 3
    error_message = "Cluster size must be at least 3 for high availability"
  }
}

# Resource allocation
variable "cpu_allocation" {
  description = "CPU units to allocate to each Neo4j container (1024 = 1 vCPU)"
  type        = number
  default     = 4096
  validation {
    condition     = var.cpu_allocation >= 2048
    error_message = "CPU allocation must be at least 2048 units for acceptable performance"
  }
}

variable "memory_allocation" {
  description = "Memory to allocate to each Neo4j container in MB"
  type        = number
  default     = 16384
  validation {
    condition     = var.memory_allocation >= 8192
    error_message = "Memory allocation must be at least 8192 MB for acceptable performance"
  }
}

# Neo4j version configuration
variable "neo4j_version" {
  description = "Neo4j enterprise edition version with security features"
  type        = string
  default     = "5.9.0-enterprise"
}

# Backup configuration
variable "backup_retention_days" {
  description = "Number of days to retain Neo4j backups for disaster recovery"
  type        = number
  default     = 30
  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "Backup retention must be at least 7 days"
  }
}

# Monitoring configuration
variable "enable_monitoring" {
  description = "Enable detailed monitoring and metrics collection for performance tracking"
  type        = bool
  default     = true
}

# Resource tagging
variable "tags" {
  description = "Additional tags to apply to Neo4j resources for organization"
  type        = map(string)
  default     = {}
}