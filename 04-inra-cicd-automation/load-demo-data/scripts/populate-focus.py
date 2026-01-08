#!/usr/bin/env python3
"""
Populate FOCUS 1.3 table from subscription and GenAI cost data.
"""

from google.cloud import bigquery
import os

# Initialize BigQuery client
project_id = os.getenv("GCP_PROJECT_ID", "cloudact-testing-1")
org_slug = os.getenv("ORG_SLUG", "acme_inc_01082026")
env = os.getenv("ENVIRONMENT", "local")
dataset_id = f"{org_slug}_{env}"

client = bigquery.Client(project=project_id)

print("="*70)
print("  Populating FOCUS 1.3 Table")
print("="*70)
print(f"\nProject: {project_id}")
print(f"Dataset: {dataset_id}")
print()

# SQL to insert subscription costs
subscription_sql = f"""
INSERT INTO `{project_id}.{dataset_id}.cost_data_standard_1_3`
(
  BillingAccountId, BilledCost, BillingCurrency, BillingPeriodStart, BillingPeriodEnd,
  ChargeCategory, ChargePeriodStart, ChargePeriodEnd, ContractedCost, EffectiveCost,
  HostProviderName, InvoiceIssuerName, ListCost, ServiceCategory, ServiceName,
  ServiceProviderName, ChargeClass, ChargeDescription, ChargeFrequency,
  ConsumedQuantity, ConsumedUnit, ProviderName, PublisherName,
  ResourceId, ResourceName, ResourceType, SubAccountId, SubAccountName,
  hierarchy_entity_id, hierarchy_entity_name, hierarchy_level_code,
  hierarchy_path, hierarchy_path_names,
  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
  x_org_slug, x_source_system
)
SELECT
  org_slug, daily_cost, currency, TIMESTAMP(cost_date), TIMESTAMP(cost_date),
  'Purchase', TIMESTAMP(cost_date), TIMESTAMP(cost_date), daily_cost, daily_cost,
  provider, provider, daily_cost, 'Software', provider,
  provider, 'Recurring', CONCAT(display_name, ' - ', plan_name), billing_cycle,
  CAST(seats AS NUMERIC), 'seats', provider, provider,
  subscription_id, display_name, 'SaaS Subscription', subscription_id, display_name,
  hierarchy_entity_id, hierarchy_entity_name, hierarchy_level_code,
  hierarchy_path, hierarchy_path_names,
  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
  org_slug, 'subscription_costs'
FROM `{project_id}.{dataset_id}.subscription_plan_costs_daily`
"""

# SQL to insert GenAI costs
genai_sql = f"""
INSERT INTO `{project_id}.{dataset_id}.cost_data_standard_1_3`
(
  BillingAccountId, BilledCost, BillingCurrency, BillingPeriodStart, BillingPeriodEnd,
  ChargeCategory, ChargePeriodStart, ChargePeriodEnd, ContractedCost, EffectiveCost,
  HostProviderName, InvoiceIssuerName, ListCost, ServiceCategory, ServiceName,
  ServiceProviderName, ChargeClass, ChargeDescription,
  ConsumedQuantity, ConsumedUnit, ProviderName, PublisherName,
  ResourceId, ResourceName, ResourceType, RegionId,
  hierarchy_entity_id, hierarchy_entity_name, hierarchy_level_code,
  hierarchy_path, hierarchy_path_names,
  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
  x_org_slug, x_source_system, x_genai_cost_type, x_genai_provider, x_genai_model
)
SELECT
  org_slug, total_cost_usd, 'USD', TIMESTAMP(cost_date), TIMESTAMP(cost_date),
  'Usage', TIMESTAMP(cost_date), TIMESTAMP(cost_date), total_cost_usd, total_cost_usd,
  provider, provider, total_cost_usd, 'AI/ML', provider,
  provider, 'On-Demand', CONCAT(provider, ' ', model, ' - ', CAST(usage_quantity AS STRING), ' tokens'),
  usage_quantity, usage_unit, provider, provider,
  CONCAT(provider, '_', model), model, 'GenAI API', COALESCE(region, 'global'),
  hierarchy_entity_id, hierarchy_entity_name, hierarchy_level_code,
  hierarchy_path, hierarchy_path_names,
  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
  org_slug, 'genai_costs', cost_type, provider, model
FROM `{project_id}.{dataset_id}.genai_costs_daily_unified`
"""

try:
    # Insert subscription costs
    print("Inserting subscription costs...")
    job1 = client.query(subscription_sql)
    result1 = job1.result()
    print(f"  ✓ Inserted {job1.num_dml_affected_rows} subscription cost records")

    # Insert GenAI costs
    print("Inserting GenAI costs...")
    job2 = client.query(genai_sql)
    result2 = job2.result()
    print(f"  ✓ Inserted {job2.num_dml_affected_rows} GenAI cost records")

    # Verify total
    count_sql = f"SELECT COUNT(*) as total FROM `{project_id}.{dataset_id}.cost_data_standard_1_3`"
    total = list(client.query(count_sql).result())[0].total
    print(f"\n✓ Total FOCUS 1.3 records: {total}")
    print("\n" + "="*70)
    print("  FOCUS 1.3 Population Complete!")
    print("="*70 + "\n")

except Exception as e:
    print(f"\n✗ Error: {e}")
    exit(1)
