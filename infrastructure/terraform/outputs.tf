# VPC and Network Outputs
output "vpc_id" {
  description = "ID of the primary VPC"
  value       = module.networking.vpc_id
}

output "vpc_dr_id" {
  description = "ID of the DR VPC"
  value       = module.networking_dr.vpc_id
  sensitive   = false
}

output "subnet_ids" {
  description = "Map of subnet IDs by type and availability zone"
  value = {
    public    = module.networking.public_subnet_ids
    private   = module.networking.private_subnet_ids
    database  = module.networking.database_subnet_ids
  }
}

# Compute Outputs
output "ecs_cluster_arn" {
  description = "ARN of the primary ECS cluster"
  value       = module.ecs.cluster_arn
}

output "ecs_services" {
  description = "Map of ECS service details"
  value = {
    api_service    = module.ecs.api_service_name
    graph_service  = module.ecs.graph_service_name
    auth_service   = module.ecs.auth_service_name
  }
}

# Database Outputs
output "rds_endpoints" {
  description = "PostgreSQL RDS endpoints for read/write operations"
  value = {
    writer = module.rds.writer_endpoint
    reader = module.rds.reader_endpoint
  }
  sensitive = true
}

output "redis_endpoints" {
  description = "ElastiCache Redis endpoints for cluster mode"
  value = {
    primary       = module.elasticache.primary_endpoint
    reader        = module.elasticache.reader_endpoint
    configuration = module.elasticache.configuration_endpoint
  }
  sensitive = true
}

output "neo4j_endpoints" {
  description = "Neo4j database endpoints for graph operations"
  value = {
    bolt   = module.neo4j.bolt_endpoint
    http   = module.neo4j.http_endpoint
    https  = module.neo4j.https_endpoint
  }
  sensitive = true
}

# Load Balancer Outputs
output "load_balancer" {
  description = "Application Load Balancer details"
  value = {
    dns_name = module.alb.dns_name
    zone_id  = module.alb.zone_id
    arn      = module.alb.arn
  }
}

# CDN Outputs
output "cloudfront_distribution" {
  description = "CloudFront distribution information"
  value = {
    id           = module.cdn.distribution_id
    domain_name  = module.cdn.domain_name
    arn         = module.cdn.arn
  }
}

# Security Outputs
output "security_config" {
  description = "Security configuration details"
  value = {
    kms_key_id      = module.kms.key_id
    kms_key_arn     = module.kms.key_arn
    waf_acl_id      = module.waf.web_acl_id
    certificate_arn = module.acm.certificate_arn
    security_groups = {
      alb     = module.security.alb_security_group_id
      ecs     = module.security.ecs_security_group_id
      rds     = module.security.rds_security_group_id
      redis   = module.security.redis_security_group_id
      neo4j   = module.security.neo4j_security_group_id
    }
  }
  sensitive = true
}

# Storage Outputs
output "storage_config" {
  description = "Storage configuration details"
  value = {
    primary_bucket       = module.s3.primary_bucket_name
    replica_bucket       = module.s3.replica_bucket_name
    replication_role_arn = module.s3.replication_role_arn
    lifecycle_rules      = module.s3.lifecycle_rules
  }
}

# Monitoring Outputs
output "monitoring_config" {
  description = "Monitoring and logging configuration"
  value = {
    log_groups = {
      ecs        = module.monitoring.ecs_log_group_name
      rds        = module.monitoring.rds_log_group_name
      elasticache = module.monitoring.elasticache_log_group_name
    }
    dashboard_urls = module.monitoring.dashboard_urls
    alarm_topics   = module.monitoring.alarm_sns_topics
  }
}

# DNS and Route53 Outputs
output "dns_config" {
  description = "DNS configuration details"
  value = {
    hosted_zone_id   = module.dns.hosted_zone_id
    nameservers      = module.dns.nameservers
    domain_endpoints = module.dns.domain_endpoints
  }
}

# Backup and Recovery Outputs
output "backup_config" {
  description = "Backup and recovery configuration"
  value = {
    backup_vault_name = module.backup.vault_name
    backup_plan_id    = module.backup.plan_id
    recovery_points   = module.backup.recovery_points
  }
}

# Environment Information
output "environment_info" {
  description = "Environment-specific information"
  value = {
    environment = var.environment
    region = {
      primary = var.aws_primary_region
      dr      = var.enable_disaster_recovery ? var.aws_dr_region : null
    }
    multi_az_enabled = var.multi_az
    dr_enabled      = var.enable_disaster_recovery
  }
}