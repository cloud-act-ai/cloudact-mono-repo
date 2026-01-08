#!/usr/bin/env python3
"""
Demo Data Generator for CloudAct
Generates realistic usage, billing, and subscription data for india_inc_01022026 org.

Features:
- Full year 2025 coverage (Jan 1 - Dec 31)
- Holiday spikes (Black Friday, Cyber Monday, Christmas, etc.)
- Anomaly patterns (random spikes, incident weeks, summer dips)
- Seasonal variations (Q4 higher, summer lower)
- Weekday/weekend patterns
- Month-end budget flush patterns
- All 3 cost types: Cloud, GenAI, Subscription

Usage:
    python generate-demo-data.py [--start-date 2025-01-01] [--end-date 2025-12-31]
"""

import json
import csv
import random
import uuid
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional
from calendar import monthrange

# Configuration
ORG_SLUG = "acme_inc_01022026"
RANDOM_SEED = 42  # For reproducibility

# Output directories
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
GENAI_DIR = DATA_DIR / "genai"
CLOUD_DIR = DATA_DIR / "cloud"
SUBSCRIPTIONS_DIR = DATA_DIR / "subscriptions"


# =============================================================================
# US Holidays 2025 - For realistic cost spikes
# =============================================================================

HOLIDAYS_2025 = {
    # Holiday: (multiplier, description)
    date(2025, 1, 1): (1.8, "New Year's Day"),
    date(2025, 1, 20): (1.3, "Martin Luther King Jr. Day"),
    date(2025, 2, 17): (1.2, "Presidents Day"),
    date(2025, 4, 18): (1.15, "Good Friday"),
    date(2025, 5, 26): (1.25, "Memorial Day"),
    date(2025, 7, 4): (1.5, "Independence Day"),
    date(2025, 9, 1): (1.3, "Labor Day"),
    date(2025, 10, 13): (1.15, "Columbus Day"),
    date(2025, 11, 11): (1.2, "Veterans Day"),
    date(2025, 11, 27): (1.6, "Thanksgiving"),
    date(2025, 11, 28): (2.5, "Black Friday"),  # HUGE spike
    date(2025, 12, 1): (2.2, "Cyber Monday"),  # HUGE spike
    date(2025, 12, 24): (1.8, "Christmas Eve"),
    date(2025, 12, 25): (2.0, "Christmas Day"),
    date(2025, 12, 26): (1.7, "Boxing Day"),
    date(2025, 12, 31): (1.9, "New Year's Eve"),
}

# Days around holidays also get minor bumps
HOLIDAY_ADJACENT_MULTIPLIER = 1.15


# =============================================================================
# Anomaly Patterns - Random spikes, incidents, outages
# =============================================================================

# Random spike days throughout the year (simulates marketing campaigns, launches, etc.)
RANDOM_SPIKE_DAYS = [
    date(2025, 1, 15),   # Q1 campaign launch
    date(2025, 2, 14),   # Valentine's Day promo
    date(2025, 3, 1),    # Q1 end push
    date(2025, 3, 15),   # Product launch
    date(2025, 4, 1),    # Q2 start
    date(2025, 5, 5),    # Cinco de Mayo campaign
    date(2025, 6, 15),   # Mid-year review
    date(2025, 7, 15),   # Summer campaign
    date(2025, 9, 15),   # Back to school
    date(2025, 10, 31),  # Halloween
    date(2025, 11, 1),   # Q4 start
    date(2025, 11, 15),  # Pre-holiday prep
]

# Incident week - high costs due to debugging/issues (March 10-16, 2025)
INCIDENT_WEEK_START = date(2025, 3, 10)
INCIDENT_WEEK_END = date(2025, 3, 16)
INCIDENT_MULTIPLIER = 1.8  # Higher resource usage during incidents

# Summer slowdown week (August 11-17, 2025)
SUMMER_DIP_START = date(2025, 8, 11)
SUMMER_DIP_END = date(2025, 8, 17)
SUMMER_DIP_MULTIPLIER = 0.6  # Lower usage during vacation week


# =============================================================================
# GenAI Provider Configurations
# =============================================================================

# INCREASED 50x for realistic enterprise GenAI spend (~$30-50K/year)
GENAI_PROVIDERS = {
    "openai": {
        "models": [
            {"model": "gpt-4o", "model_family": "gpt-4o", "input_base": 100000000, "output_base": 20000000, "cached_ratio": 0.3},  # 50x
            {"model": "gpt-4o-mini", "model_family": "gpt-4o", "input_base": 150000000, "output_base": 30000000, "cached_ratio": 0.25},  # 50x
            {"model": "gpt-4-turbo", "model_family": "gpt-4", "input_base": 50000000, "output_base": 10000000, "cached_ratio": 0.2},  # 50x
            {"model": "gpt-3.5-turbo", "model_family": "gpt-3.5", "input_base": 250000000, "output_base": 50000000, "cached_ratio": 0.1},  # 50x
            {"model": "text-embedding-3-large", "model_family": "embedding", "input_base": 400000000, "output_base": 0, "cached_ratio": 0},  # 50x
        ],
        "credential_id": "cred_openai_demo_001",
        "pipeline_id": "genai_payg_openai",
    },
    "anthropic": {
        "models": [
            {"model": "claude-3-5-sonnet-20241022", "model_family": "claude-3.5", "input_base": 125000000, "output_base": 25000000, "cached_ratio": 0.35},  # 50x
            {"model": "claude-3-opus-20240229", "model_family": "claude-3", "input_base": 40000000, "output_base": 7500000, "cached_ratio": 0.25},  # 50x
            {"model": "claude-3-haiku-20240307", "model_family": "claude-3", "input_base": 200000000, "output_base": 40000000, "cached_ratio": 0.2},  # 50x
        ],
        "credential_id": "cred_anthropic_demo_001",
        "pipeline_id": "genai_payg_anthropic",
    },
    "gemini": {
        "models": [
            {"model": "gemini-1.5-pro", "model_family": "gemini-1.5", "input_base": 75000000, "output_base": 15000000, "cached_ratio": 0.2},  # 50x
            {"model": "gemini-1.5-flash", "model_family": "gemini-1.5", "input_base": 175000000, "output_base": 35000000, "cached_ratio": 0.15},  # 50x
            {"model": "gemini-1.0-pro", "model_family": "gemini-1.0", "input_base": 50000000, "output_base": 10000000, "cached_ratio": 0.1},  # 50x
        ],
        "credential_id": "cred_gemini_demo_001",
        "pipeline_id": "genai_payg_gemini",
    },
}


