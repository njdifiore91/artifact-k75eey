# Art Knowledge Graph - Staging Environment Infrastructure
# Terraform version: ~> 1.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws" # ~> 5.0
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random" # ~> 3.0
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "art-knowledge-graph-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project         = "ArtKnowledgeGraph"
      Environment     = "staging"
      ManagedBy       = "Terraform"
      CostCenter      = "PreRelease"
      BackupRetention = "7"
      SecurityLevel   = "Standard"
    }
  }
}

locals {
  environment = var.environment
  region      = var.aws_region
}

# Networking Module - Single AZ Configuration
module "networking" {
  source = "../../modules/networking"

  environment         = local.environment
  vpc_cidr           = var.vpc_cidr
  enable_multi_az    = false
  availability_zones = ["${local.region}a"] # Single AZ for staging

  tags = var.tags
}

# ECS Cluster Configuration
module "ecs" {
  source = "../../modules/ecs"

  environment            = local.environment
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  service_configs       = var.ecs_service_configs
  enable_service_mesh   = false # Simplified networking for staging
  enable_auto_scaling   = false # Fixed capacity for staging

  depends_on = [module.networking]
}

# RDS PostgreSQL Configuration
module "rds" {
  source = "../../modules/rds"

  environment         = local.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  instance_class     = var.rds_instance_class
  multi_az           = false
  backup_retention   = var.backup_retention_days
  monitoring_interval = var.monitoring_interval

  depends_on = [module.networking]
}

# Redis Cache Configuration
module "redis" {
  source = "../../modules/redis"

  environment      = local.environment
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  node_type       = var.redis_node_type
  num_cache_nodes = 1 # Single node for staging
  multi_az        = false

  depends_on = [module.networking]
}

# Neo4j Graph Database Configuration
module "neo4j" {
  source = "../../modules/neo4j"

  environment     = local.environment
  vpc_id         = module.networking.vpc_id
  subnet_ids     = module.networking.private_subnet_ids
  instance_type  = var.neo4j_instance_type
  backup_retention = var.backup_retention_days
  multi_az       = false

  depends_on = [module.networking]
}

# Output Definitions
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = module.ecs.cluster_id
}

output "database_endpoints" {
  description = "Database endpoint information"
  value = {
    rds_endpoint   = module.rds.database_endpoint
    neo4j_endpoint = module.neo4j.database_endpoint
  }
  sensitive = true
}

output "cache_endpoint" {
  description = "Redis cache endpoint"
  value = {
    redis_endpoint = module.redis.cache_endpoint
  }
  sensitive = true
}