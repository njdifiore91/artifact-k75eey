# Core environment variable with validation
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC CIDR block configuration with validation
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Availability zones configuration with high availability validation
variable "availability_zones" {
  description = "List of availability zones for subnet distribution"
  type        = list(string)
  
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability"
  }
}

# NAT Gateway configuration for private subnet internet access
variable "enable_nat_gateway" {
  description = "Flag to enable NAT gateways for private subnets"
  type        = bool
  default     = true
}

# Subnet tagging configurations
variable "private_subnet_tags" {
  description = "Additional tags for private subnets"
  type        = map(string)
  default     = {}
}

variable "public_subnet_tags" {
  description = "Additional tags for public subnets"
  type        = map(string)
  default     = {}
}

# DNS configurations for VPC
variable "enable_dns_hostnames" {
  description = "Flag to enable DNS hostnames in the VPC"
  type        = bool
  default     = true
}

variable "enable_dns_support" {
  description = "Flag to enable DNS support in the VPC"
  type        = bool
  default     = true
}