# =============================================================================
# Cloud Provider Configurations
# =============================================================================

GCP_SERVICES = [
    {"service_id": "6F81-5844-456A", "service_description": "Compute Engine", "sku_id": "D2C2-5678-ABCD", "sku_description": "N2 Instance Core running in Americas", "base_cost": 150.0, "usage_unit": "hour"},
    {"service_id": "24E6-581D-38E5", "service_description": "Cloud Storage", "sku_id": "E4F5-6789-BCDE", "sku_description": "Standard Storage US Multi-region", "base_cost": 25.0, "usage_unit": "gibibyte month"},
    {"service_id": "95FF-2EF5-5EA1", "service_description": "BigQuery", "sku_id": "F5G6-7890-CDEF", "sku_description": "Analysis Compute Units", "base_cost": 80.0, "usage_unit": "slot hour"},
    {"service_id": "152E-C115-5142", "service_description": "Cloud Run", "sku_id": "G6H7-8901-DEFG", "sku_description": "CPU Allocation Time", "base_cost": 45.0, "usage_unit": "vCPU second"},
    {"service_id": "9662-B51E-5089", "service_description": "Cloud SQL", "sku_id": "H7I8-9012-EFGH", "sku_description": "N1 Standard 4 in Americas", "base_cost": 120.0, "usage_unit": "hour"},
    {"service_id": "A1E8-BE35-7924", "service_description": "Cloud Functions", "sku_id": "I8J9-0123-FGHI", "sku_description": "Gen2 CPU Allocation", "base_cost": 15.0, "usage_unit": "GHz-second"},
    {"service_id": "58CD-E7C3-72CA", "service_description": "Kubernetes Engine", "sku_id": "J9K0-1234-GHIJ", "sku_description": "Autopilot Pod CPU", "base_cost": 200.0, "usage_unit": "hour"},
    {"service_id": "29E7-DA93-CA13", "service_description": "Cloud Logging", "sku_id": "K0L1-2345-HIJK", "sku_description": "Log Storage", "base_cost": 10.0, "usage_unit": "gibibyte"},
    {"service_id": "6521-3827-A3E5", "service_description": "Vertex AI", "sku_id": "L1M2-3456-IJKL", "sku_description": "Prediction Units", "base_cost": 50.0, "usage_unit": "node hour"},
    {"service_id": "462A-E6B5-C8D1", "service_description": "Cloud Pub/Sub", "sku_id": "M2N3-4567-JKLM", "sku_description": "Message Delivery", "base_cost": 8.0, "usage_unit": "TiB"},
]

AWS_SERVICES = [
    {"service_code": "AmazonEC2", "product_name": "Amazon Elastic Compute Cloud", "usage_type": "USW2-BoxUsage:m5.xlarge", "operation": "RunInstances", "base_cost": 180.0},
    {"service_code": "AmazonS3", "product_name": "Amazon Simple Storage Service", "usage_type": "USW2-TimedStorage-ByteHrs", "operation": "StandardStorage", "base_cost": 30.0},
    {"service_code": "AmazonRDS", "product_name": "Amazon Relational Database Service", "usage_type": "USW2-InstanceUsage:db.r5.large", "operation": "CreateDBInstance", "base_cost": 140.0},
    {"service_code": "AWSLambda", "product_name": "AWS Lambda", "usage_type": "USW2-Lambda-GB-Second", "operation": "Invoke", "base_cost": 20.0},
    {"service_code": "AmazonEKS", "product_name": "Amazon Elastic Kubernetes Service", "usage_type": "USW2-AmazonEKS-Hours:perCluster", "operation": "CreateCluster", "base_cost": 72.0},
    {"service_code": "AmazonDynamoDB", "product_name": "Amazon DynamoDB", "usage_type": "USW2-WriteCapacityUnit-Hrs", "operation": "PutItem", "base_cost": 25.0},
    {"service_code": "AmazonCloudWatch", "product_name": "Amazon CloudWatch", "usage_type": "USW2-CW:Requests", "operation": "GetMetricData", "base_cost": 12.0},
    {"service_code": "AmazonSNS", "product_name": "Amazon Simple Notification Service", "usage_type": "USW2-DeliveryAttempts-HTTPS", "operation": "Publish", "base_cost": 5.0},
    {"service_code": "AmazonSQS", "product_name": "Amazon Simple Queue Service", "usage_type": "USW2-Requests-Tier1", "operation": "SendMessage", "base_cost": 4.0},
    {"service_code": "AmazonRedshift", "product_name": "Amazon Redshift", "usage_type": "USW2-DC2.Large", "operation": "RunQuery", "base_cost": 90.0},
]

