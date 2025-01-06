# Terraform variables configuration for AWS Route53 DNS management module
# Version: ~> 1.0

variable "domain_name" {
  type        = string
  description = "Primary domain name for the Art Knowledge Graph application"
  
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\\.[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid DNS name."
  }
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "enable_health_checks" {
  type        = bool
  description = "Flag to enable Route53 health checks"
  default     = true
}

variable "health_check_interval" {
  type        = number
  description = "Interval in seconds between health checks"
  default     = 30
  
  validation {
    condition     = contains([10, 30], var.health_check_interval)
    error_message = "Health check interval must be either 10 or 30 seconds."
  }
}

variable "failover_enabled" {
  type        = bool
  description = "Enable DNS failover configuration for multi-region deployment"
  default     = true
}

variable "cloudfront_distribution_id" {
  type        = string
  description = "ID of the CloudFront distribution for DNS alias records"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to Route53 resources"
  default     = {}
}