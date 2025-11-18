#!/bin/bash
# Test pipeline execution and verify logging

API_KEY="test_logging_validation_api_DE-zWV-d0ofbX_Mu"
TENANT_ID="test_logging_validation"

echo "=== Executing Pipeline ==="
curl -X POST "http://localhost:8080/api/v1/pipelines/run/${TENANT_ID}/gcp/example/dryrun" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2025-11-17\",\"trigger_by\":\"test_user\"}"

echo -e "\n\n=== Waiting 5 seconds for pipeline to complete ==="
sleep 5

echo -e "\n=== Checking BigQuery tables ==="
bq query --use_legacy_sql=false "SELECT COUNT(*) as count FROM \`gac-prod-471220.${TENANT_ID}.x_meta_pipeline_runs\`"
bq query --use_legacy_sql=false "SELECT COUNT(*) as count FROM \`gac-prod-471220.${TENANT_ID}.x_meta_step_logs\`"

echo -e "\n=== Recent Pipeline Runs ==="
bq query --use_legacy_sql=false --max_rows=5 "SELECT * FROM \`gac-prod-471220.${TENANT_ID}.x_meta_pipeline_runs\` ORDER BY start_time DESC LIMIT 5"

echo -e "\n=== Recent Step Logs ==="
bq query --use_legacy_sql=false --max_rows=5 "SELECT * FROM \`gac-prod-471220.${TENANT_ID}.x_meta_step_logs\` ORDER BY start_time DESC LIMIT 5"