AZURE_SERVICES = [
    {"meter_category": "Virtual Machines", "service_name": "Virtual Machines", "resource_type": "Microsoft.Compute/virtualMachines", "base_cost": 160.0},
    {"meter_category": "Storage", "service_name": "Storage", "resource_type": "Microsoft.Storage/storageAccounts", "base_cost": 28.0},
    {"meter_category": "Azure SQL Database", "service_name": "SQL Database", "resource_type": "Microsoft.Sql/servers/databases", "base_cost": 130.0},
    {"meter_category": "Azure Kubernetes Service", "service_name": "Kubernetes Service", "resource_type": "Microsoft.ContainerService/managedClusters", "base_cost": 180.0},
    {"meter_category": "Azure Functions", "service_name": "Functions", "resource_type": "Microsoft.Web/sites", "base_cost": 18.0},
    {"meter_category": "Azure Cosmos DB", "service_name": "Azure Cosmos DB", "resource_type": "Microsoft.DocumentDB/databaseAccounts", "base_cost": 85.0},
    {"meter_category": "Azure App Service", "service_name": "App Service", "resource_type": "Microsoft.Web/serverFarms", "base_cost": 55.0},
    {"meter_category": "Azure Monitor", "service_name": "Azure Monitor", "resource_type": "Microsoft.Insights/components", "base_cost": 15.0},
]

OCI_SERVICES = [
    {"service": "COMPUTE", "sku_name": "VM.Standard.E4.Flex", "base_cost": 100.0},
    {"service": "OBJECT_STORAGE", "sku_name": "Object Storage - Storage", "base_cost": 20.0},
    {"service": "AUTONOMOUS_DATABASE", "sku_name": "Autonomous Transaction Processing", "base_cost": 95.0},
    {"service": "CONTAINER_ENGINE", "sku_name": "Container Engine for Kubernetes", "base_cost": 60.0},
    {"service": "FUNCTIONS", "sku_name": "Functions", "base_cost": 12.0},
]


# =============================================================================
# SaaS Subscription Configurations
# =============================================================================

SUBSCRIPTIONS = [
    {"provider": "chatgpt_plus", "plan_name": "TEAM", "display_name": "ChatGPT Team", "category": "ai", "seats": 25, "pricing_model": "PER_SEAT", "unit_price": 25.0, "billing_cycle": "monthly"},
    {"provider": "claude_pro", "plan_name": "TEAM", "display_name": "Claude Team", "category": "ai", "seats": 20, "pricing_model": "PER_SEAT", "unit_price": 25.0, "billing_cycle": "monthly"},
    {"provider": "slack", "plan_name": "BUSINESS_PLUS", "display_name": "Slack Business+", "category": "communication", "seats": 50, "pricing_model": "PER_SEAT", "unit_price": 15.0, "billing_cycle": "monthly"},
    {"provider": "github", "plan_name": "TEAM", "display_name": "GitHub Team", "category": "developer_tools", "seats": 30, "pricing_model": "PER_SEAT", "unit_price": 4.0, "billing_cycle": "monthly"},
    {"provider": "figma", "plan_name": "ORGANIZATION", "display_name": "Figma Organization", "category": "design", "seats": 15, "pricing_model": "PER_SEAT", "unit_price": 45.0, "billing_cycle": "monthly"},
    {"provider": "notion", "plan_name": "BUSINESS", "display_name": "Notion Business", "category": "productivity", "seats": 40, "pricing_model": "PER_SEAT", "unit_price": 18.0, "billing_cycle": "monthly"},
    {"provider": "cursor", "plan_name": "PRO", "display_name": "Cursor Pro", "category": "developer_tools", "seats": 10, "pricing_model": "PER_SEAT", "unit_price": 20.0, "billing_cycle": "monthly"},
    {"provider": "vercel", "plan_name": "PRO", "display_name": "Vercel Pro", "category": "infrastructure", "seats": 1, "pricing_model": "FLAT_FEE", "unit_price": 20.0, "billing_cycle": "monthly"},
    {"provider": "copilot", "plan_name": "BUSINESS", "display_name": "GitHub Copilot Business", "category": "ai", "seats": 25, "pricing_model": "PER_SEAT", "unit_price": 19.0, "billing_cycle": "monthly"},
    {"provider": "linear", "plan_name": "STANDARD", "display_name": "Linear Standard", "category": "project_management", "seats": 20, "pricing_model": "PER_SEAT", "unit_price": 8.0, "billing_cycle": "monthly"},
    {"provider": "zoom", "plan_name": "BUSINESS", "display_name": "Zoom Business", "category": "communication", "seats": 30, "pricing_model": "PER_SEAT", "unit_price": 21.99, "billing_cycle": "monthly"},
    {"provider": "jira", "plan_name": "STANDARD", "display_name": "Jira Standard", "category": "project_management", "seats": 35, "pricing_model": "PER_SEAT", "unit_price": 8.15, "billing_cycle": "monthly"},
    {"provider": "confluence", "plan_name": "STANDARD", "display_name": "Confluence Standard", "category": "productivity", "seats": 35, "pricing_model": "PER_SEAT", "unit_price": 6.05, "billing_cycle": "monthly"},
    {"provider": "canva", "plan_name": "TEAM", "display_name": "Canva for Teams", "category": "design", "seats": 20, "pricing_model": "PER_SEAT", "unit_price": 14.99, "billing_cycle": "monthly"},
    {"provider": "adobe_cc", "plan_name": "ALL_APPS", "display_name": "Adobe All Apps", "category": "design", "seats": 10, "pricing_model": "PER_SEAT", "unit_price": 59.99, "billing_cycle": "monthly"},
]


