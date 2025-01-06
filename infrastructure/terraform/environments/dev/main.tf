# Configure Terraform and required providers
terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "art-knowledge-graph-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Configure AWS Provider with default tags
provider "aws" {
  region = "us-east-2"
  
  default_tags {
    tags = {
      Project            = "art-knowledge-graph"
      Environment        = "dev"
      ManagedBy         = "terraform"
      CostCenter        = "development"
      DataClassification = "internal"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  project_name = "art-knowledge-graph"
  environment  = "dev"
  common_tags = {
    Project            = "art-knowledge-graph"
    Environment        = "dev"
    ManagedBy         = "terraform"
    CostCenter        = "development"
    DataClassification = "internal"
  }
}

# Networking module for VPC and subnet configuration
module "networking" {
  source = "../../modules/networking"

  environment         = "dev"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-2a"]  # Single AZ for dev environment
  enable_nat_gateway = true
  single_nat_gateway = true  # Single NAT gateway for cost optimization in dev

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
}

# ECS module for container orchestration
module "ecs" {
  source = "../../modules/ecs"

  environment        = "dev"
  vpc_id            = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids

  # Development-specific resource allocations
  task_cpu = {
    api   = 1024
    graph = 2048
    auth  = 512
  }

  task_memory = {
    api   = 2048
    graph = 4096
    auth  = 1024
  }

  # Minimal capacity settings for dev
  min_capacity = 1
  max_capacity = 2

  # Enable monitoring for development debugging
  enable_monitoring = true
}

# RDS module for PostgreSQL database
module "rds" {
  source = "../../modules/rds"

  environment = "dev"
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids

  # Development-appropriate database settings
  instance_class         = "db.t3.medium"
  allocated_storage     = 20
  backup_retention_period = 7
  multi_az             = false  # Single AZ for dev
  deletion_protection  = false  # Allow deletion in dev
}

# Redis module for caching
module "redis" {
  source = "../../modules/redis"

  environment = "dev"
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids

  # Development cache configuration
  node_type                 = "cache.t3.medium"
  num_cache_nodes          = 1  # Single node for dev
  automatic_failover_enabled = false
  parameter_group_family    = "redis6.x"
}

# Neo4j module for graph database
module "neo4j" {
  source = "../../modules/neo4j"

  environment = "dev"
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids

  # Development Neo4j configuration
  instance_type     = "t3.medium"
  volume_size      = 40
  backup_enabled   = true
  backup_window    = "03:00-04:00"
  maintenance_window = "Mon:04:00-Mon:05:00"
}

# Outputs for reference by other configurations
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.networking.vpc_id
}

output "ecs_cluster_id" {
  description = "The ID of the ECS cluster"
  value       = module.ecs.cluster_id
}

output "database_endpoint" {
  description = "The endpoint of the RDS database"
  value       = module.rds.endpoint
  sensitive   = true
}