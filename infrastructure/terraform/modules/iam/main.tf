# AWS Provider configuration for IAM resource management
# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ECS Task Role - Provides permissions for containers running in ECS tasks
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ecs-task-role"
  })
}

# ECS Execution Role - Provides permissions for ECS service to manage task execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-${var.environment}-ecs-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ecs-execution-role"
  })
}

# Backup Service Role - Provides permissions for AWS Backup to perform backups
resource "aws_iam_role" "backup_service_role" {
  name = "${var.project_name}-${var.environment}-backup-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-backup-role"
  })
}

# Attach managed policies to ECS Task Role
resource "aws_iam_role_policy_attachment" "ecs_task_role_policies" {
  for_each = toset(var.ecs_task_role_policies)
  
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = each.value
}

# Attach managed policies to ECS Execution Role
resource "aws_iam_role_policy_attachment" "ecs_execution_role_policies" {
  for_each = toset(var.ecs_execution_role_policies)
  
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = each.value
}

# Attach managed policies to Backup Service Role
resource "aws_iam_role_policy_attachment" "backup_role_policies" {
  for_each = toset(var.backup_role_policies)
  
  role       = aws_iam_role.backup_service_role.name
  policy_arn = each.value
}

# Inline policy for KMS key access
resource "aws_iam_role_policy" "kms_access" {
  name = "${var.project_name}-${var.environment}-kms-access"
  role = aws_iam_role.ecs_task_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}