# =============================================================================
# Helper Functions - Realistic Pattern Generators
# =============================================================================

def get_weekday_multiplier(d: date) -> float:
    """Return multiplier based on day of week (Mon=0, Sun=6)."""
    weekday = d.weekday()
    if weekday < 5:  # Weekday
        return random.uniform(1.2, 1.6)
    elif weekday == 5:  # Saturday
        return random.uniform(0.5, 0.7)
    else:  # Sunday
        return random.uniform(0.4, 0.6)


def get_monthly_growth_factor(d: date, start_date: date) -> float:
    """Return growth factor based on months since start (5% monthly growth)."""
    months_elapsed = (d.year - start_date.year) * 12 + (d.month - start_date.month)
    return 1.0 + (0.05 * months_elapsed)


def get_seasonal_factor(d: date) -> float:
    """Return seasonal factor with more pronounced Q4 boost."""
    month = d.month
    if month in [11, 12]:  # November-December (holiday season)
        return random.uniform(1.2, 1.5)
    elif month == 10:  # October (pre-holiday prep)
        return random.uniform(1.1, 1.25)
    elif month in [7, 8]:  # Summer (lower)
        return random.uniform(0.8, 0.9)
    elif month in [1]:  # January (post-holiday recovery)
        return random.uniform(0.85, 0.95)
    elif month in [2, 3]:  # Q1 ramp up
        return random.uniform(0.95, 1.05)
    elif month in [4, 5, 6]:  # Q2 stable growth
        return random.uniform(1.0, 1.1)
    else:  # September
        return random.uniform(1.05, 1.15)  # Back to school/work


def get_holiday_multiplier(d: date) -> float:
    """Return multiplier for holiday dates."""
    if d in HOLIDAYS_2025:
        return HOLIDAYS_2025[d][0]

    # Check if adjacent to a major holiday (+/- 1 day)
    for holiday_date, (mult, _) in HOLIDAYS_2025.items():
        if mult >= 1.5:  # Only major holidays
            if abs((d - holiday_date).days) == 1:
                return HOLIDAY_ADJACENT_MULTIPLIER

    return 1.0


def get_anomaly_multiplier(d: date) -> float:
    """Return multiplier for anomaly periods."""
    # Incident week (high costs)
    if INCIDENT_WEEK_START <= d <= INCIDENT_WEEK_END:
        return INCIDENT_MULTIPLIER

    # Summer dip week (low costs)
    if SUMMER_DIP_START <= d <= SUMMER_DIP_END:
        return SUMMER_DIP_MULTIPLIER

    # Random spike days
    if d in RANDOM_SPIKE_DAYS:
        return random.uniform(1.4, 1.8)

    return 1.0


def get_month_end_multiplier(d: date) -> float:
    """Return multiplier for month-end budget flush."""
    _, days_in_month = monthrange(d.year, d.month)
    days_remaining = days_in_month - d.day

    if days_remaining <= 2:  # Last 3 days of month
        return random.uniform(1.1, 1.2)

    return 1.0


def get_combined_multiplier(d: date, start_date: date) -> float:
    """Get the combined multiplier for a given date."""
    base = 1.0

    # Apply all factors
    base *= get_weekday_multiplier(d)
    base *= get_monthly_growth_factor(d, start_date)
    base *= get_seasonal_factor(d)
    base *= get_holiday_multiplier(d)
    base *= get_anomaly_multiplier(d)
    base *= get_month_end_multiplier(d)

    # Add some random noise (+/- 10%)
    base *= random.uniform(0.9, 1.1)

    return base


def generate_run_id(provider: str, d: date) -> str:
    """Generate a deterministic run ID for a date."""
    return f"run_demo_{provider}_{d.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}"


def get_days_in_billing_cycle(billing_cycle: str) -> int:
    """Get average days in a billing cycle."""
    cycles = {
        "monthly": 30,
        "quarterly": 91,
        "semi-annual": 182,
        "annual": 365,
        "weekly": 7,
    }
    return cycles.get(billing_cycle, 30)


# =============================================================================
# Data Generators
# =============================================================================

def generate_genai_data(start_date: date, end_date: date) -> Dict[str, List[Dict]]:
    """Generate GenAI usage data for all providers with realistic patterns."""
    print("Generating GenAI usage data...")

    all_data = {}

    for provider_name, config in GENAI_PROVIDERS.items():
        print(f"  - {provider_name}...")
        records = []
        current_date = start_date

        while current_date <= end_date:
            run_id = generate_run_id(provider_name, current_date)
            combined_mult = get_combined_multiplier(current_date, start_date)

            for model_config in config["models"]:
                base_input = model_config["input_base"]
                base_output = model_config["output_base"]

                input_tokens = int(base_input * combined_mult * random.uniform(0.85, 1.15))
                output_tokens = int(base_output * combined_mult * random.uniform(0.85, 1.15))
                cached_input = int(input_tokens * model_config["cached_ratio"] * random.uniform(0.8, 1.2))
                total_tokens = input_tokens + output_tokens
                request_count = max(100, int(total_tokens / random.randint(500, 2000)))
                successful = int(request_count * random.uniform(0.97, 0.995))
                failed = request_count - successful

                record = {
                    "usage_date": current_date.isoformat(),
                    "org_slug": ORG_SLUG,
                    "provider": provider_name,
                    "model": model_config["model"],
                    "model_family": model_config["model_family"],
                    "region": "global",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cached_input_tokens": cached_input,
                    "total_tokens": total_tokens,
                    "request_count": request_count,
                    "is_batch": random.random() < 0.1,
                    "successful_requests": successful,
                    "failed_requests": failed,
                    "avg_latency_ms": round(random.uniform(200, 2000), 2),
                    "hierarchy_entity_id": None,
                    "hierarchy_entity_name": None,
                    "hierarchy_level_code": None,
                    "hierarchy_path": None,
                    "hierarchy_path_names": None,
                    "x_pipeline_id": config["pipeline_id"],
                    "x_credential_id": config["credential_id"],
                    "x_pipeline_run_date": current_date.isoformat(),
                    "x_run_id": run_id,
                    "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
                }
                records.append(record)

            current_date += timedelta(days=1)

        all_data[provider_name] = records
        print(f"    Generated {len(records)} records")

    return all_data


