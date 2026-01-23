#!/bin/bash
# Migration Script: Standardize x_* fields across all tables
# Usage: ./migrate_x_fields.sh <project> <dataset>
# Example: ./migrate_x_fields.sh cloudact-prod cloudact_inc_01162026_prod

set -e

PROJECT=${1:-cloudact-prod}
DATASET=${2:-cloudact_inc_01162026_prod}

echo "=== Migrating x_* fields ==="
echo "Project: $PROJECT"
echo "Dataset: $DATASET"
echo ""

# Function to run ALTER TABLE safely (ignores errors for missing columns)
run_alter() {
    local table=$1
    local sql=$2
    echo "Migrating $table..."
    bq query --use_legacy_sql=false --project_id=$PROJECT "$sql" 2>/dev/null || echo "  (some columns may already be renamed or missing)"
}

# ============================================================================
# CLOUD PROVIDER TABLES
# ============================================================================

echo "=== Cloud Provider Tables ==="

# GCP Billing
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS ingestion_date TO x_ingestion_date;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
"
run_alter "cloud_gcp_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_gcp_billing_raw_daily\`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;
"

# AWS Billing
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS ingestion_timestamp TO x_ingestion_date;
"
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
"
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
"
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
"
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
"
run_alter "cloud_aws_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_aws_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
"

# Azure Billing
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS ingestion_timestamp TO x_ingestion_date;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
"
run_alter "cloud_azure_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_azure_billing_raw_daily\`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;
"

# OCI Billing
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS ingestion_timestamp TO x_ingestion_date;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
"
run_alter "cloud_oci_billing_raw_daily" "
ALTER TABLE \`$PROJECT.$DATASET.cloud_oci_billing_raw_daily\`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;
"

# ============================================================================
# GENAI TABLES
# ============================================================================

echo ""
echo "=== GenAI Tables ==="

for table in genai_payg_usage_raw genai_payg_costs_daily genai_commitment_usage_raw genai_commitment_costs_daily genai_infrastructure_usage_raw genai_infrastructure_costs_daily genai_costs_daily_unified genai_usage_daily_unified; do
    run_alter "$table" "
    ALTER TABLE \`$PROJECT.$DATASET.$table\`
      RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
    "
    run_alter "$table" "
    ALTER TABLE \`$PROJECT.$DATASET.$table\`
      RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
    "
    run_alter "$table" "
    ALTER TABLE \`$PROJECT.$DATASET.$table\`
      RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
    "
    run_alter "$table" "
    ALTER TABLE \`$PROJECT.$DATASET.$table\`
      RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
    "
    run_alter "$table" "
    ALTER TABLE \`$PROJECT.$DATASET.$table\`
      RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
    "
done

# ============================================================================
# FOCUS 1.3 UNIFIED TABLE
# ============================================================================

echo ""
echo "=== FOCUS 1.3 Table ==="

run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  RENAME COLUMN IF EXISTS hierarchy_entity_id TO x_hierarchy_entity_id;
"
run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  RENAME COLUMN IF EXISTS hierarchy_entity_name TO x_hierarchy_entity_name;
"
run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  RENAME COLUMN IF EXISTS hierarchy_level_code TO x_hierarchy_level_code;
"
run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  RENAME COLUMN IF EXISTS hierarchy_path TO x_hierarchy_path;
"
run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  RENAME COLUMN IF EXISTS hierarchy_path_names TO x_hierarchy_path_names;
"
run_alter "cost_data_standard_1_3" "
ALTER TABLE \`$PROJECT.$DATASET.cost_data_standard_1_3\`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;
"

echo ""
echo "=== Migration Complete ==="
echo "Verify with: bq show --schema $PROJECT:$DATASET.cloud_gcp_billing_raw_daily | grep x_"
