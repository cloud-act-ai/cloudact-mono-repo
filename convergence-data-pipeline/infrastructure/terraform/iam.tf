# ============================================
# IAM Configuration
# ============================================
# Creates service accounts and IAM bindings for:
# - Application service account with BigQuery and Storage access
# - Workload Identity binding for GKE pods
# - Least-privilege IAM roles
# ============================================

# ============================================
# Service Account for Application
# ============================================

resource "google_service_account" "app_service_account" {
  count = var.create_service_account ? 1 : 0

  account_id   = var.service_account_name
  display_name = "Convergence Data Pipeline Service Account"
  description  = "Service account for convergence-pipeline application running in GKE"

  depends_on = [google_project_service.required_apis]
}

# ============================================
# IAM Role Bindings - BigQuery
# ============================================

resource "google_project_iam_member" "app_bigquery_roles" {
  for_each = var.create_service_account ? toset(var.bigquery_roles) : []

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# ============================================
# IAM Role Bindings - Cloud Storage
# ============================================

resource "google_project_iam_member" "app_storage_roles" {
  for_each = var.create_service_account ? toset(var.storage_roles) : []

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# ============================================
# Additional IAM Roles
# ============================================

# Grant Secret Manager access for retrieving secrets
resource "google_project_iam_member" "app_secret_manager" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# Grant Cloud KMS access for encryption/decryption
resource "google_project_iam_member" "app_kms" {
  count = var.create_service_account && var.enable_cmek ? 1 : 0

  project = var.project_id
  role    = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# Grant Pub/Sub publisher/subscriber access
resource "google_project_iam_member" "app_pubsub_publisher" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

resource "google_project_iam_member" "app_pubsub_subscriber" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# Grant Cloud Trace access for distributed tracing
resource "google_project_iam_member" "app_trace" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# Grant Cloud Monitoring metric writer access
resource "google_project_iam_member" "app_monitoring" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# Grant Cloud Logging writer access
resource "google_project_iam_member" "app_logging" {
  count = var.create_service_account ? 1 : 0

  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.app_service_account[0].email}"

  depends_on = [google_service_account.app_service_account]
}

# ============================================
# Workload Identity Binding
# ============================================
# Allows Kubernetes service account to impersonate GCP service account

resource "google_service_account_iam_member" "workload_identity_binding" {
  count = var.create_service_account && var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.app_service_account[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[default/convergence-pipeline-sa]"

  depends_on = [
    google_service_account.app_service_account,
    google_container_cluster.primary,
  ]
}

# ============================================
# GKE Node Service Account (Autopilot manages this)
# ============================================
# Note: In Autopilot mode, GKE automatically creates and manages
# the node service account. We don't need to create it explicitly.

# ============================================
# Outputs
# ============================================

output "service_account_email" {
  description = "Email of the application service account"
  value       = var.create_service_account ? google_service_account.app_service_account[0].email : null
}

output "service_account_name" {
  description = "Name of the application service account"
  value       = var.create_service_account ? google_service_account.app_service_account[0].name : null
}

output "workload_identity_namespace" {
  description = "Workload Identity namespace"
  value       = "${var.project_id}.svc.id.goog"
}

output "workload_identity_binding" {
  description = "Workload Identity binding configuration"
  value = var.create_service_account && var.enable_workload_identity ? {
    gcp_service_account = google_service_account.app_service_account[0].email
    k8s_service_account = "convergence-pipeline-sa"
    namespace           = "default"
  } : null
}
