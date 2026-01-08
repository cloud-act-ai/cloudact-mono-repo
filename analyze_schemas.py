#!/usr/bin/env python3
"""
Comprehensive Schema and Integration Analysis Script
Finds schema mismatches, missing columns, and integration issues
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict

REPO_ROOT = Path("/Users/gurukallam/prod-ready-apps/cloudact-mono-repo")

class SchemaAnalyzer:
    def __init__(self):
        self.issues = []
        self.schemas = {}
        self.issue_counter = 21  # Starting from where manual analysis left off

    def load_schema(self, path: Path) -> Dict:
        """Load a JSON schema file"""
        with open(path) as f:
            return json.load(f)

    def find_all_schemas(self) -> Dict[str, Path]:
        """Find all schema files in the repo"""
        schemas = {}

        # API service schemas
        api_schemas_dir = REPO_ROOT / "02-api-service" / "configs"
        for schema_file in api_schemas_dir.rglob("*.json"):
            if "schema" in str(schema_file).lower() and "node_modules" not in str(schema_file):
                table_name = schema_file.stem
                schemas[f"api/{table_name}"] = schema_file

        # Pipeline service schemas
        pipeline_schemas_dir = REPO_ROOT / "03-data-pipeline-service" / "configs"
        for schema_file in pipeline_schemas_dir.rglob("*.json"):
            if "schema" in str(schema_file).lower() and "venv" not in str(schema_file):
                table_name = schema_file.stem
                schemas[f"pipeline/{table_name}"] = schema_file

        return schemas

    def extract_field_names(self, schema: List[Dict]) -> Set[str]:
        """Extract all field names from a schema"""
        return {field.get("name") for field in schema if "name" in field}

    def check_10_level_hierarchy(self):
        """Check if all cost tables have 10-level hierarchy fields"""
        print("\n🔍 Checking 10-level hierarchy fields...")

        required_hierarchy_fields = set()
        for i in range(1, 11):
            required_hierarchy_fields.add(f"x_hierarchy_level_{i}_id")
            required_hierarchy_fields.add(f"x_hierarchy_level_{i}_name")

        cost_tables = [
            "cost_data_standard_1_3",
            "genai_payg_costs_daily",
            "genai_commitment_costs_daily",
            "genai_infrastructure_costs_daily",
            "genai_costs_daily_unified",
            "subscription_plan_costs_daily",
            "genai_payg_usage_raw",
            "genai_commitment_usage_raw",
            "genai_infrastructure_usage_raw",
            "subscription_plans",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        for table in cost_tables:
            schema_path = api_schema_base / f"{table}.json"
            if not schema_path.exists():
                self.add_issue(
                    "CRITICAL",
                    f"Missing schema file for {table}",
                    str(schema_path),
                    f"Schema file not found: {schema_path}"
                )
                continue

            schema = self.load_schema(schema_path)
            fields = self.extract_field_names(schema)

            missing_fields = required_hierarchy_fields - fields
            if missing_fields:
                self.add_issue(
                    "HIGH",
                    f"Missing 10-level hierarchy fields in {table}",
                    str(schema_path),
                    f"Missing fields: {', '.join(sorted(missing_fields))}"
                )

    def check_x_metadata_fields(self):
        """Check if pipeline-written tables have x_* metadata fields"""
        print("\n🔍 Checking x_* metadata fields...")

        required_x_fields = {
            "x_pipeline_id",
            "x_credential_id",
            "x_pipeline_run_date",
            "x_run_id",
            "x_ingested_at"
        }

        pipeline_tables = [
            "genai_payg_usage_raw",
            "genai_commitment_usage_raw",
            "genai_infrastructure_usage_raw",
            "genai_payg_costs_daily",
            "genai_commitment_costs_daily",
            "genai_infrastructure_costs_daily",
            "subscription_plan_costs_daily",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        for table in pipeline_tables:
            schema_path = api_schema_base / f"{table}.json"
            if not schema_path.exists():
                continue

            schema = self.load_schema(schema_path)
            fields = self.extract_field_names(schema)

            missing_fields = required_x_fields - fields
            if missing_fields:
                self.add_issue(
                    "MEDIUM",
                    f"Missing x_* metadata fields in {table}",
                    str(schema_path),
                    f"Missing fields: {', '.join(sorted(missing_fields))}"
                )

    def check_updated_at_fields(self):
        """Check if CRUD tables have updated_at timestamp"""
        print("\n🔍 Checking updated_at timestamp fields...")

        crud_tables = [
            "org_integration_credentials",
            "org_notification_channels",
            "org_notification_rules",
            "org_notification_summaries",
            "subscription_plans",
            "org_hierarchy",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup"

        for table in crud_tables:
            # Try bootstrap schemas first
            schema_path = api_schema_base / "bootstrap" / "schemas" / f"{table}.json"
            if not schema_path.exists():
                # Try onboarding schemas
                schema_path = api_schema_base / "organizations" / "onboarding" / "schemas" / f"{table}.json"

            if not schema_path.exists():
                continue

            schema = self.load_schema(schema_path)
            fields = self.extract_field_names(schema)

            if "updated_at" not in fields:
                self.add_issue(
                    "LOW",
                    f"Missing updated_at field in {table}",
                    str(schema_path),
                    f"CRUD table should track last modification time"
                )

    def check_org_slug_in_central_tables(self):
        """Check if central tables have org_slug for filtering"""
        print("\n🔍 Checking org_slug in central tables...")

        central_tables = [
            "org_notification_history",
            "org_audit_logs",
            "org_cost_tracking",
            "org_meta_pipeline_runs",
            "org_meta_step_logs",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup" / "bootstrap" / "schemas"

        for table in central_tables:
            schema_path = api_schema_base / f"{table}.json"
            if not schema_path.exists():
                continue

            schema = self.load_schema(schema_path)
            fields = self.extract_field_names(schema)

            if "org_slug" not in fields:
                self.add_issue(
                    "MEDIUM",
                    f"Missing org_slug filter field in {table}",
                    str(schema_path),
                    f"Central table needs org_slug for efficient filtering"
                )

    def check_duplicate_schemas(self):
        """Find duplicate schema files"""
        print("\n🔍 Checking for duplicate schemas...")

        schemas_by_name = defaultdict(list)

        for schema_dir in [
            REPO_ROOT / "02-api-service" / "configs",
            REPO_ROOT / "03-data-pipeline-service" / "configs",
            REPO_ROOT / "04-inra-cicd-automation" / "load-demo-data" / "schemas"
        ]:
            for schema_file in schema_dir.rglob("*.json"):
                if "venv" not in str(schema_file) and "node_modules" not in str(schema_file):
                    schemas_by_name[schema_file.stem].append(schema_file)

        for table_name, paths in schemas_by_name.items():
            if len(paths) > 1:
                self.add_issue(
                    "LOW",
                    f"Duplicate schema files for {table_name}",
                    ", ".join(str(p) for p in paths),
                    f"Found {len(paths)} schema files for same table - risk of schema drift"
                )

    def check_partitioning_consistency(self):
        """Check if cost tables use consistent partitioning"""
        print("\n🔍 Checking partitioning consistency...")

        cost_tables = [
            "cost_data_standard_1_3",
            "genai_payg_costs_daily",
            "genai_payg_usage_raw",
            "subscription_plan_costs_daily",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        partitioning_fields = {}
        for table in cost_tables:
            schema_path = api_schema_base / f"{table}.json"
            if not schema_path.exists():
                continue

            # Check schema for partitioning info (usually in table options or comments)
            with open(schema_path) as f:
                content = f.read()
                if "ingestion_date" in content.lower():
                    partitioning_fields[table] = "ingestion_date"
                elif "cost_date" in content.lower():
                    partitioning_fields[table] = "cost_date"
                elif "chargeperiodstart" in content.lower():
                    partitioning_fields[table] = "ChargePeriodStart"
                else:
                    partitioning_fields[table] = "unknown"

        if len(set(partitioning_fields.values())) > 1:
            self.add_issue(
                "MEDIUM",
                "Inconsistent partitioning strategy across cost tables",
                "Multiple tables",
                f"Partitioning fields: {partitioning_fields}"
            )

    def check_missing_descriptions(self):
        """Check for schemas without field descriptions"""
        print("\n🔍 Checking for missing field descriptions...")

        important_tables = [
            "org_api_keys",
            "org_integration_credentials",
            "org_hierarchy",
            "subscription_plans",
            "cost_data_standard_1_3",
        ]

        api_schema_base = REPO_ROOT / "02-api-service" / "configs" / "setup"

        for table in important_tables:
            schema_path = api_schema_base / "bootstrap" / "schemas" / f"{table}.json"
            if not schema_path.exists():
                schema_path = api_schema_base / "organizations" / "onboarding" / "schemas" / f"{table}.json"

            if not schema_path.exists():
                continue

            schema = self.load_schema(schema_path)
            fields_without_desc = []

            for field in schema:
                if "description" not in field or not field["description"]:
                    fields_without_desc.append(field.get("name", "unknown"))

            if fields_without_desc:
                self.add_issue(
                    "LOW",
                    f"Missing field descriptions in {table}",
                    str(schema_path),
                    f"Fields without description: {', '.join(fields_without_desc[:5])}..." if len(fields_without_desc) > 5 else f"Fields: {', '.join(fields_without_desc)}"
                )

    def check_code_schema_mismatches(self):
        """Check if Python/TypeScript code references fields that don't exist in schemas"""
        print("\n🔍 Checking code vs schema mismatches...")

        # Check Python processors for field references
        pipeline_processors = REPO_ROOT / "03-data-pipeline-service" / "src" / "core" / "processors"

        for py_file in pipeline_processors.rglob("*.py"):
            if "__pycache__" in str(py_file):
                continue

            with open(py_file) as f:
                content = f.read()

                # Look for common deprecated fields
                deprecated_fields = {
                    "hierarchy_entity_id": "x_hierarchy_level_N_id",
                    "hierarchy_level_code": "removed in v15.0",
                    "hierarchy_path": "deprecated, use x_hierarchy_level_N_id",
                }

                for deprecated, replacement in deprecated_fields.items():
                    if deprecated in content:
                        self.add_issue(
                            "MEDIUM",
                            f"Deprecated field '{deprecated}' used in code",
                            str(py_file),
                            f"Use '{replacement}' instead"
                        )

    def add_issue(self, severity: str, title: str, location: str, details: str):
        """Add an issue to the list"""
        self.issues.append({
            "id": self.issue_counter,
            "severity": severity,
            "title": title,
            "location": location,
            "details": details
        })
        print(f"  BUG #{self.issue_counter}: {severity} - {title}")
        self.issue_counter += 1

    def generate_report(self):
        """Generate final bug report"""
        print("\n" + "="*80)
        print("📊 COMPREHENSIVE BUG REPORT")
        print("="*80)

        by_severity = defaultdict(list)
        for issue in self.issues:
            by_severity[issue["severity"]].append(issue)

        for severity in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            if severity in by_severity:
                print(f"\n{severity}: {len(by_severity[severity])} issues")
                for issue in by_severity[severity]:
                    print(f"  BUG #{issue['id']}: {issue['title']}")

        print(f"\n{'='*80}")
        print(f"TOTAL ISSUES FOUND: {len(self.issues)}")
        print(f"{'='*80}")

        # Write to file
        report_path = REPO_ROOT / "BUG_ANALYSIS_RESULTS.txt"
        with open(report_path, "w") as f:
            for issue in self.issues:
                f.write(f"\n{'='*80}\n")
                f.write(f"BUG #{issue['id']}: {issue['severity']} - {issue['title']}\n")
                f.write(f"Location: {issue['location']}\n")
                f.write(f"Details: {issue['details']}\n")

        print(f"\n✅ Full report written to: {report_path}")

def main():
    print("🔍 Starting Comprehensive Schema Analysis...")
    print(f"Repository: {REPO_ROOT}")

    analyzer = SchemaAnalyzer()

    # Run all checks
    analyzer.check_10_level_hierarchy()
    analyzer.check_x_metadata_fields()
    analyzer.check_updated_at_fields()
    analyzer.check_org_slug_in_central_tables()
    analyzer.check_duplicate_schemas()
    analyzer.check_partitioning_consistency()
    analyzer.check_missing_descriptions()
    analyzer.check_code_schema_mismatches()

    # Generate final report
    analyzer.generate_report()

if __name__ == "__main__":
    main()
