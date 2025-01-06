# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for common configurations
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "devops"
  }
  service_discovery_ttl                = 60
  health_check_grace_period           = 120
  deployment_maximum_percent          = 200
  deployment_minimum_healthy_percent  = 100
}

# ECS Cluster with Container Insights
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base            = 1
  }

  tags = local.common_tags
}

# Service Discovery Private DNS Namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = var.service_discovery_namespace
  vpc         = var.vpc_id
  description = "Private DNS namespace for ECS services"
  tags        = local.common_tags
}

# Service Discovery Service for each microservice
resource "aws_service_discovery_service" "services" {
  for_each = var.service_configs

  name = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    
    dns_records {
      ttl  = local.service_discovery_ttl
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}

# ECS Task Definitions for each service
resource "aws_ecs_task_definition" "services" {
  for_each = var.service_configs

  family                   = "${var.project_name}-${each.key}-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = each.value.cpu
  memory                  = each.value.memory
  execution_role_arn      = var.ecs_task_execution_role.arn
  task_role_arn          = var.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name         = each.key
      image        = "${var.project_name}/${each.key}:latest"
      essential    = true
      portMappings = [
        {
          containerPort = each.value.container_port
          protocol      = "tcp"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${each.value.container_port}${each.value.health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.project_name}-${each.key}-${var.environment}"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "ecs"
        }
      }
      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      ]
    }
  ])

  tags = local.common_tags
}

# ECS Services
resource "aws_ecs_service" "services" {
  for_each = var.service_configs

  name                              = "${var.project_name}-${each.key}-${var.environment}"
  cluster                          = aws_ecs_cluster.main.id
  task_definition                  = aws_ecs_task_definition.services[each.key].arn
  desired_count                    = each.value.min_capacity
  launch_type                      = "FARGATE"
  platform_version                 = "LATEST"
  health_check_grace_period_seconds = local.health_check_grace_period
  deployment_maximum_percent       = local.deployment_maximum_percent
  deployment_minimum_healthy_percent = local.deployment_minimum_healthy_percent

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.services[each.key].arn
    container_name = each.key
    container_port = each.value.container_port
  }

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  enable_execute_command = var.environment != "prod"

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags
}

# Auto Scaling configuration for each service
resource "aws_appautoscaling_target" "services" {
  for_each = var.service_configs

  max_capacity       = each.value.max_capacity
  min_capacity       = each.value.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based Auto Scaling Policy
resource "aws_appautoscaling_policy" "cpu" {
  for_each = var.service_configs

  name               = "${var.project_name}-${each.key}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.services[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.services[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.services[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory-based Auto Scaling Policy
resource "aws_appautoscaling_policy" "memory" {
  for_each = var.service_configs

  name               = "${var.project_name}-${each.key}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.services[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.services[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.services[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Module outputs
output "cluster_id" {
  value       = aws_ecs_cluster.main.id
  description = "The ID of the ECS cluster"
}

output "service_discovery_namespace_id" {
  value       = aws_service_discovery_private_dns_namespace.main.id
  description = "The ID of the service discovery namespace"
}

output "service_arns" {
  value = {
    for k, v in aws_ecs_service.services : k => v.id
  }
  description = "Map of service names to their ARNs"
}