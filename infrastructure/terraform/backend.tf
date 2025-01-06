terraform {
  backend "s3" {
    # Primary state storage bucket with environment-specific path
    bucket = "art-knowledge-graph-terraform-state"
    key    = "terraform.tfstate"
    region = var.aws_primary_region

    # Enable encryption at rest using AWS KMS
    encrypt = true
    kms_key_id = "alias/terraform-state-key"

    # Enable state locking using DynamoDB
    dynamodb_table = "art-knowledge-graph-terraform-locks"

    # Security configurations
    acl                  = "private"
    versioning          = true
    
    # Additional security measures
    force_path_style     = false # Use virtual-hosted-style URLs
    sse_algorithm       = "aws:kms"
    
    # State file consistency
    skip_credentials_validation = false
    skip_region_validation     = false
    skip_metadata_api_check    = false
    
    # Lifecycle configurations
    lifecycle {
      prevent_destroy = true
    }
  }
}