def generate_gcp_billing_data(start_date: date, end_date: date) -> List[Dict]:
    """Generate GCP billing data with realistic patterns."""
    print("Generating GCP billing data...")
    records = []
    current_date = start_date

    while current_date <= end_date:
        run_id = generate_run_id("gcp", current_date)
        combined_mult = get_combined_multiplier(current_date, start_date)

        for service in GCP_SERVICES:
            cost = round(service["base_cost"] * combined_mult * random.uniform(0.8, 1.2), 2)
            usage_amount = round(cost * random.uniform(5, 20), 2)

            record = {
                "billing_account_id": "01A2B3-C4D5E6-F7G8H9",
                "service_id": service["service_id"],
                "service_description": service["service_description"],
                "sku_id": service["sku_id"],
                "sku_description": service["sku_description"],
                "usage_start_time": f"{current_date.isoformat()}T00:00:00Z",
                "usage_end_time": f"{current_date.isoformat()}T23:59:59Z",
                "project_id": "genai-community-prod",
                "project_name": "GenAI Community Production",
                "project_number": "123456789012",
                "location_location": "us-central1",
                "location_region": "us-central1",
                "location_zone": "us-central1-a",
                "resource_name": f"{service['service_description'].lower().replace(' ', '-')}-instance-1",
                "resource_global_name": None,
                "cost": cost,
                "currency": "USD",
                "currency_conversion_rate": 1.0,
                "usage_amount": usage_amount,
                "usage_unit": service["usage_unit"],
                "usage_amount_in_pricing_units": usage_amount,
                "usage_pricing_unit": service["usage_unit"],
                "cost_type": "regular",
                "credits_total": 0.0,
                "cost_at_list": round(cost * 1.1, 2),
                "invoice_month": current_date.strftime("%Y%m"),
                "ingestion_date": current_date.isoformat(),
                "labels_json": json.dumps({"env": "prod", "team": "genai"}),
                "system_labels_json": None,
                "org_slug": ORG_SLUG,
                "x_pipeline_id": "cloud_cost_gcp",
                "x_credential_id": "cred_gcp_demo_001",
                "x_pipeline_run_date": current_date.isoformat(),
                "x_run_id": run_id,
                "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
            }
            records.append(record)

        current_date += timedelta(days=1)

    print(f"  Generated {len(records)} records")
    return records


def generate_aws_billing_data(start_date: date, end_date: date) -> List[Dict]:
    """Generate AWS billing data with realistic patterns."""
    print("Generating AWS billing data...")
    records = []
    current_date = start_date

    while current_date <= end_date:
        run_id = generate_run_id("aws", current_date)
        combined_mult = get_combined_multiplier(current_date, start_date)

        for service in AWS_SERVICES:
            unblended_cost = round(service["base_cost"] * combined_mult * random.uniform(0.8, 1.2), 2)
            usage_amount = round(random.uniform(10, 100), 2)

            # Calculate billing period end
            if current_date.month < 12:
                billing_end = date(current_date.year, current_date.month + 1, 1).isoformat()
            else:
                billing_end = date(current_date.year + 1, 1, 1).isoformat()

            record = {
                "usage_date": current_date.isoformat(),
                "org_slug": ORG_SLUG,
                "provider": "aws",
                "linked_account_id": "123456789012",
                "linked_account_name": "GenAI Community Production",
                "payer_account_id": "123456789012",
                "service_code": service["service_code"],
                "product_code": service["service_code"],
                "product_name": service["product_name"],
                "usage_type": service["usage_type"],
                "operation": service["operation"],
                "region": "us-west-2",
                "availability_zone": "us-west-2a",
                "resource_id": f"arn:aws:{service['service_code'].lower()}:us-west-2:123456789012:resource-{random.randint(1000, 9999)}",
                "line_item_type": "Usage",
                "usage_start_time": f"{current_date.isoformat()}T00:00:00Z",
                "usage_end_time": f"{current_date.isoformat()}T23:59:59Z",
                "usage_amount": usage_amount,
                "usage_unit": "Hrs",
                "unblended_cost": unblended_cost,
                "blended_cost": round(unblended_cost * 0.95, 2),
                "amortized_cost": round(unblended_cost * 0.9, 2),
                "net_unblended_cost": round(unblended_cost * 0.98, 2),
                "currency": "USD",
                "pricing_unit": "Hrs",
                "public_on_demand_cost": round(unblended_cost * 1.15, 2),
                "reservation_arn": None,
                "savings_plan_arn": None,
                "discount_amount": 0.0,
                "invoice_id": f"INV-{current_date.strftime('%Y%m')}-{random.randint(1000, 9999)}",
                "billing_period_start": current_date.replace(day=1).isoformat(),
                "billing_period_end": billing_end,
                "resource_tags_json": json.dumps({"Environment": "Production", "Team": "GenAI"}),
                "cost_category_json": None,
                "ingestion_timestamp": f"{current_date.isoformat()}T23:59:59Z",
                "x_pipeline_id": "cloud_cost_aws",
                "x_credential_id": "cred_aws_demo_001",
                "x_pipeline_run_date": current_date.isoformat(),
                "x_run_id": run_id,
                "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
            }
            records.append(record)

        current_date += timedelta(days=1)

    print(f"  Generated {len(records)} records")
    return records


