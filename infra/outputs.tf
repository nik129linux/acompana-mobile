output "api_base" {
  description = "Set this as the GitHub repository variable ACOMPANA_API_BASE"
  value       = "https://${local.domain}"
}

output "instance_id" {
  description = "For SSM: aws ssm start-session --target <id>"
  value       = aws_instance.api.id
}
