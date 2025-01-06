# Project Information
variable "project_name" {
  type        = string
  description = "Name of the project for resource naming"
  default     = "art-knowledge-graph"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Networking Configuration
variable "vpc_id" {
  type        = string
  description = "ID of the VPC where ECS resources will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for ECS task deployment"
}

# Service Discovery Configuration
variable "service_discovery_namespace" {
  type        = string
  description = "Namespace for internal service discovery"
  default     = "art-knowledge-graph.local"
}

# Monitoring Configuration
variable "container_insights" {
  type        = bool
  description = "Enable CloudWatch Container Insights monitoring"
  default     = true
}

# Service-specific Configurations
variable "service_configs" {
  type = map(object({
    cpu               = number
    memory           = number
    min_capacity     = number
    max_capacity     = number
    container_port   = number
    health_check_path = string
  }))
  description = "Service-specific configurations for ECS tasks"
  
  default = {
    api_service = {
      cpu               = 1024
      memory           = 2048
      min_capacity     = 2
      max_capacity     = 10
      container_port   = 8000
      health_check_path = "/health"
    }
    graph_service = {
      cpu               = 2048
      memory           = 4096
      min_capacity     = 2
      max_capacity     = 8
      container_port   = 8001
      health_check_path = "/health"
    }
    auth_service = {
      cpu               = 512
      memory           = 1024
      min_capacity     = 2
      max_capacity     = 6
      container_port   = 8002
      health_check_path = "/health"
    }
  }
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Additional resource tags for ECS infrastructure"
  default     = {}
}