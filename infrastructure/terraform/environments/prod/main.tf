# Art Knowledge Graph Production Infrastructure Configuration
# Terraform version constraint and backend configuration
terraform {
  required_version = ">= 1.0.0"
  
  backend "s3" {
    bucket         = "art-knowledge-graph-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/terraform-state-key"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws" # version: ~> 5.0
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random" # version: ~> 3.0
      version = "~> 3.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  environment = "production"
  common_tags = {
    Environment        = "production"
    Project           = "ArtKnowledgeGraph"
    ManagedBy         = "Terraform"
    CostCenter        = "Production"
    DataClassification = "Sensitive"
    BackupPolicy      = "Daily"
    DR                = "Enabled"
  }
}

# Core networking infrastructure with multi-AZ support
module "networking" {
  source = "../../modules/networking"

  environment         = var.environment
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_flow_logs   = true
  enable_vpc_endpoints = true
  enable_nat_gateway = true
  nat_gateway_ha     = true
}

# ECS Fargate cluster configuration
module "ecs" {
  source = "../../modules/ecs"

  environment              = var.environment
  vpc_id                  = module.networking.vpc_id
  subnet_ids              = module.networking.private_subnet_ids
  cluster_config          = var.ecs_cluster_config
  enable_container_insights = true
  enable_execute_command  = false
  
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy = {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }
}

# RDS PostgreSQL configuration with Multi-AZ
module "rds" {
  source = "../../modules/rds"

  environment             = var.environment
  vpc_id                 = module.networking.vpc_id
  subnet_ids             = module.networking.private_subnet_ids
  instance_class         = "db.r6g.xlarge"
  multi_az               = true
  backup_retention_period = 30
  deletion_protection    = true
  storage_encrypted      = true
  performance_insights_enabled = true
  monitoring_interval    = 1
  enable_cross_region_backup = true
}

# ElastiCache Redis cluster configuration
module "elasticache" {
  source = "../../modules/redis"

  environment                = var.environment
  vpc_id                    = module.networking.vpc_id
  subnet_ids                = module.networking.private_subnet_ids
  node_type                 = "cache.r6g.large"
  num_cache_nodes          = 3
  automatic_failover_enabled = true
  multi_az_enabled         = true
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
}

# Neo4j Enterprise cluster configuration
module "neo4j" {
  source = "../../modules/neo4j"

  environment        = var.environment
  vpc_id            = module.networking.vpc_id
  subnet_ids        = module.networking.private_subnet_ids
  instance_type     = "db.r6g.2xlarge"
  cluster_size      = 3
  enable_backup     = true
  backup_retention_days = 30
  enable_encryption = true
  enable_monitoring = true
}

# Comprehensive monitoring and alerting configuration
module "monitoring" {
  source = "../../modules/monitoring"

  environment               = var.environment
  alarm_actions            = [var.sns_topic_arn]
  enable_detailed_monitoring = true
  log_retention_days       = 90
  enable_audit_logs        = true
  enable_vpc_flow_logs     = true
  enable_waf_logging       = true
  
  metric_alarms = {
    cpu_utilization_threshold    = 80
    memory_utilization_threshold = 80
    db_connections_threshold     = 1000
    api_latency_threshold       = 1000
  }
}

# Output values for reference
output "vpc_id" {
  description = "The ID of the production VPC"
  value       = module.networking.vpc_id
}

output "rds_endpoint" {
  description = "The endpoint of the production RDS instance"
  value       = module.rds.endpoint
  sensitive   = true
}