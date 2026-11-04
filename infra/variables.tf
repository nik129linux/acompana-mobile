variable "region" {
  description = "AWS region for the API"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "One small instance is enough for the demo"
  type        = string
  default     = "t3.micro"
}

variable "repo_url" {
  description = "Public repository the instance clones and runs"
  type        = string
  default     = "https://github.com/nik129linux/acompana-mobile.git"
}

variable "key_parameter" {
  description = "SecureString in SSM Parameter Store holding the Ollama API key (created by hand, never in Terraform)"
  type        = string
  default     = "/acompana/ollama-api-key"
}