def generate_azure_billing_data(start_date: date, end_date: date) -> List[Dict]:
    """Generate Azure billing data with realistic patterns."""
    print("Generating Azure billing data...")
    records = []
    current_date = start_date

    while current_date <= end_date:
        run_id = generate_run_id("azure", current_date)
        combined_mult = get_combined_multiplier(current_date, start_date)

        for service in AZURE_SERVICES:
            cost = round(service["base_cost"] * combined_mult * random.uniform(0.8, 1.2), 2)
            usage_quantity = round(random.uniform(10, 200), 2)

            # Calculate billing period end
            if current_date.month < 12:
                billing_end = date(current_date.year, current_date.month + 1, 1).isoformat()
            else:
                billing_end = date(current_date.year + 1, 1, 1).isoformat()

            record = {
                "usage_date": current_date.isoformat(),
                "org_slug": ORG_SLUG,
                "provider": "azure",
                "subscription_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "subscription_name": "India Inc Production",
                "resource_group": "india-inc-prod-rg",
                "resource_id": f"/subscriptions/a1b2c3d4-e5f6-7890-abcd-ef1234567890/resourceGroups/india-inc-prod-rg/providers/{service['resource_type']}/resource-{random.randint(1000, 9999)}",
                "resource_name": f"{service['service_name'].lower().replace(' ', '-')}-{random.randint(1, 5)}",
                "resource_type": service["resource_type"],
                "resource_location": "eastus",
                "service_name": service["service_name"],
                "service_tier": "Standard",
                "service_family": "Compute",
                "meter_id": str(uuid.uuid4()),
                "meter_name": f"{service['service_name']} Usage",
                "meter_category": service["meter_category"],
                "meter_subcategory": "General Purpose",
                "meter_region": "US East",
                "product_name": service["service_name"],
                "product_order_id": None,
                "product_order_name": None,
                "consumed_service": service["resource_type"].split("/")[0],
                "charge_type": "Usage",
                "billing_period_start": current_date.replace(day=1).isoformat(),
                "billing_period_end": billing_end,
                "usage_start_time": f"{current_date.isoformat()}T00:00:00Z",
                "usage_end_time": f"{current_date.isoformat()}T23:59:59Z",
                "usage_quantity": usage_quantity,
                "unit_of_measure": "Hours",
                "cost_in_billing_currency": cost,
                "cost_in_usd": cost,
                "billing_currency": "USD",
                "exchange_rate": 1.0,
                "effective_price": round(cost / max(usage_quantity, 1), 4),
                "unit_price": round(cost / max(usage_quantity, 1) * 1.1, 4),
                "pricing_model": "OnDemand",
                "reservation_id": None,
                "reservation_name": None,
                "frequency": "UsageBased",
                "publisher_type": "Azure",
                "publisher_name": "Microsoft",
                "invoice_id": f"INV-{current_date.strftime('%Y%m')}-AZURE",
                "invoice_section_id": None,
                "invoice_section_name": None,
                "billing_account_id": "billing-acct-001",
                "billing_account_name": "India Inc Billing",
                "billing_profile_id": "profile-001",
                "billing_profile_name": "Default Profile",
                "cost_center": "Engineering",
                "benefit_id": None,
                "benefit_name": None,
                "is_azure_credit_eligible": True,
                "resource_tags_json": json.dumps({"env": "prod", "team": "engineering"}),
                "ingestion_timestamp": f"{current_date.isoformat()}T23:59:59Z",
                "x_pipeline_id": "cloud_cost_azure",
                "x_credential_id": "cred_azure_demo_001",
                "x_pipeline_run_date": current_date.isoformat(),
                "x_run_id": run_id,
                "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
            }
            records.append(record)

        current_date += timedelta(days=1)

    print(f"  Generated {len(records)} records")
    return records


