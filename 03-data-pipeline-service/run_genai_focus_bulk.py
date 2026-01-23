#!/usr/bin/env python3
"""Convert ALL GenAI costs to FOCUS 1.3 in one bulk operation."""

import sys
import os
from google.cloud import bigquery

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from src.app.config import get_settings

settings = get_settings()
ORG_SLUG = "acme_inc_01062026"
DATASET = settings.get_org_dataset_name(ORG_SLUG)
PROJECT_ID = settings.gcp_project_id

def main():
    """Convert all GenAI costs to FOCUS 1.3 in one query."""
    print("=" * 70)
    print("GenAI to FOCUS 1.3 Bulk Conversion")
    print("=" * 70)
    print(f"Org: {ORG_SLUG}")
    print(f"Dataset: {DATASET}")
    print("Processing ALL dates in one operation...")
    print("=" * 70)

    client = bigquery.Client(project=PROJECT_ID)

    # Step 1: Delete existing GenAI FOCUS records
    print("\nStep 1: Deleting existing GenAI FOCUS records...")
    delete_query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.cost_data_standard_1_3`
        WHERE x_genai_cost_type IS NOT NULL
    """

    job = client.query(delete_query)
    job.result()
    deleted = job.num_dml_affected_rows or 0
    print(f"Deleted {deleted} existing records")

    # Step 2: Bulk insert ALL GenAI costs as FOCUS 1.3
    print("\nStep 2: Converting all GenAI costs to FOCUS 1.3...")

    insert_query = f"""
      INSERT INTO `{PROJECT_ID}.{DATASET}.cost_data_standard_1_3`
      (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
       BillingAccountId, BillingCurrency, HostProviderName,
       InvoiceIssuerName, ServiceProviderName, ServiceCategory, ServiceName,
       ResourceId, ResourceName, ResourceType, RegionId, RegionName,
       ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
       EffectiveCost, BilledCost, ListCost, ListUnitPrice,
       ContractedCost, ContractedUnitPrice,
       ChargeCategory, ChargeType, ChargeFrequency,
       SubAccountId, SubAccountName,
       x_genai_cost_type, x_genai_provider, x_genai_model,
       x_hierarchy_entity_id, x_hierarchy_entity_name,
       x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
       x_hierarchy_validated_at,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
       x_data_quality_score, x_created_at, x_source_system)
      SELECT
        TIMESTAMP(cost_date) as ChargePeriodStart,
        TIMESTAMP(cost_date) as ChargePeriodEnd,
        TIMESTAMP(DATE_TRUNC(cost_date, MONTH)) as BillingPeriodStart,
        TIMESTAMP(LAST_DAY(cost_date, MONTH)) as BillingPeriodEnd,

        -- Required billing fields
        org_slug as BillingAccountId,
        'USD' as BillingCurrency,
        'CloudAct' as HostProviderName,

        -- Provider name mapping
        CASE provider
          WHEN 'openai' THEN 'OpenAI'
          WHEN 'anthropic' THEN 'Anthropic'
          WHEN 'gemini' THEN 'Google'
          WHEN 'azure_openai' THEN 'Microsoft'
          WHEN 'aws_bedrock' THEN 'Amazon Web Services'
          WHEN 'gcp_vertex' THEN 'Google Cloud'
          WHEN 'gcp_gpu' THEN 'Google Cloud'
          WHEN 'aws_gpu' THEN 'Amazon Web Services'
          WHEN 'azure_gpu' THEN 'Microsoft'
          ELSE provider
        END as InvoiceIssuerName,

        CASE provider
          WHEN 'openai' THEN 'OpenAI'
          WHEN 'anthropic' THEN 'Anthropic'
          WHEN 'gemini' THEN 'Google AI'
          WHEN 'azure_openai' THEN 'Azure OpenAI'
          WHEN 'aws_bedrock' THEN 'AWS Bedrock'
          WHEN 'gcp_vertex' THEN 'Vertex AI'
          WHEN 'gcp_gpu' THEN 'Google Cloud Compute'
          WHEN 'aws_gpu' THEN 'Amazon EC2'
          WHEN 'azure_gpu' THEN 'Azure Virtual Machines'
          ELSE provider
        END as ServiceProviderName,

        -- Service category based on cost type
        CASE cost_type
          WHEN 'infrastructure' THEN 'Compute'
          ELSE 'AI and Machine Learning'
        END as ServiceCategory,

        -- Service name
        CASE cost_type
          WHEN 'payg' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' API')
          WHEN 'commitment' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' Commitment')
          WHEN 'infrastructure' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' GPU/TPU')
        END as ServiceName,

        -- Resource identification
        COALESCE(model, instance_type, 'default') as ResourceId,
        COALESCE(model, instance_type, provider) as ResourceName,
        cost_type as ResourceType,
        COALESCE(region, 'global') as RegionId,
        COALESCE(region, 'global') as RegionName,

        -- Usage
        CAST(usage_quantity AS NUMERIC) as ConsumedQuantity,
        usage_unit as ConsumedUnit,

        CASE cost_type
          WHEN 'commitment' THEN 'Committed'
          WHEN 'infrastructure' THEN CASE
            WHEN usage_unit = 'spot' THEN 'Spot'
            ELSE 'On-Demand'
          END
          ELSE 'On-Demand'
        END as PricingCategory,

        usage_unit as PricingUnit,

        -- Costs
        CAST(total_cost_usd AS NUMERIC) as EffectiveCost,
        CAST(total_cost_usd AS NUMERIC) as BilledCost,
        CAST(ROUND(total_cost_usd / (1 - COALESCE(discount_applied_pct, 0) / 100), 2) AS NUMERIC) as ListCost,
        CAST(NULL AS NUMERIC) as ListUnitPrice,
        CASE WHEN cost_type = 'commitment' THEN CAST(total_cost_usd AS NUMERIC) ELSE CAST(0 AS NUMERIC) END as ContractedCost,
        CAST(0 AS NUMERIC) as ContractedUnitPrice,

        -- Charge attributes
        'Usage' as ChargeCategory,
        'Usage' as ChargeType,
        'Usage-Based' as ChargeFrequency,

        -- Account
        org_slug as SubAccountId,
        org_slug as SubAccountName,

        -- Extension fields
        cost_type as x_genai_cost_type,
        provider as x_genai_provider,
        model as x_genai_model,
        -- 5-field hierarchy model (x_hierarchy_* prefix)
        x_hierarchy_entity_id,
        x_hierarchy_entity_name,
        x_hierarchy_level_code,
        x_hierarchy_path,
        x_hierarchy_path_names,
        CASE
          WHEN x_hierarchy_entity_id IS NOT NULL THEN CURRENT_TIMESTAMP()
          ELSE NULL
        END as x_hierarchy_validated_at,

        -- Lineage
        'genai_to_focus_bulk' as x_pipeline_id,
        'demo-credential' as x_credential_id,
        cost_date as x_pipeline_run_date,
        GENERATE_UUID() as x_run_id,
        CURRENT_TIMESTAMP() as x_ingested_at,
        100.0 as x_data_quality_score,
        CURRENT_TIMESTAMP() as x_created_at,
        'genai_costs_daily_unified' as x_source_system

      FROM `{PROJECT_ID}.{DATASET}.genai_costs_daily_unified`
      WHERE org_slug = '{ORG_SLUG}'
        AND total_cost_usd > 0
    """

    job = client.query(insert_query)
    job.result()  # Wait for completion

    inserted = job.num_dml_affected_rows or 0
    print(f"Inserted {inserted:,} FOCUS records")

    # Step 3: Verify final counts
    print("\nStep 3: Verifying conversion...")
    verify_query = f"""
        SELECT COUNT(*) as records, SUM(CAST(BilledCost AS FLOAT64)) as total_cost
        FROM `{PROJECT_ID}.{DATASET}.cost_data_standard_1_3`
        WHERE x_genai_cost_type IS NOT NULL
    """

    result = list(client.query(verify_query).result())
    for row in result:
        print(f"\nGenAI FOCUS records: {row.records:,}")
        if row.total_cost:
            print(f"Total cost: ${row.total_cost:,.2f}")

    print("\n" + "=" * 70)
    print("SUCCESS - GenAI costs now in FOCUS 1.3 format!")
    print("=" * 70)
    print("Dashboard should now show GenAI costs")
    print("=" * 70)

    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
