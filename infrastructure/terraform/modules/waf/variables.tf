# Environment variable with validation to ensure only valid environments are used
variable "environment" {
  type        = string
  description = "Environment name for WAF resource naming and tagging (dev, staging, prod)"
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# WAF block mode toggle for switching between blocking and count modes
variable "waf_block_mode" {
  type        = bool
  description = "Whether to block (true) or just count (false) WAF rule violations"
  default     = true
}

# Rate limiting configuration for DDoS protection
variable "rate_limit" {
  type        = number
  description = "Maximum number of requests allowed per 5-minute period for DDoS protection"
  default     = 2000

  validation {
    condition     = var.rate_limit > 0
    error_message = "Rate limit must be a positive number"
  }
}

# Log retention configuration for compliance requirements
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain WAF logs in CloudWatch for security audit compliance"
  default     = 90

  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 365
    error_message = "Log retention days must be between 1 and 365"
  }
}

# IP-based rate limiting for DDoS protection
variable "ip_rate_limit" {
  type        = number
  description = "Maximum requests allowed per IP address per 5-minute period for DDoS protection"
  default     = 2000

  validation {
    condition     = var.ip_rate_limit > 0
    error_message = "IP rate limit must be a positive number"
  }
}

# WAF logging configuration
variable "enable_logging" {
  type        = bool
  description = "Enable WAF logging to CloudWatch for security monitoring and compliance"
  default     = true
}

# Resource tagging configuration
variable "tags" {
  type        = map(string)
  description = "Resource tags for WAF components including security compliance tracking"
  default = {
    Project             = "ArtKnowledgeGraph"
    ManagedBy          = "Terraform"
    SecurityCompliance = "OWASP"
    Environment        = "var.environment"
  }

  validation {
    condition     = can(lookup(var.tags, "Project")) && can(lookup(var.tags, "SecurityCompliance"))
    error_message = "Tags must include at minimum 'Project' and 'SecurityCompliance' keys"
  }
}