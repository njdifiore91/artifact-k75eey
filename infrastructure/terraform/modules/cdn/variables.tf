# Required variable for environment identification
variable "environment" {
  type        = string
  description = "Deployment environment identifier (dev, staging, prod) for environment-specific configurations"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Required variable for domain name configuration
variable "domain_name" {
  type        = string
  description = "Primary domain name for the CloudFront distribution, must be a valid hostname format"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-\\.]{1,61}[a-z0-9]\\.[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid hostname format (e.g., cdn.example.com)"
  }
}

# Optional variable for price class selection with default value
variable "price_class" {
  type        = string
  description = "CloudFront distribution price class determining edge location coverage and cost"
  default     = "PriceClass_100"

  validation {
    condition     = can(regex("^PriceClass_(100|200|All)$", var.price_class))
    error_message = "Price class must be PriceClass_100, PriceClass_200, or PriceClass_All"
  }
}

# Optional variable for WAF enablement with default value
variable "enable_waf" {
  type        = bool
  description = "Flag to enable AWS WAF protection for the CloudFront distribution"
  default     = true
}

# Optional variable for cache TTL settings with default values and validation
variable "cache_ttl_settings" {
  type = object({
    min     = number
    default = number
    max     = number
  })
  description = "Cache TTL configuration for CloudFront distribution defining minimum, default, and maximum cache durations in seconds"
  default = {
    min     = 0
    default = 3600
    max     = 86400
  }

  validation {
    condition     = var.cache_ttl_settings.min >= 0 && var.cache_ttl_settings.max >= var.cache_ttl_settings.default && var.cache_ttl_settings.default >= var.cache_ttl_settings.min
    error_message = "Invalid cache TTL settings. Must satisfy: min >= 0, max >= default >= min"
  }
}

# Optional variable for logging enablement with default value
variable "enable_logging" {
  type        = bool
  description = "Flag to enable CloudFront access logging for monitoring and compliance"
  default     = true
}

# Optional variable for resource tagging with default empty map
variable "tags" {
  type        = map(string)
  description = "Additional resource tags for the CloudFront distribution for better resource management"
  default     = {}
}