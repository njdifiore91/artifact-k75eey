# Configure required providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  common_tags = {
    Environment      = var.environment
    Service         = "neo4j"
    ManagedBy       = "terraform"
    BackupEnabled   = "true"
    MonitoringEnabled = "true"
  }
}

# ECS Cluster for Neo4j
resource "aws_ecs_cluster" "main" {
  name = "${var.cluster_name}-${var.environment}"
  tags = local.common_tags

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# EFS File System for persistent storage
resource "aws_efs_file_system" "neo4j" {
  creation_token = "neo4j-${var.environment}"
  encrypted      = true
  
  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = merge(local.common_tags, {
    Name = "neo4j-data-${var.environment}"
  })
}

# EFS Mount Targets in each subnet
resource "aws_efs_mount_target" "neo4j" {
  count           = length(var.private_subnet_ids)
  file_system_id  = aws_efs_file_system.neo4j.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

# Security Group for Neo4j containers
resource "aws_security_group" "neo4j" {
  name        = "neo4j-${var.environment}"
  description = "Security group for Neo4j cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 7687
    to_port         = 7687
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Bolt protocol"
  }

  ingress {
    from_port       = 7474
    to_port         = 7474
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "HTTP"
  }

  ingress {
    from_port       = 7473
    to_port         = 7473
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "HTTPS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Security Group for EFS
resource "aws_security_group" "efs" {
  name        = "neo4j-efs-${var.environment}"
  description = "Security group for Neo4j EFS mount targets"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.neo4j.id]
    description     = "NFS"
  }

  tags = local.common_tags
}

# Application Load Balancer
resource "aws_lb" "neo4j" {
  name               = "neo4j-${var.environment}"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = var.private_subnet_ids

  tags = local.common_tags
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "neo4j-alb-${var.environment}"
  description = "Security group for Neo4j ALB"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 7687
    to_port     = 7687
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
    description = "Bolt protocol"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# ALB Target Group
resource "aws_lb_target_group" "neo4j" {
  name        = "neo4j-${var.environment}"
  port        = 7687
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = local.common_tags
}

# ECS Task Definition
resource "aws_ecs_task_definition" "neo4j" {
  family                   = "neo4j-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu_allocation
  memory                   = var.memory_allocation
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "neo4j"
    image = "neo4j:${var.neo4j_version}"
    essential = true
    portMappings = [
      {
        containerPort = 7687
        protocol      = "tcp"
      },
      {
        containerPort = 7474
        protocol      = "tcp"
      },
      {
        containerPort = 7473
        protocol      = "tcp"
      }
    ]
    environment = [
      {
        name  = "NEO4J_dbms_mode"
        value = "CORE"
      },
      {
        name  = "NEO4J_ACCEPT_LICENSE_AGREEMENT"
        value = "yes"
      },
      {
        name  = "NEO4J_dbms_security_procedures_unrestricted"
        value = "apoc.*"
      },
      {
        name  = "NEO4J_metrics_prometheus_enabled"
        value = "true"
      },
      {
        name  = "NEO4J_metrics_prometheus_endpoint"
        value = var.prometheus_endpoint
      }
    ]
    mountPoints = [
      {
        sourceVolume  = "neo4j-data"
        containerPath = "/data"
        readOnly      = false
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/ecs/neo4j-${var.environment}"
        awslogs-region        = data.aws_region.current.name
        awslogs-stream-prefix = "neo4j"
      }
    }
  }])

  volume {
    name = "neo4j-data"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.neo4j.id
      root_directory = "/"
    }
  }

  tags = local.common_tags
}

# ECS Service
resource "aws_ecs_service" "neo4j" {
  name                               = "neo4j-${var.environment}"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.neo4j.arn
  desired_count                     = var.cluster_size
  launch_type                       = "FARGATE"
  platform_version                  = "1.4.0"
  deployment_maximum_percent        = 200
  deployment_minimum_healthy_percent = 100
  health_check_grace_period_seconds = 120

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.neo4j.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.neo4j.arn
    container_name   = "neo4j"
    container_port   = 7687
  }

  service_registries {
    registry_arn = aws_service_discovery_service.neo4j.arn
  }

  tags = local.common_tags
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "neo4j" {
  name        = "neo4j.${var.environment}.local"
  vpc         = var.vpc_id
  description = "Service discovery namespace for Neo4j cluster"
}

resource "aws_service_discovery_service" "neo4j" {
  name = "neo4j"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.neo4j.id
    
    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# Outputs
output "neo4j_endpoint" {
  value       = aws_lb.neo4j.dns_name
  description = "Neo4j cluster endpoint"
}

output "neo4j_port" {
  value       = 7687
  description = "Neo4j Bolt protocol port"
}

output "cluster_arn" {
  value       = aws_ecs_cluster.main.arn
  description = "ECS cluster ARN"
}