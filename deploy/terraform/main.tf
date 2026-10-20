terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Cloud Run Service: SkyOps Control Plane
# Configured for P0 FinOps Optimization:
# - min_instance_count = 0 (scale-to-zero when idle)
# - max_instance_count = 5 (safe cost ceiling against unbounded traffic spikes)
# - cpu_idle = true (request-based billing: CPU throttled when idle, $0 cost)
# - startup_cpu_boost = true (fast cold starts without steady-state cost penalty)
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "skyops_server" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  labels = {
    app            = "skyops"
    tier           = "control-plane"
    environment    = var.environment
    finops_policy  = "scale-to-zero"
    managed_by     = "terraform"
  }

  template {
    scaling {
      # P0 FINOPS MANDATE: Scale-to-zero
      min_instance_count = 0
      # Safe cost ceiling
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        # Request-based billing: CPU is only allocated during request execution
        cpu_idle = true
        # Accelerates cold start container launch without idle charge
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "PERSISTENCE_PROVIDER"
        value = "firestore"
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "SKYOPS_DATA_DIR"
        value = "/tmp/skyops-cache"
      }

      startup_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        initial_delay_seconds = 2
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 8
      }

      liveness_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        initial_delay_seconds = 10
        period_seconds        = 20
        timeout_seconds       = 3
        failure_threshold     = 3
      }
    }

    # Container concurrency: 80 concurrent connections per active container
    max_instance_request_concurrency = var.concurrency
    timeout                          = "300s"
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# -----------------------------------------------------------------------------
# Google Cloud Billing Budget & Alerts (50%, 80%, 100%)
# Proactively alerts FinOps & DevOps before spend exceeds early-stage thresholds.
# Note: Alerts do not terminate resources; they notify administrators immediately.
# -----------------------------------------------------------------------------
resource "google_billing_budget" "skyops_monthly_budget" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "SkyOps Early Acquisition Budget (${var.environment})"

  budget_filter {
    projects = ["projects/${var.project_id}"]
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = var.monthly_budget_amount
    }
  }

  # 50% Threshold Notification
  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  # 80% Threshold Warning
  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  # 100% Critical Alert
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  # Forecasted 100% Breach Alert
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = var.notification_channels
    disable_default_iam_recipients  = false
  }
}
