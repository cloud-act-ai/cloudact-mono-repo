#!/usr/bin/env python3
"""
Load GenAI demo data using Python BigQuery client.
Uses the same credentials as the services.
"""

import json
import os
from pathlib import Path
from google.cloud import bigquery

# Configuration
PROJECT_ID = os.getenv("GCP_PROJECT_ID", "cloudact-testing-1")
ORG_SLUG = os.getenv("ORG_SLUG", "acme_inc_01022026")
DATASET_ID = f"{ORG_SLUG}_local"

# Set credentials if not already set
if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/gurukallam/.gcp/cloudact-testing-1-e44da390bf82.json"

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "genai"

# Tables to truncate and load
TABLES_TO_TRUNCATE = [
    "genai_payg_usage_raw",
    "genai_payg_costs_daily",
    "genai_commitment_costs_daily",
    "genai_infrastructure_costs_daily",
    "genai_costs_daily_unified",
]

FOCUS_TABLE = "cost_data_standard_1_3"

def get_client():
    """Get BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)


def truncate_genai_tables(client: bigquery.Client):
    """Truncate all GenAI-related tables."""
    print(f"Truncating GenAI tables in {PROJECT_ID}.{DATASET_ID}...")

    for table_name in TABLES_TO_TRUNCATE:
        table_ref = f"{PROJECT_ID}.{DATASET_ID}.{table_name}"
        try:
            query = f"TRUNCATE TABLE `{table_ref}`"
            print(f"  Truncating {table_name}...")
            client.query(query).result()
            print(f"    ✓ {table_name} truncated")
        except Exception as e:
            if "Not found" in str(e):
                print(f"    ⚠ {table_name} not found, skipping")
            else:
                print(f"    ✗ Error truncating {table_name}: {e}")

    # Delete GenAI records from FOCUS table
    print(f"  Deleting GenAI records from {FOCUS_TABLE}...")
    try:
        query = f"""
            DELETE FROM `{PROJECT_ID}.{DATASET_ID}.{FOCUS_TABLE}`
            WHERE x_genai_cost_type IS NOT NULL
        """
        result = client.query(query).result()
        print(f"    ✓ GenAI records deleted from FOCUS table")
    except Exception as e:
        print(f"    ✗ Error deleting from FOCUS: {e}")


def load_genai_usage_data(client: bigquery.Client):
    """Load GenAI usage data from JSON files."""
    print(f"\nLoading GenAI usage data to {PROJECT_ID}.{DATASET_ID}.genai_payg_usage_raw...")

    table_ref = f"{PROJECT_ID}.{DATASET_ID}.genai_payg_usage_raw"

    providers = ["openai", "anthropic", "gemini"]
    total_loaded = 0

    for provider in providers:
        data_file = DATA_DIR / f"{provider}_usage_raw.json"
        if not data_file.exists():
            print(f"  ⚠ {data_file} not found, skipping")
            continue

        print(f"  Loading {provider} data from {data_file.name}...")

        # Read NDJSON file
        records = []
        with open(data_file, 'r') as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))

        if not records:
            print(f"    ⚠ No records in {data_file.name}")
            continue

        # Insert in batches of 1000
        batch_size = 1000
        for i in range(0, len(records), batch_size):
            batch = records[i:i+batch_size]
            errors = client.insert_rows_json(table_ref, batch)
            if errors:
                print(f"    ✗ Errors inserting batch {i//batch_size}: {errors[:3]}...")

        total_loaded += len(records)
        print(f"    ✓ Loaded {len(records)} {provider} records")

    print(f"\n  Total records loaded: {total_loaded}")
    return total_loaded


def verify_data(client: bigquery.Client):
    """Verify loaded data."""
    print(f"\nVerifying loaded data...")

    query = f"""
        SELECT provider, COUNT(*) as records, SUM(total_tokens) as total_tokens
        FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_usage_raw`
        GROUP BY provider
        ORDER BY provider
    """

    try:
        result = client.query(query).result()
        print("\n  Provider | Records | Total Tokens")
        print("  " + "-" * 50)
        for row in result:
            print(f"  {row.provider:12} | {row.records:8} | {row.total_tokens:,}")
    except Exception as e:
        print(f"  ✗ Error verifying data: {e}")


def load_pricing_data(client: bigquery.Client):
    """Load GenAI pricing data from CSV."""
    print(f"\nLoading GenAI pricing data to {PROJECT_ID}.{DATASET_ID}.genai_payg_pricing...")

    pricing_file = SCRIPT_DIR.parent / "data" / "pricing" / "genai_payg_pricing.csv"
    if not pricing_file.exists():
        print(f"  ⚠ Pricing file not found: {pricing_file}")
        return 0

    import csv

    table_ref = f"{PROJECT_ID}.{DATASET_ID}.genai_payg_pricing"

    # Valid fields in the BigQuery table schema
    VALID_FIELDS = {
        'org_slug', 'provider', 'model', 'model_family', 'model_version', 'region',
        'input_per_1m', 'output_per_1m', 'cached_input_per_1m', 'cached_write_per_1m',
        'batch_input_per_1m', 'batch_output_per_1m', 'cached_discount_pct',
        'batch_discount_pct', 'volume_discount_pct', 'context_window', 'max_output_tokens',
        'supports_vision', 'supports_streaming', 'supports_tools', 'rate_limit_rpm',
        'rate_limit_tpm', 'sla_uptime_pct', 'effective_from', 'effective_to', 'status',
        'is_override', 'override_input_per_1m', 'override_output_per_1m',
        'override_effective_from', 'override_notes', 'last_updated'
    }

    FLOAT_FIELDS = {'input_per_1m', 'output_per_1m', 'cached_input_per_1m', 'cached_write_per_1m',
                    'batch_input_per_1m', 'batch_output_per_1m', 'cached_discount_pct',
                    'batch_discount_pct', 'volume_discount_pct', 'sla_uptime_pct',
                    'override_input_per_1m', 'override_output_per_1m'}
    INT_FIELDS = {'rate_limit_rpm', 'rate_limit_tpm', 'context_window', 'max_output_tokens'}
    BOOL_FIELDS = {'supports_vision', 'supports_streaming', 'supports_tools', 'is_override'}
    TIMESTAMP_FIELDS = {'last_updated'}  # Need YYYY-MM-DD HH:MM:SS format

    # Read CSV and add org_slug
    records = []
    with open(pricing_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Add org_slug and convert types, only include valid fields
            record = {"org_slug": ORG_SLUG}
            for k, v in row.items():
                if k not in VALID_FIELDS:
                    continue  # Skip fields not in table schema
                if v == '':
                    record[k] = None
                elif k in FLOAT_FIELDS:
                    record[k] = float(v) if v else None
                elif k in INT_FIELDS:
                    record[k] = int(v) if v else None
                elif k in BOOL_FIELDS:
                    record[k] = v.lower() == 'true' if v else None
                elif k in TIMESTAMP_FIELDS:
                    # Convert YYYY-MM-DD to YYYY-MM-DD HH:MM:SS
                    if v and len(v) == 10:
                        record[k] = f"{v} 00:00:00"
                    else:
                        record[k] = v
                else:
                    record[k] = v
            records.append(record)

    if not records:
        print("  ⚠ No pricing records found")
        return 0

    # Delete existing pricing for this org first
    try:
        query = f"DELETE FROM `{table_ref}` WHERE org_slug = @org_slug"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
            ]
        )
        client.query(query, job_config=job_config).result()
        print(f"  Deleted existing pricing for {ORG_SLUG}")
    except Exception as e:
        print(f"  ⚠ Could not delete existing pricing: {e}")

    # Insert pricing records
    errors = client.insert_rows_json(table_ref, records)
    if errors:
        print(f"  ✗ Errors inserting pricing: {errors[:3]}...")
    else:
        print(f"  ✓ Loaded {len(records)} pricing records")

    return len(records)


def calculate_payg_costs(client: bigquery.Client):
    """Calculate PAYG costs from usage and pricing."""
    print(f"\nCalculating PAYG costs from usage data...")

    # First check if pricing exists
    try:
        pricing_check = client.query(f"""
            SELECT COUNT(*) as cnt FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_pricing`
            WHERE org_slug = '{ORG_SLUG}'
        """).result()
        pricing_count = list(pricing_check)[0].cnt
        print(f"  Found {pricing_count} pricing records")
        if pricing_count == 0:
            print("  ⚠ No pricing data - cannot calculate costs")
            return
    except Exception as e:
        print(f"  ⚠ Error checking pricing: {e}")
        return

    # Calculate costs using SQL
    # This matches the logic in the PAYG cost processor
    cost_query = f"""
    -- Delete existing costs for this org (idempotent)
    DELETE FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_costs_daily`
    WHERE org_slug = '{ORG_SLUG}';

    -- Calculate costs from usage + pricing
    INSERT INTO `{PROJECT_ID}.{DATASET_ID}.genai_payg_costs_daily`
    (cost_date, org_slug, provider, model, model_family, region,
     input_tokens, output_tokens, cached_input_tokens, total_tokens,
     input_cost_usd, output_cost_usd, cached_cost_usd, total_cost_usd,
     discount_applied_pct, effective_rate_input, effective_rate_output,
     request_count, hierarchy_entity_id, hierarchy_entity_name,
     hierarchy_level_code, hierarchy_path, hierarchy_path_names, calculated_at,
     x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
    SELECT
        u.usage_date as cost_date,
        u.org_slug,
        u.provider,
        u.model,
        u.model_family,
        u.region,
        u.input_tokens,
        u.output_tokens,
        u.cached_input_tokens,
        u.total_tokens,
        -- Calculate costs from pricing (per 1M tokens)
        ROUND((u.input_tokens / 1000000.0) * COALESCE(p.input_per_1m, 0), 6) as input_cost_usd,
        ROUND((u.output_tokens / 1000000.0) * COALESCE(p.output_per_1m, 0), 6) as output_cost_usd,
        ROUND((u.cached_input_tokens / 1000000.0) * COALESCE(p.cached_input_per_1m, p.input_per_1m * 0.5, 0), 6) as cached_cost_usd,
        -- Total cost = input + output + cached
        ROUND(
            (u.input_tokens / 1000000.0) * COALESCE(p.input_per_1m, 0) +
            (u.output_tokens / 1000000.0) * COALESCE(p.output_per_1m, 0) +
            (u.cached_input_tokens / 1000000.0) * COALESCE(p.cached_input_per_1m, p.input_per_1m * 0.5, 0),
        6) as total_cost_usd,
        COALESCE(p.volume_discount_pct, 0) as discount_applied_pct,
        COALESCE(p.input_per_1m, 0) as effective_rate_input,
        COALESCE(p.output_per_1m, 0) as effective_rate_output,
        u.request_count,
        u.hierarchy_entity_id,
        u.hierarchy_entity_name,
        u.hierarchy_level_code,
        u.hierarchy_path,
        u.hierarchy_path_names,
        CURRENT_TIMESTAMP() as calculated_at,
        u.x_pipeline_id,
        u.x_credential_id,
        u.x_pipeline_run_date,
        u.x_run_id,
        CURRENT_TIMESTAMP() as x_ingested_at
    FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_usage_raw` u
    LEFT JOIN `{PROJECT_ID}.{DATASET_ID}.genai_payg_pricing` p
        ON u.provider = p.provider
        AND u.model = p.model
        AND u.org_slug = p.org_slug
    WHERE u.org_slug = '{ORG_SLUG}'
    """

    try:
        # Execute delete and insert as separate statements
        for stmt in cost_query.split(';'):
            stmt = stmt.strip()
            if stmt:
                client.query(stmt).result()

        # Verify
        result = client.query(f"""
            SELECT COUNT(*) as cnt, ROUND(SUM(total_cost_usd), 2) as total_cost
            FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_costs_daily`
            WHERE org_slug = '{ORG_SLUG}'
        """).result()
        row = list(result)[0]
        print(f"  ✓ Calculated costs: {row.cnt} records, ${row.total_cost:,.2f} total")

    except Exception as e:
        print(f"  ✗ Error calculating costs: {e}")


def run_consolidation_procedure(client: bigquery.Client):
    """Run GenAI consolidation stored procedure."""
    print(f"\nRunning GenAI consolidation procedure...")

    # Get distinct dates from usage data
    dates_query = f"""
        SELECT DISTINCT usage_date
        FROM `{PROJECT_ID}.{DATASET_ID}.genai_payg_usage_raw`
        WHERE org_slug = '{ORG_SLUG}'
        ORDER BY usage_date
    """

    try:
        dates_result = client.query(dates_query).result()
        dates = [row.usage_date for row in dates_result]
        print(f"  Found {len(dates)} dates to consolidate")

        if not dates:
            print("  ⚠ No dates to consolidate")
            return

        # Consolidate ALL dates for accurate totals
        consolidated = 0
        for i, d in enumerate(dates):
            proc_query = f"""
                CALL `{PROJECT_ID}.organizations`.sp_consolidate_genai_costs_daily(
                    '{PROJECT_ID}', '{DATASET_ID}', DATE('{d}'), NULL, 'demo_consolidation', GENERATE_UUID()
                )
            """
            client.query(proc_query).result()
            consolidated += 1
            if (i + 1) % 50 == 0 or i == len(dates) - 1:
                print(f"    ✓ Consolidated {consolidated}/{len(dates)} dates...")

        print(f"  ✓ Consolidated all {consolidated} dates")

    except Exception as e:
        print(f"  ✗ Error in consolidation: {e}")


def run_focus_conversion_procedure(client: bigquery.Client):
    """Run GenAI FOCUS conversion stored procedure."""
    print(f"\nRunning GenAI FOCUS conversion procedure...")

    # Get distinct dates from unified costs
    dates_query = f"""
        SELECT DISTINCT cost_date
        FROM `{PROJECT_ID}.{DATASET_ID}.genai_costs_daily_unified`
        ORDER BY cost_date
    """

    try:
        dates_result = client.query(dates_query).result()
        dates = [row.cost_date for row in dates_result]
        print(f"  Found {len(dates)} dates to convert to FOCUS")

        if not dates:
            print("  ⚠ No dates to convert")
            return

        # Convert ALL dates for accurate totals
        converted = 0
        for i, d in enumerate(dates):
            proc_query = f"""
                CALL `{PROJECT_ID}.organizations`.sp_convert_genai_to_focus_1_3(
                    '{PROJECT_ID}', '{DATASET_ID}', DATE('{d}'), NULL, 'demo_focus', GENERATE_UUID()
                )
            """
            client.query(proc_query).result()
            converted += 1
            if (i + 1) % 50 == 0 or i == len(dates) - 1:
                print(f"    ✓ Converted {converted}/{len(dates)} dates...")

        print(f"  ✓ Converted all {converted} dates to FOCUS")

    except Exception as e:
        print(f"  ✗ Error in FOCUS conversion: {e}")


def verify_final_data(client: bigquery.Client):
    """Verify final FOCUS data."""
    print(f"\nVerifying final FOCUS data...")

    try:
        result = client.query(f"""
            SELECT
                ServiceProviderName as provider,
                COUNT(*) as records,
                ROUND(SUM(EffectiveCost), 2) as total_cost
            FROM `{PROJECT_ID}.{DATASET_ID}.cost_data_standard_1_3`
            WHERE x_genai_cost_type IS NOT NULL
              AND SubAccountId = '{ORG_SLUG}'
            GROUP BY ServiceProviderName
            ORDER BY total_cost DESC
        """).result()

        print("\n  Provider | Records | Total Cost")
        print("  " + "-" * 50)
        total = 0
        for row in result:
            print(f"  {row.provider:18} | {row.records:8} | ${row.total_cost:,.2f}")
            total += row.total_cost
        print("  " + "-" * 50)
        print(f"  {'TOTAL':18} |          | ${total:,.2f}")

    except Exception as e:
        print(f"  ✗ Error verifying data: {e}")


def main():
    print("=" * 60)
    print("  GenAI Demo Data Loader")
    print(f"  Target: {PROJECT_ID}.{DATASET_ID}")
    print("=" * 60)
    print()

    client = get_client()

    # Step 1: Truncate existing data
    truncate_genai_tables(client)

    # Step 2: Load new usage data
    load_genai_usage_data(client)

    # Step 3: Load pricing data
    load_pricing_data(client)

    # Step 4: Calculate PAYG costs
    calculate_payg_costs(client)

    # Step 5: Run consolidation procedure
    run_consolidation_procedure(client)

    # Step 6: Run FOCUS conversion procedure
    run_focus_conversion_procedure(client)

    # Step 7: Verify final data
    verify_final_data(client)

    # Step 8: Verify usage
    verify_data(client)

    print()
    print("=" * 60)
    print("  GenAI demo data loading and processing complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
