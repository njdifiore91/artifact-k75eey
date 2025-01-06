# AWS Route53 DNS Management Configuration for Art Knowledge Graph Application
# Provider version: ~> 5.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  common_tags = merge({
    Environment  = var.environment
    ManagedBy   = "terraform"
    Project     = "art-knowledge-graph"
    Service     = "route53"
    LastUpdated = timestamp()
  }, var.tags)
}

# Primary hosted zone configuration
resource "aws_route53_zone" "main" {
  name              = var.domain_name
  comment           = "Managed by Terraform - Art Knowledge Graph ${var.environment} environment"
  force_destroy     = false
  
  # Enable DNSSEC for enhanced security
  enable_dnssec = true
  
  # Enable query logging for monitoring and debugging
  dynamic "vpc" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      vpc_id = data.aws_vpc.main.id
    }
  }
  
  tags = local.common_tags
}

# Health check configuration for each region
resource "aws_route53_health_check" "main" {
  count             = var.enable_health_checks ? 1 : 0
  
  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = var.health_check_interval
  
  regions = [
    "us-east-1",
    "us-west-2",
    "eu-west-1"
  ]
  
  measure_latency    = true
  invert_healthcheck = false
  disabled          = false
  
  tags = merge(local.common_tags, {
    Name = "art-knowledge-graph-health-check-${var.environment}"
  })
}

# CloudFront distribution data source
data "aws_cloudfront_distribution" "main" {
  id = var.cloudfront_distribution_id
}

# Primary A record for CloudFront distribution
resource "aws_route53_record" "cloudfront_alias" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = data.aws_cloudfront_distribution.main.domain_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = var.enable_health_checks
  }

  dynamic "failover_routing_policy" {
    for_each = var.failover_enabled ? [1] : []
    content {
      type = "PRIMARY"
    }
  }

  set_identifier = var.failover_enabled ? "primary" : null
  health_check_id = var.enable_health_checks ? aws_route53_health_check.main[0].id : null
}

# AAAA record for IPv6 support
resource "aws_route53_record" "cloudfront_alias_ipv6" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = data.aws_cloudfront_distribution.main.domain_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = var.enable_health_checks
  }

  dynamic "failover_routing_policy" {
    for_each = var.failover_enabled ? [1] : []
    content {
      type = "PRIMARY"
    }
  }

  set_identifier = var.failover_enabled ? "primary-ipv6" : null
  health_check_id = var.enable_health_checks ? aws_route53_health_check.main[0].id : null
}

# TXT record for domain verification
resource "aws_route53_record" "domain_verification" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:_spf.google.com ~all"]
}

# Outputs for reference by other modules
output "zone_id" {
  description = "The hosted zone ID of the Route53 zone"
  value       = aws_route53_zone.main.zone_id
}

output "domain_nameservers" {
  description = "The nameservers for the hosted zone"
  value       = aws_route53_zone.main.name_servers
}

output "health_check_ids" {
  description = "The IDs of the created health checks"
  value       = var.enable_health_checks ? [aws_route53_health_check.main[0].id] : []
}