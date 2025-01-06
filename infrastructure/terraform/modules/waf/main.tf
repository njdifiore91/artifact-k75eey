# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# WAF Web ACL with comprehensive OWASP security rules
resource "aws_wafv2_web_acl" "main" {
  name        = "art-knowledge-graph-${var.environment}"
  description = "WAF rules implementing OWASP security controls for Art Knowledge Graph application"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate-based rule for DDoS protection
  rule {
    name     = "RateBasedRule"
    priority = 1

    override_action {
      dynamic "none" {
        for_each = var.waf_block_mode ? [] : [1]
        content {}
      }
      dynamic "count" {
        for_each = var.waf_block_mode ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateBasedRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # SQL Injection protection rule
  rule {
    name     = "SQLInjectionRule"
    priority = 2

    override_action {
      dynamic "none" {
        for_each = var.waf_block_mode ? [] : [1]
        content {}
      }
      dynamic "count" {
        for_each = var.waf_block_mode ? [1] : []
        content {}
      }
    }

    statement {
      sql_injection_match_statement {
        field_to_match {
          body {}
          query_string {}
          uri_path {}
          headers {
            oversize_handling = "CONTINUE"
            name             = "cookie"
          }
        }
        text_transformation {
          priority = 1
          type     = "URL_DECODE"
        }
        text_transformation {
          priority = 2
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SQLInjectionRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # Cross-site Scripting (XSS) protection rule
  rule {
    name     = "XSSRule"
    priority = 3

    override_action {
      dynamic "none" {
        for_each = var.waf_block_mode ? [] : [1]
        content {}
      }
      dynamic "count" {
        for_each = var.waf_block_mode ? [1] : []
        content {}
      }
    }

    statement {
      xss_match_statement {
        field_to_match {
          body {}
          headers {
            oversize_handling = "CONTINUE"
            name             = "cookie"
          }
        }
        text_transformation {
          priority = 1
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "XSSRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # IP Reputation list rule
  rule {
    name     = "IPReputationRule"
    priority = 4

    override_action {
      dynamic "none" {
        for_each = var.waf_block_mode ? [] : [1]
        content {}
      }
      dynamic "count" {
        for_each = var.waf_block_mode ? [1] : []
        content {}
      }
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.malicious_ips.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "IPReputationRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "WAFWebACLMetric"
    sampled_requests_enabled  = true
  }

  tags = var.tags
}

# IP set for blocking known malicious IPs
resource "aws_wafv2_ip_set" "malicious_ips" {
  name               = "art-knowledge-graph-ipset-${var.environment}"
  description        = "IP set for rate limiting and DDoS protection"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = []  # Empty by default, to be populated by security team
  
  tags = var.tags
}

# WAF logging configuration
resource "aws_cloudwatch_log_group" "waf_logs" {
  count = var.enable_logging ? 1 : 0
  
  name              = "/aws/waf/art-knowledge-graph/${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  count = var.enable_logging ? 1 : 0

  log_destination_configs = [aws_cloudwatch_log_group.waf_logs[0].arn]
  resource_arn           = aws_wafv2_web_acl.main.arn

  logging_filter {
    default_behavior = "KEEP"

    filter {
      behavior = "KEEP"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      requirement = "MEETS_ANY"
    }
  }
}

# Outputs for reference by other modules
output "web_acl_id" {
  description = "The ID of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.id
}

output "web_acl_arn" {
  description = "The ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.arn
}