# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "art-knowledge-graph-${var.environment}"
  common_tags = {
    Project       = "ArtKnowledgeGraph"
    Environment   = var.environment
    ManagedBy     = "Terraform"
    Component     = "Cache"
    SecurityLevel = "High"
  }
}

# Redis subnet group for network placement
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${local.name_prefix}-redis-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Subnet group for Redis cluster in private subnets"
  tags        = local.common_tags
}

# Redis parameter group for performance optimization
resource "aws_elasticache_parameter_group" "redis" {
  family      = var.parameter_family
  name        = "${local.name_prefix}-redis-params"
  description = "Redis parameter group for Art Knowledge Graph cache optimization"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  tags = local.common_tags
}

# Security group for Redis access control
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Redis cluster access control"

  ingress {
    description     = "Redis access from application"
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = local.common_tags
}

# Redis replication group for high availability
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${local.name_prefix}-${var.cluster_name}"
  description                   = "Redis cluster for Art Knowledge Graph application with HA and encryption"
  node_type                     = var.node_type
  num_cache_clusters           = var.num_cache_nodes
  port                         = var.port
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  maintenance_window          = var.maintenance_window
  snapshot_window             = var.snapshot_window
  snapshot_retention_limit    = var.snapshot_retention_limit
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  engine                     = "redis"
  engine_version             = "6.x"
  apply_immediately          = false

  tags = local.common_tags
}

# Output values for other modules to consume
output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_security_group_id" {
  description = "ID of the Redis security group"
  value       = aws_security_group.redis.id
}

output "redis_port" {
  description = "Redis port number"
  value       = var.port
}