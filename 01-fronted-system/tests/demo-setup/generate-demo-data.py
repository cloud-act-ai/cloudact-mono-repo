#!/usr/bin/env python3
"""
Demo Data Generator for CloudAct

Generates realistic demo data matching the actual BigQuery schemas.
Includes random spikes for cost data to simulate real-world patterns.

Usage:
    python generate-demo-data.py --org-slug acme_inc_xxx --start-date 2024-01-01 --end-date 2025-12-31
    python generate-demo-data.py --org-slug acme_inc_xxx --start-date 2024-01-01 --end-date 2025-12-31 --load
"""

import argparse
import json
import random
import subprocess
import tempfile
import uuid
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Any

# Configuration
GCP_PROJECT = "cloudact-testing-1"

# =============================================================================
# Category Constants (must match frontend expectations)
# =============================================================================
# Frontend expects lowercase category names in GranularCostRow.category:
#   - "genai" (NOT "LLM" or "AI/ML")
#   - "cloud" (NOT "Cloud")
#   - "subscription" (NOT "SaaS" or "Software")
#   - "other"

CATEGORY_GENAI = "genai"
CATEGORY_CLOUD = "cloud"
CATEGORY_SUBSCRIPTION = "subscription"

# Provider configurations
GENAI_PROVIDERS = {
    "openai": {
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "text-embedding-3-large"],
        "regions": ["us-east-1", "us-west-2", "eu-west-1"],
    },
    "anthropic": {
        "models": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        "regions": ["us-east-1", "eu-west-1"],
    },
    "gemini": {
        "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
        "regions": ["us-central1", "europe-west4"],
    },
}

CLOUD_PROVIDERS = {
    "gcp": {
        "services": [
            ("compute.googleapis.com", "Compute Engine"),
            ("bigquery.googleapis.com", "BigQuery"),
            ("storage.googleapis.com", "Cloud Storage"),
            ("cloudfunctions.googleapis.com", "Cloud Functions"),
            ("run.googleapis.com", "Cloud Run"),
        ],
        "regions": ["us-central1", "us-east1", "europe-west1", "asia-east1"],
        "billing_account": "01A2B3-C4D5E6-F7G8H9",
    },
    "aws": {
        "services": [
            ("AmazonEC2", "Amazon Elastic Compute Cloud"),
            ("AmazonS3", "Amazon Simple Storage Service"),
            ("AmazonRDS", "Amazon Relational Database Service"),
            ("AWSLambda", "AWS Lambda"),
            ("AmazonDynamoDB", "Amazon DynamoDB"),
        ],
        "regions": ["us-east-1", "us-west-2", "eu-west-1", "ap-northeast-1"],
        "payer_account": "123456789012",
    },
}

SUBSCRIPTION_PROVIDERS = [
    {"provider": "canva", "plan_name": "Canva Pro", "category": "design", "unit_price": 12.99},
    {"provider": "slack", "plan_name": "Slack Pro", "category": "communication", "unit_price": 8.75},
    {"provider": "chatgpt_plus", "plan_name": "ChatGPT Plus", "category": "ai", "unit_price": 20.00},
    {"provider": "notion", "plan_name": "Notion Plus", "category": "productivity", "unit_price": 10.00},
    {"provider": "figma", "plan_name": "Figma Professional", "category": "design", "unit_price": 15.00},
    {"provider": "github", "plan_name": "GitHub Team", "category": "development", "unit_price": 4.00},
    {"provider": "jira", "plan_name": "Jira Standard", "category": "project_management", "unit_price": 8.15},
]

