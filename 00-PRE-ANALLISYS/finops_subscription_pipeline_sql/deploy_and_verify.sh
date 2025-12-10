#!/bin/bash
set -e

# Configuration
PROJECT_ID="gac-prod-471220"
DATASET_ID="procedure_testsing"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $1"
}

log "STARTING DEPLOYMENT AND VERIFICATION"

# 1. CLEANUP
log "Step 1: Cleaning up existing tables..."
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plan_costs_daily || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.cost_data_standard_1_2 || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.org_subscription_audit || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging || true
log "Cleanup complete."

# 2. DEPLOY SCHEMA (4 tables)
log "Step 2: Deploying Schema (01_create_tables.sql)..."
bq query --use_legacy_sql=false < "${SCRIPT_DIR}/01_create_tables.sql"
log "Schema deployed (4 tables)."

# 3. DEPLOY PROCEDURES
log "Step 3a: Deploying Stage 1 Procedure..."
bq query --use_legacy_sql=false < "${SCRIPT_DIR}/02_proc_stage1_calc_daily_costs.sql"
log "Stage 1 Procedure deployed."

log "Step 3b: Deploying Stage 2 Procedure..."
bq query --use_legacy_sql=false < "${SCRIPT_DIR}/03_proc_stage2_convert_to_standard_1_2.sql"
log "Stage 2 Procedure deployed."

log "Step 3c: Deploying Orchestrator..."
bq query --use_legacy_sql=false < "${SCRIPT_DIR}/04_proc_orchestrator.sql"
log "Orchestrator deployed."

# 4. LOAD DATA
log "Step 4a: Loading CSV to Staging..."
bq load --autodetect --source_format=CSV --skip_leading_rows=1 \
  ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging \
  "${SCRIPT_DIR}/default_subscription_plans.csv"
log "CSV loaded to staging."

log "Step 4b: Inserting to Final Table..."
bq query --use_legacy_sql=false "
  INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.subscription_plans\` (
    org_slug, subscription_id, provider, plan_name, display_name, category,
    status, start_date, end_date, billing_cycle, currency,
    seats, pricing_model, unit_price_usd, yearly_price_usd,
    discount_type, discount_value, auto_renew, payment_method, invoice_id_last,
    owner_email, department, renewal_date, contract_id, notes,
    updated_at
  )
  SELECT
    org_slug, subscription_id, provider, plan_name, display_name, category,
    status, CAST(start_date AS DATE), CAST(end_date AS DATE), billing_cycle, currency,
    seats, pricing_model, unit_price_usd, yearly_price_usd,
    discount_type, discount_value, auto_renew, payment_method, invoice_id_last,
    owner_email, department, CAST(renewal_date AS DATE), contract_id, notes,
    CURRENT_TIMESTAMP()
  FROM \`${PROJECT_ID}.${DATASET_ID}.subscription_plans_staging\`;
"
log "Data inserted into subscription_plans."

log "Step 4c: Cleaning Staging..."
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging
log "Staging cleaned."

# 5. VERIFICATION
log "Step 5: Running Pipeline Test..."
bq query --use_legacy_sql=false --format=pretty \
  "CALL \`${PROJECT_ID}.${DATASET_ID}.sp_run_subscription_costs_pipeline\`(DATE('2025-12-01'), DATE('2025-12-31'), NULL);"
log "Pipeline test complete."

# 6. VERIFY COUNTS
log "Step 6: Verifying row counts..."
bq query --use_legacy_sql=false --format=pretty "
SELECT
  'subscription_plans' AS table_name, COUNT(*) AS row_count
FROM \`${PROJECT_ID}.${DATASET_ID}.subscription_plans\`
UNION ALL
SELECT
  'subscription_plan_costs_daily', COUNT(*)
FROM \`${PROJECT_ID}.${DATASET_ID}.subscription_plan_costs_daily\`
UNION ALL
SELECT
  'cost_data_standard_1_2', COUNT(*)
FROM \`${PROJECT_ID}.${DATASET_ID}.cost_data_standard_1_2\`
"

log "DEPLOYMENT AND VERIFICATION FINISHED SUCCESSFULLY"