def generate_oci_billing_data(start_date: date, end_date: date) -> List[Dict]:
    """Generate OCI billing data with realistic patterns."""
    print("Generating OCI billing data...")
    records = []
    current_date = start_date

    while current_date <= end_date:
        run_id = generate_run_id("oci", current_date)
        combined_mult = get_combined_multiplier(current_date, start_date)

        for service in OCI_SERVICES:
            cost = round(service["base_cost"] * combined_mult * random.uniform(0.8, 1.2), 2)
            usage_quantity = round(random.uniform(5, 50), 2)

            record = {
                "usage_date": current_date.isoformat(),
                "org_slug": ORG_SLUG,
                "provider": "oci",
                "tenancy_id": "ocid1.tenancy.oc1..aaaaaaaaindiaincprod",
                "tenancy_name": "India Inc Production",
                "compartment_id": "ocid1.compartment.oc1..aaaaaaaaprod",
                "compartment_name": "Production",
                "compartment_path": "/Production",
                "region": "us-ashburn-1",
                "availability_domain": "AD-1",
                "service_name": service["service"],
                "sku_name": service["sku_name"],
                "sku_part_number": f"B{random.randint(10000, 99999)}",
                "resource_id": f"ocid1.{service['service'].lower()}.oc1..aaaaaaaademo{random.randint(1000, 9999)}",
                "resource_name": f"{service['service'].lower()}-instance-{random.randint(1, 5)}",
                "usage_type": "USAGE",
                "unit": "HOURS",
                "usage_start_time": f"{current_date.isoformat()}T00:00:00Z",
                "usage_end_time": f"{current_date.isoformat()}T23:59:59Z",
                "usage_quantity": usage_quantity,
                "computed_quantity": usage_quantity,
                "cost": cost,
                "unit_price": round(cost / max(usage_quantity, 1), 4),
                "currency": "USD",
                "overage_flag": "N",
                "is_correction": False,
                "subscription_id": "sub_oci_demo_001",
                "platform_type": "IAAS",
                "billing_period": current_date.strftime("%Y-%m"),
                "freeform_tags_json": json.dumps({"env": "prod", "team": "engineering"}),
                "defined_tags_json": json.dumps({"Oracle-Tags": {"CreatedBy": "demo"}}),
                "ingestion_timestamp": f"{current_date.isoformat()}T23:59:59Z",
                "x_pipeline_id": "cloud_cost_oci",
                "x_credential_id": "cred_oci_demo_001",
                "x_pipeline_run_date": current_date.isoformat(),
                "x_run_id": run_id,
                "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
            }
            records.append(record)

        current_date += timedelta(days=1)

    print(f"  Generated {len(records)} records")
    return records


def generate_subscription_plans_data(start_date: date) -> List[Dict]:
    """Generate SaaS subscription plan data (static master data)."""
    print("Generating subscription plans data...")
    records = []

    for i, sub in enumerate(SUBSCRIPTIONS, 1):
        record = {
            "org_slug": ORG_SLUG,
            "subscription_id": f"sub_{sub['provider']}_{sub['plan_name'].lower()}_{i:03d}",
            "provider": sub["provider"],
            "plan_name": sub["plan_name"],
            "display_name": sub["display_name"],
            "category": sub["category"],
            "status": "active",
            "start_date": start_date.isoformat(),
            "end_date": "",
            "billing_cycle": sub["billing_cycle"],
            "billing_anchor_day": "",
            "currency": "USD",
            "seats": sub["seats"],
            "pricing_model": sub["pricing_model"],
            "unit_price": sub["unit_price"],
            "yearly_price": "",
            "discount_type": "",
            "discount_value": "",
            "auto_renew": "TRUE",
            "payment_method": "credit_card",
            "invoice_id_last": f"INV-{start_date.strftime('%Y%m')}-{i:04d}",
            "owner_email": "finance@genai-community.com",
            "department": "",
            "hierarchy_entity_id": "",
            "hierarchy_entity_name": "",
            "hierarchy_level_code": "",
            "hierarchy_path": "",
            "hierarchy_path_names": "",
            "renewal_date": "",
            "contract_id": "",
            "notes": f"Demo subscription for {sub['display_name']}",
            "source_currency": "",
            "source_price": "",
            "exchange_rate_used": "",
            "updated_at": f"{start_date.isoformat()}T00:00:00Z",
        }
        records.append(record)

    print(f"  Generated {len(records)} subscription plans")
    return records


def generate_subscription_costs_daily(start_date: date, end_date: date) -> List[Dict]:
    """Generate daily amortized subscription costs."""
    print("Generating daily subscription costs...")
    records = []
    current_date = start_date

    while current_date <= end_date:
        run_id = generate_run_id("subscription", current_date)
        days_in_month = monthrange(current_date.year, current_date.month)[1]

        for i, sub in enumerate(SUBSCRIPTIONS, 1):
            subscription_id = f"sub_{sub['provider']}_{sub['plan_name'].lower()}_{i:03d}"

            # Calculate cycle cost
            if sub["pricing_model"] == "PER_SEAT":
                cycle_cost = sub["unit_price"] * sub["seats"]
            else:
                cycle_cost = sub["unit_price"]

            # Calculate daily cost based on billing cycle
            days_in_cycle = get_days_in_billing_cycle(sub["billing_cycle"])
            daily_cost = round(cycle_cost / days_in_cycle, 4)
            monthly_run_rate = round(daily_cost * days_in_month, 2)
            annual_run_rate = round(daily_cost * 365, 2)

            record = {
                "org_slug": ORG_SLUG,
                "provider": sub["provider"],
                "subscription_id": subscription_id,
                "plan_name": sub["plan_name"],
                "display_name": sub["display_name"],
                "cost_date": current_date.isoformat(),
                "billing_cycle": sub["billing_cycle"],
                "currency": "USD",
                "seats": sub["seats"],
                "pricing_model": sub["pricing_model"],
                "cycle_cost": cycle_cost,
                "daily_cost": daily_cost,
                "monthly_run_rate": monthly_run_rate,
                "annual_run_rate": annual_run_rate,
                "invoice_id_last": f"INV-{current_date.strftime('%Y%m')}-{i:04d}",
                "source": "subscription_amortization",
                "x_pipeline_run_date": current_date.isoformat(),
                "hierarchy_entity_id": None,
                "hierarchy_entity_name": None,
                "hierarchy_level_code": None,
                "hierarchy_path": None,
                "hierarchy_path_names": None,
                "updated_at": f"{current_date.isoformat()}T23:59:59Z",
                "x_pipeline_id": "subscription_cost",
                "x_credential_id": "cred_subscription_demo_001",
                "x_run_id": run_id,
                "x_ingested_at": f"{current_date.isoformat()}T23:59:59Z",
            }
            records.append(record)

        current_date += timedelta(days=1)

    print(f"  Generated {len(records)} daily cost records")
    return records


