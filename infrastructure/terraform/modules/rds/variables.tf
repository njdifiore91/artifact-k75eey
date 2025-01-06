# Core environment variables
variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging (e.g., dev, staging, prod)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where RDS instance will be deployed"
}

variable "database_subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for RDS deployment in multiple availability zones"
}

# Instance configuration variables
variable "db_instance_class" {
  type        = string
  description = "RDS instance type for the PostgreSQL database"
  default     = "db.t3.large"
}

variable "allocated_storage" {
  type        = number
  description = "Initial storage allocation in GB for the RDS instance"
  default     = 100
}

variable "max_allocated_storage" {
  type        = number
  description = "Maximum storage limit in GB for storage autoscaling"
  default     = 500
}

# Database configuration variables
variable "database_name" {
  type        = string
  description = "Name of the PostgreSQL database to be created"
  default     = "artknowledgegraph"
}

variable "database_port" {
  type        = number
  description = "Port number for PostgreSQL database connections"
  default     = 5432
}

# High availability configuration
variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment for high availability"
  default     = true
}

# Backup configuration
variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 30
}

variable "backup_window" {
  type        = string
  description = "Preferred backup window time (UTC)"
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  type        = string
  description = "Preferred maintenance window time (UTC)"
  default     = "Mon:04:00-Mon:05:00"
}

# Security configuration
variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection for the RDS instance"
  default     = true
}

variable "kms_key_id" {
  type        = string
  description = "KMS key ID for RDS storage encryption (must be ARN)"
}

# Monitoring configuration
variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights for monitoring database performance"
  default     = true
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced monitoring interval in seconds (0 to disable)"
  default     = 60
}