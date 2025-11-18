# ============================================
# Convergence Data Pipeline - Terraform Variables
# ============================================
# Configuration variables for infrastructure deployment
# ============================================

# ============================================
# Project Configuration
# ============================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be 6-30 characters, lowercase letters, numbers, and hyphens."
  }
}

variable "region" {
  description = "GCP Region for resources"
  type        = string
  default     = "us-central1"

  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]$", var.region))
    error_message = "Region must be a valid GCP region (e.g., us-central1)."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

# ============================================
# GKE Configuration
# ============================================

variable "gke_cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "convergence-pipeline-cluster"
}

variable "gke_network_name" {
  description = "Name of the VPC network for GKE"
  type        = string
  default     = "convergence-vpc"
}

variable "gke_subnet_name" {
  description = "Name of the subnet for GKE"
  type        = string
  default     = "convergence-subnet"
}

variable "gke_subnet_cidr" {
  description = "CIDR range for GKE subnet"
  type        = string
  default     = "10.0.0.0/20"
}

variable "gke_pods_cidr" {
  description = "Secondary CIDR range for GKE pods"
  type        = string
  default     = "10.4.0.0/14"
}

variable "gke_services_cidr" {
  description = "Secondary CIDR range for GKE services"
  type        = string
  default     = "10.8.0.0/20"
}

variable "gke_master_cidr" {
  description = "CIDR range for GKE master nodes (private IP)"
  type        = string
  default     = "172.16.0.0/28"
}

variable "enable_private_endpoint" {
  description = "Enable private endpoint for GKE cluster (no public IP)"
  type        = bool
  default     = false # Set to true for production
}

variable "enable_private_nodes" {
  description = "Enable private nodes for GKE cluster"
  type        = bool
  default     = true
}

variable "authorized_networks" {
  description = "List of CIDR ranges allowed to access GKE master"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = [
    {
      cidr_block   = "0.0.0.0/0"
      display_name = "All networks (change for production)"
    }
  ]
}

# ============================================
# Application Configuration
# ============================================

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "convergence-pipeline"
}

variable "app_version" {
  description = "Application version tag"
  type        = string
  default     = "latest"
}

variable "container_image" {
  description = "Container image URL"
  type        = string
  default     = "gcr.io/PROJECT_ID/convergence-pipeline:latest"
}

variable "min_replicas" {
  description = "Minimum number of pod replicas"
  type        = number
  default     = 2

  validation {
    condition     = var.min_replicas >= 1 && var.min_replicas <= 10
    error_message = "Min replicas must be between 1 and 10."
  }
}

variable "max_replicas" {
  description = "Maximum number of pod replicas"
  type        = number
  default     = 10

  validation {
    condition     = var.max_replicas >= 2 && var.max_replicas <= 100
    error_message = "Max replicas must be between 2 and 100."
  }
}

variable "cpu_request" {
  description = "CPU request per pod"
  type        = string
  default     = "500m"
}

variable "cpu_limit" {
  description = "CPU limit per pod"
  type        = string
  default     = "1000m"
}

variable "memory_request" {
  description = "Memory request per pod"
  type        = string
  default     = "1Gi"
}

variable "memory_limit" {
  description = "Memory limit per pod"
  type        = string
  default     = "2Gi"
}

variable "target_cpu_utilization" {
  description = "Target CPU utilization percentage for autoscaling"
  type        = number
  default     = 80

  validation {
    condition     = var.target_cpu_utilization >= 50 && var.target_cpu_utilization <= 95
    error_message = "Target CPU utilization must be between 50 and 95."
  }
}

# ============================================
# Storage Configuration
# ============================================

variable "data_retention_days" {
  description = "Number of days to retain data in Cloud Storage"
  type        = number
  default     = 90

  validation {
    condition     = var.data_retention_days >= 7 && var.data_retention_days <= 365
    error_message = "Data retention must be between 7 and 365 days."
  }
}

variable "enable_cmek" {
  description = "Enable customer-managed encryption keys (CMEK)"
  type        = bool
  default     = false # Set to true for production
}

variable "create_terraform_state_bucket" {
  description = "Create a Cloud Storage bucket for Terraform state"
  type        = bool
  default     = false
}

# ============================================
# Security Configuration
# ============================================

variable "enable_cloud_armor" {
  description = "Enable Cloud Armor DDoS protection"
  type        = bool
  default     = true
}

variable "rate_limit_threshold" {
  description = "Rate limit threshold for Cloud Armor (requests per minute)"
  type        = number
  default     = 1000

  validation {
    condition     = var.rate_limit_threshold >= 100 && var.rate_limit_threshold <= 10000
    error_message = "Rate limit threshold must be between 100 and 10000."
  }
}

variable "allowed_source_ranges" {
  description = "List of CIDR ranges allowed to access the application"
  type        = list(string)
  default     = ["0.0.0.0/0"] # Change for production
}

# ============================================
# IAM Configuration
# ============================================

variable "create_service_account" {
  description = "Create a dedicated service account for the application"
  type        = bool
  default     = true
}

variable "service_account_name" {
  description = "Name of the service account"
  type        = string
  default     = "convergence-pipeline-sa"
}

variable "bigquery_roles" {
  description = "BigQuery IAM roles to grant to the service account"
  type        = list(string)
  default = [
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
  ]
}

variable "storage_roles" {
  description = "Cloud Storage IAM roles to grant to the service account"
  type        = list(string)
  default = [
    "roles/storage.objectAdmin",
  ]
}

# ============================================
# Monitoring & Logging
# ============================================

variable "enable_workload_identity" {
  description = "Enable Workload Identity for GKE"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30

  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 365
    error_message = "Log retention must be between 1 and 365 days."
  }
}

# ============================================
# Tags and Labels
# ============================================

variable "labels" {
  description = "Common labels to apply to all resources"
  type        = map(string)
  default = {
    managed_by = "terraform"
    component  = "convergence-pipeline"
  }
}

variable "network_tags" {
  description = "Network tags to apply to GKE nodes"
  type        = list(string)
  default     = ["convergence-pipeline", "gke-node"]
}
