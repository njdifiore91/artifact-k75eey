# AWS Provider configuration for primary region (us-east-1)
provider "aws" {
  region = var.aws_primary_region

  # Default tags applied to all resources
  default_tags {
    Environment = var.environment
    Project     = "ArtKnowledgeGraph"
    ManagedBy   = "Terraform"
  }

  # Security and authentication settings
  assume_role {
    role_arn     = var.terraform_role_arn
    session_name = "TerraformDeployment"
  }

  # Account security restrictions
  allowed_account_ids = [var.aws_account_id]

  # Provider behavior settings
  max_retries             = 3
  s3_force_path_style     = false
  skip_metadata_api_check = true
  skip_region_validation  = false
}

# AWS Provider configuration for disaster recovery region (us-west-2)
provider "aws" {
  alias  = "dr"
  region = var.aws_dr_region

  # Default tags applied to all resources in DR region
  default_tags {
    Environment = var.environment
    Project     = "ArtKnowledgeGraph"
    ManagedBy   = "Terraform"
  }

  # Security and authentication settings
  assume_role {
    role_arn     = var.terraform_role_arn
    session_name = "TerraformDeployment"
  }

  # Account security restrictions
  allowed_account_ids = [var.aws_account_id]

  # Provider behavior settings
  max_retries             = 3
  s3_force_path_style     = false
  skip_metadata_api_check = true
  skip_region_validation  = false
}

# Random provider for generating unique resource names
provider "random" {
  # No specific configuration needed
}

# Null provider for provisioning tasks
provider "null" {
  # No specific configuration needed
}