# Hierarchy entities for cost allocation
HIERARCHY_ENTITIES = [
    {"entity_id": "DEPT-001", "entity_name": "Engineering", "level_code": "DEPT", "path": "/DEPT-001", "path_names": "Engineering"},
    {"entity_id": "DEPT-002", "entity_name": "Data Science", "level_code": "DEPT", "path": "/DEPT-002", "path_names": "Data Science"},
    {"entity_id": "PROJ-001", "entity_name": "Platform", "level_code": "PROJ", "path": "/DEPT-001/PROJ-001", "path_names": "Engineering > Platform"},
    {"entity_id": "PROJ-002", "entity_name": "ML Pipeline", "level_code": "PROJ", "path": "/DEPT-002/PROJ-002", "path_names": "Data Science > ML Pipeline"},
    {"entity_id": "TEAM-001", "entity_name": "Backend Team", "level_code": "TEAM", "path": "/DEPT-001/PROJ-001/TEAM-001", "path_names": "Engineering > Platform > Backend Team"},
    {"entity_id": "TEAM-002", "entity_name": "Frontend Team", "level_code": "TEAM", "path": "/DEPT-001/PROJ-001/TEAM-002", "path_names": "Engineering > Platform > Frontend Team"},
    {"entity_id": "TEAM-003", "entity_name": "ML Team", "level_code": "TEAM", "path": "/DEPT-002/PROJ-002/TEAM-003", "path_names": "Data Science > ML Pipeline > ML Team"},
]


