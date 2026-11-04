# Acompaña API on one EC2 instance: Caddy terminates HTTPS on an sslip.io name
# for the Elastic IP and proxies to the Node server on localhost. No SSH: the
# instance is reached through SSM Session Manager. The Ollama key lives in SSM
# Parameter Store and is read by the instance at service start.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "acompana"
      ManagedBy = "terraform"
    }
  }
}

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_caller_identity" "current" {}

locals {
  key_parameter_arn = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.key_parameter}"
  domain            = "${replace(aws_eip.api.public_ip, ".", "-")}.sslip.io"
}

resource "aws_security_group" "api" {
  name        = "acompana-api"
  description = "HTTP for the certificate challenge and HTTPS for the app"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP for the Lets Encrypt challenge and the redirect to HTTPS"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound to ollama.com, GitHub and package mirrors"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "api" {
  name = "acompana-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Only this one parameter, nothing else in Parameter Store.
resource "aws_iam_role_policy" "read_key" {
  name = "read-ollama-key"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ssm:GetParameter"
      Resource = local.key_parameter_arn
    }]
  })
}

resource "aws_iam_instance_profile" "api" {
  name = "acompana-api"
  role = aws_iam_role.api.name
}

resource "aws_eip" "api" {
  domain = "vpc"
  tags   = { Name = "acompana-api" }
}

resource "aws_instance" "api" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.api.name
  vpc_security_group_ids = [aws_security_group.api.id]

  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh", {
    domain        = local.domain
    repo_url      = var.repo_url
    key_parameter = var.key_parameter
    region        = var.region
  })
  user_data_replace_on_change = true

  tags = { Name = "acompana-api" }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip_association" "api" {
  instance_id   = aws_instance.api.id
  allocation_id = aws_eip.api.id
}
