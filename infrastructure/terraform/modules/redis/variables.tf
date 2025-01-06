# Core Terraform functionality
terraform {
  required_version = ">=1.0.0"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g., dev, staging, prod)"
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "cluster_name" {
  type        = string
  description = "Name of the Redis cluster"
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9-]+$", var.cluster_name))
    error_message = "Cluster name can only contain alphanumeric characters and hyphens"
  }
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type for optimal performance"
  default     = "cache.r6g.large"
  
  validation {
    condition     = can(regex("^cache\\.(r6g|r5|m6g|m5)\\.", var.node_type))
    error_message = "Node type must be a valid Redis-compatible instance type"
  }
}

variable "num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in the cluster (minimum 3 for HA)"
  default     = 3
  
  validation {
    condition     = var.num_cache_nodes >= 3
    error_message = "Minimum of 3 cache nodes required for high availability"
  }
}

variable "port" {
  type        = number
  description = "Redis port number"
  default     = 6379
  
  validation {
    condition     = var.port >= 1024 && var.port <= 65535
    error_message = "Port must be between 1024 and 65535"
  }
}

variable "parameter_family" {
  type        = string
  description = "Redis parameter group family"
  default     = "redis6.x"
  
  validation {
    condition     = can(regex("^redis[0-9]\\.[x0-9]$", var.parameter_family))
    error_message = "Parameter family must be a valid Redis version"
  }
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where Redis cluster will be deployed"
  
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be valid"
  }
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for Redis subnet group (minimum 2 for HA)"
  
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets required for high availability"
  }
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "List of security group IDs allowed to access Redis"
  
  validation {
    condition     = length(var.allowed_security_group_ids) > 0
    error_message = "At least one security group must be specified"
  }
}

variable "maintenance_window" {
  type        = string
  description = "Weekly maintenance window"
  default     = "sun:05:00-sun:06:00"
  
  validation {
    condition     = can(regex("^[a-z]{3}:[0-9]{2}:[0-9]{2}-[a-z]{3}:[0-9]{2}:[0-9]{2}$", var.maintenance_window))
    error_message = "Maintenance window must be in format: ddd:hh:mm-ddd:hh:mm"
  }
}

variable "snapshot_window" {
  type        = string
  description = "Daily snapshot window"
  default     = "03:00-04:00"
  
  validation {
    condition     = can(regex("^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$", var.snapshot_window))
    error_message = "Snapshot window must be in format: hh:mm-hh:mm"
  }
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain snapshots"
  default     = 7
  
  validation {
    condition     = var.snapshot_retention_limit >= 1 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention must be between 1 and 35 days"
  }
}

variable "auto_minor_version_upgrade" {
  type        = bool
  description = "Enable automatic minor version upgrades"
  default     = true
}