class DemoDataGenerator:
    """Generates realistic demo data with optional spikes."""

    def __init__(self, org_slug: str, start_date: date, end_date: date, spike_probability: float = 0.05):
        self.org_slug = org_slug
        self.start_date = start_date
        self.end_date = end_date
        self.spike_probability = spike_probability
        self.dataset = f"{org_slug}_local"

        # Generate date list
        self.dates = []
        current = start_date
        while current <= end_date:
            self.dates.append(current)
            current += timedelta(days=1)

        print(f"Generating data for {len(self.dates)} days ({start_date} to {end_date})")

    def _should_spike(self) -> bool:
        """Determine if this record should have a spike."""
        return random.random() < self.spike_probability

    def _get_spike_multiplier(self) -> float:
        """Get a random spike multiplier (2x to 10x)."""
        return random.uniform(2.0, 10.0) if self._should_spike() else 1.0

    def _get_hierarchy(self) -> Dict[str, Any]:
        """Get a random hierarchy entity."""
        entity = random.choice(HIERARCHY_ENTITIES)
        return {
            "x_hierarchy_entity_id": entity["entity_id"],
            "x_hierarchy_entity_name": entity["entity_name"],
            "x_hierarchy_level_code": entity["level_code"],
            "x_hierarchy_path": entity["path"],
            "x_hierarchy_path_names": entity["path_names"],
        }

    def generate_genai_payg_usage(self) -> List[Dict[str, Any]]:
        """Generate GenAI PAYG usage data - matches genai_payg_usage_raw schema."""
        records = []

        for usage_date in self.dates:
            for provider_name, provider_config in GENAI_PROVIDERS.items():
                num_records = random.randint(1, 3)

                for _ in range(num_records):
                    model = random.choice(provider_config["models"])
                    region = random.choice(provider_config["regions"])

                    spike = self._get_spike_multiplier()
                    input_tokens = int(random.randint(10000, 500000) * spike)
                    output_tokens = int(random.randint(5000, 200000) * spike)
                    cached_tokens = int(input_tokens * random.uniform(0, 0.3))

                    hierarchy = self._get_hierarchy()

                    record = {
                        "usage_date": usage_date.isoformat(),
                        "x_org_slug": self.org_slug,
                        "provider": provider_name,
                        "model": model,
                        "region": region,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cached_input_tokens": cached_tokens,
                        "total_tokens": input_tokens + output_tokens,
                        "request_count": random.randint(10, 1000),
                        "x_genai_provider": provider_name,
                        "x_hierarchy_entity_id": hierarchy["x_hierarchy_entity_id"],
                        "x_hierarchy_entity_name": hierarchy["x_hierarchy_entity_name"],
                        "x_hierarchy_level_code": hierarchy["x_hierarchy_level_code"],
                        "x_hierarchy_path": hierarchy["x_hierarchy_path"],
                        "x_hierarchy_path_names": hierarchy["x_hierarchy_path_names"],
                        "x_ingestion_id": str(uuid.uuid4()),
                        "x_ingestion_date": usage_date.isoformat(),
                        "x_pipeline_id": f"genai_payg_{provider_name}",
                        "x_credential_id": "demo_credential",
                        "x_pipeline_run_date": usage_date.isoformat(),
                        "x_run_id": str(uuid.uuid4()),
                        "x_ingested_at": datetime.now().isoformat(),
                    }
                    records.append(record)

        print(f"Generated {len(records)} GenAI PAYG usage records")
        return records

    def generate_genai_payg_pricing(self) -> List[Dict[str, Any]]:
        """Generate GenAI PAYG pricing - matches genai_payg_pricing schema."""
        records = []

        pricing_rates = {
            "openai": {"input": 2.50, "output": 10.00},
            "anthropic": {"input": 3.00, "output": 15.00},
            "gemini": {"input": 1.25, "output": 5.00},
        }

        for provider_name, provider_config in GENAI_PROVIDERS.items():
            for model in provider_config["models"]:
                for region in provider_config["regions"]:
                    base = pricing_rates.get(provider_name, {"input": 2.00, "output": 8.00})
                    variation = random.uniform(0.8, 1.2)

                    record = {
                        "x_org_slug": self.org_slug,
                        "provider": provider_name,
                        "model": model,
                        "model_family": model.split("-")[0] if "-" in model else model,
                        "model_version": "latest",
                        "region": region,
                        "input_per_1m": round(base["input"] * variation, 4),
                        "output_per_1m": round(base["output"] * variation, 4),
                        "cached_input_per_1m": round(base["input"] * variation * 0.5, 4),
                        "cached_write_per_1m": None,
                        "batch_input_per_1m": round(base["input"] * variation * 0.5, 4),
                        "batch_output_per_1m": round(base["output"] * variation * 0.5, 4),
                        "cached_discount_pct": 50.0,
                        "batch_discount_pct": 50.0,
                        "volume_discount_pct": 0.0,
                        "context_window": random.choice([8192, 16384, 32768, 128000, 200000]),
                        "max_output_tokens": random.choice([4096, 8192, 16384]),
                        "supports_vision": model in ["gpt-4o", "claude-3-5-sonnet-20241022", "gemini-1.5-pro"],
                        "supports_streaming": True,
                        "supports_tools": True,
                        "rate_limit_rpm": random.choice([60, 100, 500, 1000]),
                        "rate_limit_tpm": random.choice([10000, 40000, 100000, 200000]),
                        "sla_uptime_pct": 99.9,
                        "effective_from": self.start_date.isoformat(),
                        "effective_to": None,
                        "status": "active",
                        "is_override": False,
                        "override_input_per_1m": None,
                        "override_output_per_1m": None,
                        "override_effective_from": None,
                        "override_notes": None,
                        "last_updated": datetime.now().isoformat(),
                        "x_ingestion_date": self.start_date.isoformat(),
                        "x_pipeline_id": "genai_pricing_seed",
                        "x_credential_id": "demo_credential",
                        "x_pipeline_run_date": self.start_date.isoformat(),
                        "x_run_id": str(uuid.uuid4()),
                        "x_ingested_at": datetime.now().isoformat(),
                    }
                    records.append(record)

        print(f"Generated {len(records)} GenAI PAYG pricing records")
        return records

    def generate_cloud_gcp_billing(self) -> List[Dict[str, Any]]:
        """Generate GCP billing data - matches cloud_gcp_billing_raw_daily schema."""
        records = []

        for usage_date in self.dates:
            for service_id, service_desc in CLOUD_PROVIDERS["gcp"]["services"]:
                num_records = random.randint(2, 5)

                for _ in range(num_records):
                    region = random.choice(CLOUD_PROVIDERS["gcp"]["regions"])
                    spike = self._get_spike_multiplier()
                    cost = round(random.uniform(5, 500) * spike, 2)
                    usage_amount = random.uniform(100, 10000)

                    hierarchy = self._get_hierarchy()
                    start_time = datetime.combine(usage_date, datetime.min.time())
                    end_time = start_time + timedelta(hours=random.randint(1, 24))

                    record = {
                        "billing_account_id": CLOUD_PROVIDERS["gcp"]["billing_account"],
                        "service_id": service_id,
                        "service_description": service_desc,
                        "sku_id": f"SKU-{uuid.uuid4().hex[:8].upper()}",
                        "sku_description": f"{service_desc} - Standard Usage",
                        "usage_start_time": start_time.isoformat(),
                        "usage_end_time": end_time.isoformat(),
                        "project_id": f"project-{random.randint(1, 5)}",
                        "project_name": f"Project {random.randint(1, 5)}",
                        "project_number": str(random.randint(100000000000, 999999999999)),
                        "location_location": region,
                        "location_region": region,
                        "location_zone": f"{region}-a",
                        "resource_name": f"resource-{uuid.uuid4().hex[:8]}",
                        "resource_global_name": f"//compute.googleapis.com/projects/demo/zones/{region}-a/instances/demo-{uuid.uuid4().hex[:6]}",
                        "cost": cost,
                        "currency": "USD",
                        "currency_conversion_rate": 1.0,
                        "usage_amount": usage_amount,
                        "usage_unit": "byte-seconds",
                        "usage_amount_in_pricing_units": usage_amount / 1000,
                        "usage_pricing_unit": "gibibyte hour",
                        "cost_type": "regular",
                        "credits_total": 0.0,
                        "credits_json": None,
                        "cost_at_list": round(cost * 1.1, 2),
                        "invoice_month": usage_date.strftime("%Y%m"),
                        "labels_json": json.dumps({"env": random.choice(["prod", "staging", "dev"]), "team": hierarchy["x_hierarchy_entity_id"]}),
                        "system_labels_json": None,
                        "x_ingestion_id": str(uuid.uuid4()),
                        "x_ingestion_date": usage_date.isoformat(),
                        "x_org_slug": self.org_slug,
                        "x_hierarchy_entity_id": hierarchy["x_hierarchy_entity_id"],
                        "x_hierarchy_entity_name": hierarchy["x_hierarchy_entity_name"],
                        "x_hierarchy_level_code": hierarchy["x_hierarchy_level_code"],
                        "x_hierarchy_path": hierarchy["x_hierarchy_path"],
                        "x_hierarchy_path_names": hierarchy["x_hierarchy_path_names"],
                        "x_hierarchy_validated_at": None,
                        "x_pipeline_id": "cloud_gcp_billing",
                        "x_credential_id": "demo_credential",
                        "x_pipeline_run_date": usage_date.isoformat(),
                        "x_run_id": str(uuid.uuid4()),
                        "x_ingested_at": datetime.now().isoformat(),
                        "x_data_quality_score": 1.0,
                        "x_created_at": datetime.now().isoformat(),
                        "x_cloud_provider": "gcp",
                        "x_cloud_account_id": CLOUD_PROVIDERS["gcp"]["billing_account"],
                    }
                    records.append(record)

        print(f"Generated {len(records)} GCP billing records")
        return records

    def generate_cloud_aws_billing(self) -> List[Dict[str, Any]]:
        """Generate AWS billing data - matches cloud_aws_billing_raw_daily schema."""
        records = []

        for usage_date in self.dates:
            for service_code, product_name in CLOUD_PROVIDERS["aws"]["services"]:
                num_records = random.randint(2, 4)

                for _ in range(num_records):
                    region = random.choice(CLOUD_PROVIDERS["aws"]["regions"])
                    spike = self._get_spike_multiplier()
                    unblended_cost = round(random.uniform(10, 800) * spike, 2)
                    usage_amount = random.uniform(50, 5000)

                    hierarchy = self._get_hierarchy()
                    start_time = datetime.combine(usage_date, datetime.min.time())
                    end_time = start_time + timedelta(hours=24)

                    record = {
                        "linked_account_id": f"{random.randint(100000000000, 999999999999)}",
                        "linked_account_name": f"AWS Account {random.randint(1, 5)}",
                        "payer_account_id": CLOUD_PROVIDERS["aws"]["payer_account"],
                        "service_code": service_code,
                        "product_code": service_code,
                        "product_name": product_name,
                        "usage_type": f"{region}-BoxUsage:t3.medium",
                        "operation": "RunInstances",
                        "region": region,
                        "availability_zone": f"{region}a",
                        "resource_id": f"i-{uuid.uuid4().hex[:17]}",
                        "line_item_type": "Usage",
                        "usage_start_time": start_time.isoformat(),
                        "usage_end_time": end_time.isoformat(),
                        "usage_amount": usage_amount,
                        "usage_unit": "Hrs",
                        "unblended_cost": unblended_cost,
                        "blended_cost": unblended_cost,
                        "amortized_cost": unblended_cost,
                        "net_unblended_cost": round(unblended_cost * 0.95, 2),
                        "currency": "USD",
                        "pricing_unit": "Hrs",
                        "public_on_demand_cost": round(unblended_cost * 1.2, 2),
                        "reservation_arn": None,
                        "savings_plan_arn": None,
                        "discount_amount": round(unblended_cost * 0.05, 2),
                        "invoice_id": f"INV-{usage_date.strftime('%Y%m')}-{random.randint(1000, 9999)}",
                        "billing_period_start": usage_date.replace(day=1).isoformat(),
                        "billing_period_end": (usage_date.replace(day=28) + timedelta(days=4)).replace(day=1).isoformat(),
                        "resource_tags_json": json.dumps({"Environment": random.choice(["Production", "Staging", "Development"]), "CostCenter": hierarchy["x_hierarchy_entity_id"]}),
                        "cost_category_json": None,
                        "x_ingestion_id": str(uuid.uuid4()),
                        "x_ingestion_date": usage_date.isoformat(),
                        "x_org_slug": self.org_slug,
                        "x_hierarchy_entity_id": hierarchy["x_hierarchy_entity_id"],
                        "x_hierarchy_entity_name": hierarchy["x_hierarchy_entity_name"],
                        "x_hierarchy_level_code": hierarchy["x_hierarchy_level_code"],
                        "x_hierarchy_path": hierarchy["x_hierarchy_path"],
                        "x_hierarchy_path_names": hierarchy["x_hierarchy_path_names"],
                        "x_hierarchy_validated_at": None,
                        "x_cloud_provider": "aws",
                        "x_cloud_account_id": CLOUD_PROVIDERS["aws"]["payer_account"],
                        "x_pipeline_id": "cloud_aws_billing",
                        "x_credential_id": "demo_credential",
                        "x_pipeline_run_date": usage_date.isoformat(),
                        "x_run_id": str(uuid.uuid4()),
                        "x_ingested_at": datetime.now().isoformat(),
                        "x_data_quality_score": 1.0,
                        "x_created_at": datetime.now().isoformat(),
                        "credits_json": None,
                    }
                    records.append(record)

        print(f"Generated {len(records)} AWS billing records")
        return records

    def generate_subscription_plans(self) -> List[Dict[str, Any]]:
        """Generate subscription plans - matches subscription_plans schema."""
        records = []

        for sub in SUBSCRIPTION_PROVIDERS:
            hierarchy = self._get_hierarchy()
            seats = random.randint(5, 25)

            record = {
                "x_org_slug": self.org_slug,
                "subscription_id": f"sub_{sub['provider']}_{uuid.uuid4().hex[:8]}",
                "provider": sub["provider"],
                "plan_name": sub["plan_name"],
                "display_name": sub["plan_name"],
                "category": sub["category"],
                "status": "active",
                "start_date": self.start_date.isoformat(),
                "end_date": None,
                "billing_cycle": "monthly",
                "billing_anchor_day": 1,
                "currency": "USD",
                "seats": seats,
                "pricing_model": "per_seat",
                "unit_price": sub["unit_price"],
                "yearly_price": round(sub["unit_price"] * 12 * 0.8, 2),
                "discount_type": random.choice(["none", "percentage", "fixed"]),
                "discount_value": random.choice([0, 5, 10, 15, 20]),
                "auto_renew": True,
                "payment_method": "credit_card",
                "invoice_id_last": f"INV-{self.start_date.strftime('%Y%m')}-{random.randint(1000, 9999)}",
                "owner_email": "admin@example.com",
                "department": hierarchy["x_hierarchy_entity_name"],
                "x_hierarchy_entity_id": hierarchy["x_hierarchy_entity_id"],
                "x_hierarchy_entity_name": hierarchy["x_hierarchy_entity_name"],
                "x_hierarchy_level_code": hierarchy["x_hierarchy_level_code"],
                "x_hierarchy_path": hierarchy["x_hierarchy_path"],
                "x_hierarchy_path_names": hierarchy["x_hierarchy_path_names"],
                "renewal_date": (self.start_date + timedelta(days=30)).isoformat(),
                "contract_id": f"CONTRACT-{uuid.uuid4().hex[:8].upper()}",
                "notes": f"Demo {sub['plan_name']} subscription",
                "source_currency": "USD",
                "source_price": sub["unit_price"],
                "exchange_rate_used": 1.0,
                "updated_at": datetime.now().isoformat(),
            }
            records.append(record)

        print(f"Generated {len(records)} subscription plan records")
        return records

    def save_to_newline_json(self, records: List[Dict[str, Any]], filename: str) -> str:
        """Save records as newline-delimited JSON."""
        filepath = Path(tempfile.gettempdir()) / f"demo_data_{filename}.jsonl"

        with open(filepath, 'w') as f:
            for record in records:
                f.write(json.dumps(record) + '\n')

        print(f"Saved {len(records)} records to {filepath}")
        return str(filepath)

    def load_to_bigquery(self, filepath: str, table_name: str) -> bool:
        """Load JSONL file to BigQuery."""
        full_table = f"{GCP_PROJECT}:{self.dataset}.{table_name}"

        print(f"Loading {filepath} to {full_table}...")
        load_cmd = f'bq load --source_format=NEWLINE_DELIMITED_JSON "{full_table}" "{filepath}"'
        result = subprocess.run(load_cmd, shell=True, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"  ERROR: {result.stderr[:200]}")
            return False

        print(f"  SUCCESS: Loaded to {table_name}")
        return True

    def generate_all(self, load: bool = False) -> Dict[str, str]:
        """Generate all demo data files."""
        files = {}

        # Generate GenAI data
        genai_usage = self.generate_genai_payg_usage()
        files["genai_payg_usage_raw"] = self.save_to_newline_json(genai_usage, "genai_payg_usage_raw")

        genai_pricing = self.generate_genai_payg_pricing()
        files["genai_payg_pricing"] = self.save_to_newline_json(genai_pricing, "genai_payg_pricing")

        # Generate Cloud data
        gcp_billing = self.generate_cloud_gcp_billing()
        files["cloud_gcp_billing_raw_daily"] = self.save_to_newline_json(gcp_billing, "cloud_gcp_billing_raw_daily")

        aws_billing = self.generate_cloud_aws_billing()
        files["cloud_aws_billing_raw_daily"] = self.save_to_newline_json(aws_billing, "cloud_aws_billing_raw_daily")

        # Generate Subscription data
        subscription_plans = self.generate_subscription_plans()
        files["subscription_plans"] = self.save_to_newline_json(subscription_plans, "subscription_plans")

        if load:
            print("\n=== Loading data to BigQuery ===")
            for table_name, filepath in files.items():
                self.load_to_bigquery(filepath, table_name)

        return files


def main():
    parser = argparse.ArgumentParser(description="Generate demo data for CloudAct")
    parser.add_argument("--org-slug", required=True, help="Organization slug")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--spike-probability", type=float, default=0.05, help="Probability of cost spike (0-1)")
    parser.add_argument("--load", action="store_true", help="Load data to BigQuery")

    args = parser.parse_args()

    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()

    print(f"""
================================================================================
CloudAct Demo Data Generator
================================================================================
Organization: {args.org_slug}
Date Range: {start_date} to {end_date}
Spike Probability: {args.spike_probability * 100}%
Load to BigQuery: {args.load}
================================================================================
""")

    generator = DemoDataGenerator(
        org_slug=args.org_slug,
        start_date=start_date,
        end_date=end_date,
        spike_probability=args.spike_probability
    )

    files = generator.generate_all(load=args.load)

    print(f"\n=== Generated Files ===")
    for table, filepath in files.items():
        print(f"  {table}: {filepath}")

    print("\nDone!")


if __name__ == "__main__":
    main()
