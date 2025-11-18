# ============================================
# Network Security & Load Balancing
# ============================================
# Creates:
# - Cloud Armor security policy (DDoS protection, rate limiting)
# - Backend service for load balancing
# - Health checks
# - SSL certificates (optional)
# ============================================

# ============================================
# Cloud Armor Security Policy
# ============================================

resource "google_compute_security_policy" "policy" {
  count = var.enable_cloud_armor ? 1 : 0

  name        = "${var.gke_cluster_name}-security-policy"
  description = "Cloud Armor security policy for convergence-pipeline"

  # Default rule - allow all traffic (will be overridden by specific rules)
  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default allow rule"
  }

  # Rate limiting rule - protect against DDoS
  rule {
    action   = "rate_based_ban"
    priority = 1000

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"

      enforce_on_key = "IP"

      # Ban for 10 minutes if rate limit exceeded
      ban_duration_sec = 600

      rate_limit_threshold {
        count        = var.rate_limit_threshold
        interval_sec = 60
      }
    }

    description = "Rate limit rule - max ${var.rate_limit_threshold} requests per minute per IP"
  }

  # Block common attack patterns (OWASP ModSecurity Core Rule Set)
  rule {
    action   = "deny(403)"
    priority = 2000

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }

    description = "Block SQL injection attacks"
  }

  rule {
    action   = "deny(403)"
    priority = 2100

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }

    description = "Block XSS attacks"
  }

  rule {
    action   = "deny(403)"
    priority = 2200

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-stable')"
      }
    }

    description = "Block local file inclusion attacks"
  }

  rule {
    action   = "deny(403)"
    priority = 2300

    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-stable')"
      }
    }

    description = "Block remote code execution attacks"
  }

  # Geo-blocking (optional - customize as needed)
  # Uncomment to block traffic from specific countries
  # rule {
  #   action   = "deny(403)"
  #   priority = 3000
  #
  #   match {
  #     expr {
  #       expression = "origin.region_code == 'CN' || origin.region_code == 'RU'"
  #     }
  #   }
  #
  #   description = "Block traffic from specific countries"
  # }

  # Allow only specified source IP ranges (if configured)
  dynamic "rule" {
    for_each = length(var.allowed_source_ranges) > 0 && var.allowed_source_ranges[0] != "0.0.0.0/0" ? [1] : []

    content {
      action   = "deny(403)"
      priority = 4000

      match {
        expr {
          expression = "!inIpRange(origin.ip, '${join("') && !inIpRange(origin.ip, '", var.allowed_source_ranges)}')"
        }
      }

      description = "Deny traffic from unauthorized source IPs"
    }
  }

  # Adaptive protection - automatically detect and mitigate attacks
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = true
      rule_visibility = "STANDARD"
    }
  }

  depends_on = [google_project_service.required_apis]
}

# ============================================
# Health Check for Load Balancer
# ============================================

resource "google_compute_health_check" "app_health_check" {
  name                = "${var.gke_cluster_name}-health-check"
  description         = "Health check for convergence-pipeline application"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 8000
    request_path = "/health/ready"
  }

  log_config {
    enable = true
  }

  depends_on = [google_project_service.required_apis]
}

# ============================================
# SSL Certificate (Google-managed)
# ============================================
# Uncomment and configure for production with custom domain

# resource "google_compute_managed_ssl_certificate" "app_cert" {
#   name = "${var.gke_cluster_name}-ssl-cert"
#
#   managed {
#     domains = ["convergence-pipeline.example.com"]
#   }
#
#   depends_on = [google_project_service.required_apis]
# }

# ============================================
# Global Static IP Address
# ============================================

resource "google_compute_global_address" "app_ip" {
  name         = "${var.gke_cluster_name}-ip"
  description  = "Global static IP for convergence-pipeline load balancer"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"

  depends_on = [google_project_service.required_apis]
}

# ============================================
# Outputs
# ============================================

output "cloud_armor_policy_name" {
  description = "Name of the Cloud Armor security policy"
  value       = var.enable_cloud_armor ? google_compute_security_policy.policy[0].name : null
}

output "cloud_armor_policy_id" {
  description = "ID of the Cloud Armor security policy"
  value       = var.enable_cloud_armor ? google_compute_security_policy.policy[0].id : null
}

output "health_check_name" {
  description = "Name of the health check"
  value       = google_compute_health_check.app_health_check.name
}

output "load_balancer_ip" {
  description = "Global static IP address for load balancer"
  value       = google_compute_global_address.app_ip.address
}

output "load_balancer_ip_name" {
  description = "Name of the global static IP"
  value       = google_compute_global_address.app_ip.name
}
