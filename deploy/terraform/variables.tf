variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
  default     = "skyops-a1143"
}

variable "region" {
  description = "Target GCP Region for Cloud Run"
  type        = string
  default     = "asia-southeast1"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "skyops-server"
}

variable "environment" {
  description = "Deployment environment tag (production, staging, dev)"
  type        = string
  default     = "production"
}

variable "container_image" {
  description = "URI of the container image to deploy"
  type        = string
  default     = "gcr.io/skyops-a1143/skyops-server:v1.5.1"
}

variable "cpu_limit" {
  description = "CPU allocated per container instance during requests"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory allocated per container instance"
  type        = string
  default     = "1Gi"
}

variable "concurrency" {
  description = "Maximum concurrent requests assigned per instance before scaling"
  type        = number
  default     = 80
}

variable "max_instances" {
  description = "Upper scaling limit to prevent runaway bill shock"
  type        = number
  default     = 5
}

variable "billing_account_id" {
  description = "GCP Billing Account ID for budget alerts (optional)"
  type        = string
  default     = ""
}

variable "monthly_budget_amount" {
  description = "Target monthly budget ceiling (units in budget_currency)"
  type        = number
  default     = 50
}

variable "budget_currency" {
  description = "Currency code for budget tracking"
  type        = string
  default     = "USD"
}

variable "notification_channels" {
  description = "List of Cloud Monitoring Notification Channel IDs for alerts"
  type        = list(string)
  default     = []
}
