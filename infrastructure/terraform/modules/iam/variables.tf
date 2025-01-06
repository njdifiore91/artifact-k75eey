# Core Terraform functionality for variable definitions and validation blocks
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming and tagging. Must be non-empty and follow AWS naming conventions."
  
  validation {
    condition     = length(var.project_name) > 0 && can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.project_name))
    error_message = "Project name must start with a letter, contain only alphanumeric characters and hyphens, and cannot be empty."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment identifier used for resource tagging and policy configuration."
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "ecs_task_role_policies" {
  type        = list(string)
  description = "List of AWS managed policy ARNs to attach to ECS task role for container permissions"
  default     = []
  
  validation {
    condition     = alltrue([for arn in var.ecs_task_role_policies : can(regex("^arn:aws:iam::[0-9]{12}:policy", arn))])
    error_message = "All ECS task role policy ARNs must be valid AWS IAM policy ARNs"
  }
}

variable "ecs_execution_role_policies" {
  type        = list(string)
  description = "List of AWS managed policy ARNs to attach to ECS execution role for service operations"
  default     = []
  
  validation {
    condition     = alltrue([for arn in var.ecs_execution_role_policies : can(regex("^arn:aws:iam::[0-9]{12}:policy", arn))])
    error_message = "All ECS execution role policy ARNs must be valid AWS IAM policy ARNs"
  }
}

variable "backup_role_policies" {
  type        = list(string)
  description = "List of AWS managed policy ARNs to attach to backup service role for data protection"
  default     = []
  
  validation {
    condition     = alltrue([for arn in var.backup_role_policies : can(regex("^arn:aws:iam::[0-9]{12}:policy", arn))])
    error_message = "All backup role policy ARNs must be valid AWS IAM policy ARNs"
  }
}

variable "kms_key_arn" {
  type        = string
  description = "ARN of KMS key used for encryption of sensitive data and backups"
  
  validation {
    condition     = can(regex("^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9-]{36}$", var.kms_key_arn))
    error_message = "KMS key ARN must be a valid AWS KMS key ARN in the format: arn:aws:kms:region:account:key/key-id"
  }
}

variable "tags" {
  type        = map(string)
  description = "Map of tags to apply to all IAM resources for resource management and cost allocation"
  default     = {}
  
  validation {
    condition     = alltrue([for k, v in var.tags : length(k) <= 128 && length(v) <= 256])
    error_message = "Tag keys must not exceed 128 characters and values must not exceed 256 characters"
  }
}