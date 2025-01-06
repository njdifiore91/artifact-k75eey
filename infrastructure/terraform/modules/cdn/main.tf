# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common resource tagging
locals {
  common_tags = {
    Environment   = var.environment
    ManagedBy    = "terraform"
    Project      = "art-knowledge-graph"
    SecurityLevel = "high"
    CostCenter   = "cdn-delivery"
  }
}

# Origin Access Identity for secure S3 bucket access
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "Origin Access Identity for artwork bucket with enhanced security"
}

# Security headers policy for enhanced browser security
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "security-headers-${var.environment}"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      override = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains        = true
      preload                   = true
      override                  = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# CloudFront distribution with enhanced security and performance configurations
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.price_class
  aliases             = [var.domain_name]
  web_acl_id          = var.enable_waf ? data.aws_wafv2_web_acl.main[0].arn : null
  comment             = "Art Knowledge Graph CDN - ${var.environment}"
  default_root_object = "index.html"

  origin {
    domain_name = aws_s3_bucket.artwork_bucket.bucket_regional_domain_name
    origin_id   = "S3-artwork-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }

    origin_shield {
      enabled = true
      region  = "auto"
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-artwork-origin"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy     = "redirect-to-https"
    min_ttl                   = var.cache_ttl_settings.min
    default_ttl               = var.cache_ttl_settings.default
    max_ttl                   = var.cache_ttl_settings.max
    compress                  = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
  }

  # Custom error response configuration
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  dynamic "logging_config" {
    for_each = var.enable_logging ? [1] : []
    content {
      include_cookies = false
      bucket         = aws_s3_bucket.logs.bucket_domain_name
      prefix         = "cdn/"
    }
  }

  tags = merge(local.common_tags, var.tags)
}

# Outputs for use in other modules
output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_origin_access_identity" {
  description = "The IAM ARN of the CloudFront origin access identity"
  value       = aws_cloudfront_origin_access_identity.main.iam_arn
}