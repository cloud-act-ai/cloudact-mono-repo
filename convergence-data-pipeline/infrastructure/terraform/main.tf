# ============================================
# Convergence Data Pipeline - Main Terraform Configuration
# ============================================
# This configuration creates the complete GCP infrastructure
# for the multi-tenant BigQuery data pipeline system.
#
# Resources created:
# - GKE Autopilot cluster
# - Cloud Storage buckets
# - IAM service accounts and roles
# - VPC networking
# - Cloud Armor security policies
# - Load balancer
# ============================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Backend configuration for state management
  # Uncomment and configure for production use
  # backend "gcs" {
  #   bucket = "your-terraform-state-bucket"
  #   prefix = "convergence-pipeline/terraform/state"
  # }
}

# ============================================
# Provider Configuration
# ============================================

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ============================================
# Enable Required APIs
# ============================================

resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "bigquery.googleapis.com",
    "storage.googleapis.com",
    "cloudkms.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false

  # Prevent race conditions when enabling APIs
  timeouts {
    create = "30m"
    update = "40m"
  }
}

# ============================================
# Data Sources
# ============================================

data "google_project" "project" {
  project_id = var.project_id
}

data "google_compute_zones" "available" {
  region = var.region
  status = "UP"
}

# ============================================
# Cloud Storage Buckets
# ============================================

# Bucket for pipeline data and temporary storage
resource "google_storage_bucket" "pipeline_data" {
  name     = "${var.project_id}-pipeline-data-${var.environment}"
  location = var.region

  # Force destroy for non-production environments
  force_destroy = var.environment != "production"

  uniform_bucket_level_access = true

  versioning {
    enabled = var.environment == "production"
  }

  # Lifecycle rules for cost optimization
  lifecycle_rule {
    condition {
      age = var.data_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # Encryption with customer-managed keys
  encryption {
    default_kms_key_name = var.enable_cmek ? google_kms_crypto_key.bucket_key[0].id : null
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
    component   = "convergence-pipeline"
  }

  depends_on = [google_project_service.required_apis]
}

# Bucket for Terraform state (optional)
resource "google_storage_bucket" "terraform_state" {
  count    = var.create_terraform_state_bucket ? 1 : 0
  name     = "${var.project_id}-terraform-state"
  location = var.region

  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
    component   = "terraform-state"
  }

  depends_on = [google_project_service.required_apis]
}

# ============================================
# KMS Encryption Keys (Optional CMEK)
# ============================================

resource "google_kms_key_ring" "convergence" {
  count    = var.enable_cmek ? 1 : 0
  name     = "convergence-pipeline-${var.environment}"
  location = var.region

  depends_on = [google_project_service.required_apis]
}

resource "google_kms_crypto_key" "bucket_key" {
  count           = var.enable_cmek ? 1 : 0
  name            = "bucket-encryption-key"
  key_ring        = google_kms_key_ring.convergence[0].id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# ============================================
# Outputs
# ============================================

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "pipeline_data_bucket" {
  description = "Pipeline data storage bucket name"
  value       = google_storage_bucket.pipeline_data.name
}

output "pipeline_data_bucket_url" {
  description = "Pipeline data storage bucket URL"
  value       = google_storage_bucket.pipeline_data.url
}
