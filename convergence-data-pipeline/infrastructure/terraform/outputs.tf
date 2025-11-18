# ============================================
# Terraform Outputs
# ============================================
# Consolidated outputs for easy reference and automation
# ============================================

# ============================================
# Project Information
# ============================================

output "project_info" {
  description = "Project information summary"
  value = {
    project_id  = var.project_id
    region      = var.region
    environment = var.environment
  }
}

# ============================================
# GKE Cluster
# ============================================

output "gke_cluster_info" {
  description = "GKE cluster information"
  value = {
    name     = google_container_cluster.primary.name
    location = google_container_cluster.primary.location
    endpoint = google_container_cluster.primary.endpoint
  }
  sensitive = true
}

output "gke_connection_command" {
  description = "Command to connect to GKE cluster"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region=${var.region} --project=${var.project_id}"
}

# ============================================
# Networking
# ============================================

output "network_info" {
  description = "Network configuration"
  value = {
    vpc_name                = google_compute_network.vpc.name
    subnet_name             = google_compute_subnetwork.gke_subnet.name
    subnet_cidr             = google_compute_subnetwork.gke_subnet.ip_cidr_range
    pods_cidr               = var.gke_pods_cidr
    services_cidr           = var.gke_services_cidr
    load_balancer_ip        = google_compute_global_address.app_ip.address
    load_balancer_ip_name   = google_compute_global_address.app_ip.name
    cloud_armor_policy_name = var.enable_cloud_armor ? google_compute_security_policy.policy[0].name : null
  }
}

# ============================================
# IAM & Service Accounts
# ============================================

output "service_account_info" {
  description = "Service account information"
  value = var.create_service_account ? {
    email                   = google_service_account.app_service_account[0].email
    name                    = google_service_account.app_service_account[0].name
    workload_identity_bound = var.enable_workload_identity
    k8s_service_account     = "convergence-pipeline-sa"
    namespace               = "default"
  } : null
}

# ============================================
# Storage
# ============================================

output "storage_info" {
  description = "Storage bucket information"
  value = {
    pipeline_data_bucket     = google_storage_bucket.pipeline_data.name
    pipeline_data_bucket_url = google_storage_bucket.pipeline_data.url
    region                   = google_storage_bucket.pipeline_data.location
  }
}

# ============================================
# Deployment Instructions
# ============================================

output "deployment_instructions" {
  description = "Instructions for deploying the application"
  value = <<-EOT

  ========================================
  Convergence Pipeline - Deployment Guide
  ========================================

  1. Connect to GKE cluster:
     ${format("gcloud container clusters get-credentials %s --region=%s --project=%s", google_container_cluster.primary.name, var.region, var.project_id)}

  2. Verify cluster access:
     kubectl cluster-info
     kubectl get nodes

  3. Create Kubernetes namespace (if not using default):
     kubectl create namespace convergence-pipeline

  4. Apply Kubernetes manifests:
     kubectl apply -f ../kubernetes/

  5. Check deployment status:
     kubectl get deployments
     kubectl get pods
     kubectl get services

  6. Get load balancer IP:
     kubectl get service convergence-pipeline-service

     Or use the pre-allocated IP: ${google_compute_global_address.app_ip.address}

  7. Test the application:
     curl http://${google_compute_global_address.app_ip.address}/health

  8. View logs:
     kubectl logs -l app=convergence-pipeline --tail=100 -f

  9. Scale deployment:
     kubectl scale deployment convergence-pipeline --replicas=5

  ========================================

  Service Account Email: ${var.create_service_account ? google_service_account.app_service_account[0].email : "N/A"}
  Load Balancer IP: ${google_compute_global_address.app_ip.address}
  Cloud Armor Policy: ${var.enable_cloud_armor ? google_compute_security_policy.policy[0].name : "Disabled"}

  ========================================
  EOT
}

# ============================================
# Environment Variables for Application
# ============================================

output "application_env_vars" {
  description = "Environment variables to configure in Kubernetes ConfigMap"
  value = {
    GCP_PROJECT_ID          = var.project_id
    GCP_REGION              = var.region
    ENVIRONMENT             = var.environment
    PIPELINE_DATA_BUCKET    = google_storage_bucket.pipeline_data.name
    SERVICE_ACCOUNT_EMAIL   = var.create_service_account ? google_service_account.app_service_account[0].email : ""
    ENABLE_WORKLOAD_IDENTITY = tostring(var.enable_workload_identity)
  }
  sensitive = true
}

# ============================================
# Terraform State
# ============================================

output "terraform_state_bucket" {
  description = "Terraform state bucket (if created)"
  value       = var.create_terraform_state_bucket ? google_storage_bucket.terraform_state[0].name : null
}

# ============================================
# Quick Reference
# ============================================

output "quick_reference" {
  description = "Quick reference information"
  value = {
    kubectl_config_command = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region=${var.region} --project=${var.project_id}"
    application_url        = "http://${google_compute_global_address.app_ip.address}"
    health_check_url       = "http://${google_compute_global_address.app_ip.address}/health"
    docs_url               = var.environment != "production" ? "http://${google_compute_global_address.app_ip.address}/docs" : "Disabled in production"
    metrics_url            = "http://${google_compute_global_address.app_ip.address}/metrics"
  }
}
