terraform {
  # Specify minimum required Terraform version
  # Using 1.5.0+ for latest stable features and security updates
  required_version = ">= 1.5.0"

  # Define required providers with specific version constraints
  required_providers {
    # AWS provider for managing all AWS infrastructure resources
    # Version ~> 5.0 supports all required services including ECS Fargate, RDS, 
    # ElastiCache, S3, CloudFront, Route 53, ELB, and WAF
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    # Random provider for generating unique resource names
    # Version ~> 3.0 provides stable random value generation
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }

    # Null provider for custom provisioning tasks
    # Version ~> 3.0 ensures compatibility with latest Terraform features
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}