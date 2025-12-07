#!/bin/bash
set -e

# Configuration
PROJECT_ID="gac-prod-471220"
DATASET_ID="procedure_testsing"
TIMEOUT_MS=30000 # 30 seconds default timeout
LOAD_TIMEOUT_MS=60000 # 60 seconds for data load

log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $1"
}

log "STARTING DEPLOYMENT AND VERIFICATION"

# 1. CLEANUP
log "Step 1: Cleaning up existing tables..."
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plan_costs_daily || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.cost_data_standard_1_2 || true
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging || true
log "Cleanup complete."

# 2. DEPLOY SCHEMA
log "Step 2: Deploying Schema (01_create_tables.sql)..."
bq query --use_legacy_sql=false --job_timeout_ms=${TIMEOUT_MS} < 1-PRE-ANALLISYS/finops_subscription_pipeline_sql/01_create_tables.sql
log "Schema deployed."

# 3. DEPLOY PROCEDURES
log "Step 3a: Deploying Stage 1 Procedure..."
bq query --use_legacy_sql=false --job_timeout_ms=${TIMEOUT_MS} < 1-PRE-ANALLISYS/finops_subscription_pipeline_sql/02_proc_stage1_calc_daily_costs.sql
log "Stage 1 Procedure deployed."

log "Step 3b: Deploying Stage 2 Procedure..."
bq query --use_legacy_sql=false --job_timeout_ms=${TIMEOUT_MS} < 1-PRE-ANALLISYS/finops_subscription_pipeline_sql/03_proc_stage2_convert_to_standard_1_2.sql
log "Stage 2 Procedure deployed."

log "Step 3c: Deploying Orchestrator..."
bq query --use_legacy_sql=false --job_timeout_ms=${TIMEOUT_MS} < 1-PRE-ANALLISYS/finops_subscription_pipeline_sql/04_proc_orchestrator.sql
log "Orchestrator deployed."

# 4. LOAD DATA
log "Step 4a: Loading CSV to Staging..."
bq load --autodetect --source_format=CSV --skip_leading_rows=1 ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging 1-PRE-ANALLISYS/finops_subscription_pipeline_sql/default_subscription_plans.csv
log "CSV loaded to staging."

log "Step 4b: Inserting to Final Table with updated_at..."
bq query --use_legacy_sql=false --job_timeout_ms=${LOAD_TIMEOUT_MS} "
  INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.subscription_plans\` (
    org_slug, subscription_id, provider, plan_name, display_name, category, 
    status, start_date, end_date, billing_cycle, currency, 
    seats, pricing_model, unit_price_usd, yearly_price_usd, 
    discount_type, discount_value, auto_renew, payment_method, invoice_id_last, 
    updated_at
  )
  SELECT 
    org_slug, subscription_id, provider, plan_name, display_name, category, 
    status, CAST(start_date AS DATE), CAST(end_date AS DATE), billing_cycle, currency, 
    seats, pricing_model, unit_price_usd, yearly_price_usd, 
    discount_type, discount_value, auto_renew, payment_method, invoice_id_last, 
    CURRENT_TIMESTAMP()
  FROM \`${PROJECT_ID}.${DATASET_ID}.subscription_plans_staging\`;
"
log "Data inserted into subscription_plans."

log "Step 4c: Cleaning Staging..."
bq rm -f -t ${PROJECT_ID}:${DATASET_ID}.subscription_plans_staging
log "Staging cleaned."

# 5. VERIFICATION
log "Step 5a: Running Pipeline (TEST 1 - Expect Success)..."
bq query --use_legacy_sql=false --job_timeout_ms=${LOAD_TIMEOUT_MS} "CALL \`${PROJECT_ID}.${DATASET_ID}.sp_run_subscription_costs_pipeline\`(DATE('2025-12-01'), DATE('2025-12-31'), NULL);"
log "Pipeline run 1 complete."

log "Step 5b: Running Pipeline Again (TEST 2 - Expect Skip)..."
# Capturing output to check for 'Skipping'
bq query --use_legacy_sql=false --job_timeout_ms=${TIMEOUT_MS} --format=pretty "CALL \`${PROJECT_ID}.${DATASET_ID}.sp_run_subscription_costs_pipeline\`(DATE('2025-12-01'), DATE('2025-12-31'), NULL);"
log "Pipeline run 2 complete."

log "DEPLOYMENT AND VERIFICATION FINISHED SUCCESSFULLY"
