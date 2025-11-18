# ============================================
# GKE Autopilot Cluster Configuration
# ============================================
# Creates a production-ready GKE Autopilot cluster with:
# - Autopilot mode for cost efficiency and reduced management
# - Private nodes for security
# - Workload Identity for secure GCP API access
# - Network policies for pod-level security
# - Binary authorization for container security
# ============================================

# ============================================
# VPC Network
# ============================================

resource "google_compute_network" "vpc" {
  name                    = var.gke_network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required_apis]
}

# ============================================
# Subnet for GKE
# ============================================

resource "google_compute_subnetwork" "gke_subnet" {
  name          = var.gke_subnet_name
  ip_cidr_range = var.gke_subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id

  # Secondary IP ranges for GKE pods and services
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.gke_pods_cidr
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.gke_services_cidr
  }

  # Enable private Google access for GKE nodes
  private_ip_google_access = true

  # Enable VPC flow logs for network monitoring
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# ============================================
# Cloud Router & NAT (for private nodes)
# ============================================

resource "google_compute_router" "router" {
  name    = "${var.gke_cluster_name}-router"
  region  = var.region
  network = google_compute_network.vpc.id

  bgp {
    asn = 64514
  }
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.gke_cluster_name}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ============================================
# Firewall Rules
# ============================================

# Allow internal communication within VPC
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.gke_network_name}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [
    var.gke_subnet_cidr,
    var.gke_pods_cidr,
    var.gke_services_cidr,
  ]

  priority = 1000
}

# Allow health checks from GCP load balancers
resource "google_compute_firewall" "allow_health_checks" {
  name    = "${var.gke_network_name}-allow-health-checks"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["8000", "8080", "443"]
  }

  # GCP health check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22",
  ]

  target_tags = var.network_tags
  priority    = 1000
}

# ============================================
# GKE Autopilot Cluster
# ============================================

resource "google_container_cluster" "primary" {
  provider = google-beta

  name     = var.gke_cluster_name
  location = var.region

  # Enable Autopilot mode for managed infrastructure
  enable_autopilot = true

  # Release channel for automatic updates
  release_channel {
    channel = "REGULAR" # RAPID, REGULAR, or STABLE
  }

  # Network configuration
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.gke_subnet.name

  # IP allocation policy for pods and services
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = var.enable_private_nodes
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.gke_master_cidr

    master_global_access_config {
      enabled = true
    }
  }

  # Master authorized networks (who can access the k8s API)
  dynamic "master_authorized_networks_config" {
    for_each = length(var.authorized_networks) > 0 ? [1] : []

    content {
      dynamic "cidr_blocks" {
        for_each = var.authorized_networks
        content {
          cidr_block   = cidr_blocks.value.cidr_block
          display_name = cidr_blocks.value.display_name
        }
      }
    }
  }

  # Workload Identity for secure GCP API access
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Cluster addons
  addons_config {
    http_load_balancing {
      disabled = false
    }

    horizontal_pod_autoscaling {
      disabled = false
    }

    network_policy_config {
      disabled = false
    }

    gcp_filestore_csi_driver_config {
      enabled = false
    }

    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
  }

  # Binary authorization for container security
  binary_authorization {
    evaluation_mode = var.environment == "production" ? "PROJECT_SINGLETON_POLICY_ENFORCE" : "DISABLED"
  }

  # Maintenance window (updates during off-peak hours)
  maintenance_policy {
    daily_maintenance_window {
      start_time = "03:00" # 3 AM
    }
  }

  # Monitoring and logging configuration
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]

    managed_prometheus {
      enabled = true
    }
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  # Network policy enforcement
  network_policy {
    enabled  = true
    provider = "PROVIDER_UNSPECIFIED" # Autopilot manages this
  }

  # Security posture and workload vulnerability scanning
  security_posture_config {
    mode               = var.environment == "production" ? "BASIC" : "DISABLED"
    vulnerability_mode = var.environment == "production" ? "VULNERABILITY_BASIC" : "VULNERABILITY_DISABLED"
  }

  # Resource labels
  resource_labels = merge(
    var.labels,
    {
      environment = var.environment
      cluster     = var.gke_cluster_name
    }
  )

  # Deletion protection for production
  deletion_protection = var.environment == "production"

  depends_on = [
    google_project_service.required_apis,
    google_compute_subnetwork.gke_subnet,
    google_compute_router_nat.nat,
  ]

  lifecycle {
    # Prevent accidental cluster deletion
    prevent_destroy = false # Set to true for production
  }
}

# ============================================
# Outputs
# ============================================

output "gke_cluster_name" {
  description = "Name of the GKE cluster"
  value       = google_container_cluster.primary.name
}

output "gke_cluster_endpoint" {
  description = "Endpoint of the GKE cluster"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "gke_cluster_ca_certificate" {
  description = "CA certificate of the GKE cluster"
  value       = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "gke_cluster_location" {
  description = "Location of the GKE cluster"
  value       = google_container_cluster.primary.location
}

output "vpc_network_name" {
  description = "Name of the VPC network"
  value       = google_compute_network.vpc.name
}

output "vpc_subnet_name" {
  description = "Name of the VPC subnet"
  value       = google_compute_subnetwork.gke_subnet.name
}