def write_json_data(data: List[Dict], filepath: Path):
    """Write data as newline-delimited JSON."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, 'w') as f:
        for record in data:
            f.write(json.dumps(record) + '\n')
    print(f"  Wrote {len(data)} records to {filepath}")


def write_csv_data(data: List[Dict], filepath: Path):
    """Write data as CSV."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    if not data:
        return

    fieldnames = list(data[0].keys())
    with open(filepath, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    print(f"  Wrote {len(data)} records to {filepath}")


def print_summary(start_date: date, end_date: date):
    """Print a summary of the realistic patterns in the data."""
    print()
    print("=" * 70)
    print("  DATA PATTERNS SUMMARY")
    print("=" * 70)
    print()
    print("📅 DATE RANGE:")
    print(f"   {start_date} to {end_date} ({(end_date - start_date).days + 1} days)")
    print()
    print("🎄 HOLIDAYS WITH SPIKES:")
    for d, (mult, name) in sorted(HOLIDAYS_2025.items()):
        spike = "🔥" if mult >= 2.0 else "📈" if mult >= 1.5 else "↗️"
        print(f"   {spike} {d.strftime('%b %d')}: {name} ({mult}x)")
    print()
    print("⚠️ ANOMALY PERIODS:")
    print(f"   🚨 Incident Week: {INCIDENT_WEEK_START} to {INCIDENT_WEEK_END} ({INCIDENT_MULTIPLIER}x)")
    print(f"   🌴 Summer Dip: {SUMMER_DIP_START} to {SUMMER_DIP_END} ({SUMMER_DIP_MULTIPLIER}x)")
    print(f"   📈 Random Spike Days: {len(RANDOM_SPIKE_DAYS)} days throughout the year")
    print()
    print("📊 SEASONAL PATTERNS:")
    print("   Q1 (Jan-Mar): 0.85-1.05x (post-holiday recovery)")
    print("   Q2 (Apr-Jun): 1.0-1.1x (stable growth)")
    print("   Q3 (Jul-Sep): 0.8-1.15x (summer dip → back to work)")
    print("   Q4 (Oct-Dec): 1.1-1.5x (holiday shopping surge)")
    print()
    print("📆 WEEKLY PATTERNS:")
    print("   Weekdays: 1.2-1.6x")
    print("   Saturday: 0.5-0.7x")
    print("   Sunday: 0.4-0.6x")
    print()
    print("💰 MONTH-END PATTERNS:")
    print("   Last 3 days of month: 1.1-1.2x (budget flush)")
    print()


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Generate demo data for CloudAct")
    parser.add_argument("--start-date", type=str, default="2025-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default="2026-01-02", help="End date (YYYY-MM-DD)")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="Random seed for reproducibility")
    args = parser.parse_args()

    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()

    # Set random seed for reproducibility
    random.seed(args.seed)

    print()
    print("=" * 70)
    print("  CloudAct Demo Data Generator - REALISTIC PATTERNS")
    print(f"  Organization: {ORG_SLUG}")
    print(f"  Date Range: {start_date} to {end_date}")
    print("=" * 70)
    print()

    # Generate GenAI data
    genai_data = generate_genai_data(start_date, end_date)
    for provider, records in genai_data.items():
        write_json_data(records, GENAI_DIR / f"{provider}_usage_raw.json")

    print()

    # Generate Cloud billing data
    gcp_data = generate_gcp_billing_data(start_date, end_date)
    write_json_data(gcp_data, CLOUD_DIR / "gcp_billing_raw.json")

    aws_data = generate_aws_billing_data(start_date, end_date)
    write_json_data(aws_data, CLOUD_DIR / "aws_billing_raw.json")

    azure_data = generate_azure_billing_data(start_date, end_date)
    write_json_data(azure_data, CLOUD_DIR / "azure_billing_raw.json")

    oci_data = generate_oci_billing_data(start_date, end_date)
    write_json_data(oci_data, CLOUD_DIR / "oci_billing_raw.json")

    print()

    # Generate Subscription data (master plans only - daily costs generated by pipelines)
    subscription_plans = generate_subscription_plans_data(start_date)
    write_csv_data(subscription_plans, SUBSCRIPTIONS_DIR / "subscription_plans.csv")
    # NOTE: Daily subscription costs are NOT generated here - pipelines create them
    # from subscription_plans using sp_subscription_2_calculate_daily_costs

    print()

    # Print pattern summary
    print_summary(start_date, end_date)

    print("=" * 70)
    print("  Data generation complete!")
    print("=" * 70)
    print()
    print("📁 Output files:")
    print(f"   {GENAI_DIR}/")
    print("     - openai_usage_raw.json")
    print("     - anthropic_usage_raw.json")
    print("     - gemini_usage_raw.json")
    print(f"   {CLOUD_DIR}/")
    print("     - gcp_billing_raw.json")
    print("     - aws_billing_raw.json")
    print("     - azure_billing_raw.json")
    print("     - oci_billing_raw.json")
    print(f"   {SUBSCRIPTIONS_DIR}/")
    print("     - subscription_plans.csv (master data only)")
    print()
    print("Next steps:")
    print("  1. Review generated data in data/ directory")
    print("  2. Load pricing: ./scripts/00-load-pricing-seed.sh")
    print("  3. Load raw data: ./scripts/load-all.sh")
    print("  4. Sync procedures: ./scripts/05-sync-procedures.sh")
    print("  5. Run pipelines: ./scripts/04-run-pipelines.sh")
    print("  6. Verify costs in cost_data_standard_1_3")
    print()


if __name__ == "__main__":
    main()
