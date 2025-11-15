#!/bin/bash

# Run all 25 pipelines (5 customers × 5 templates) in parallel
# Tests complete pipeline execution with inline test data

echo "========================================="
echo "Running 25 Pipeline Tests in Parallel"
echo "========================================="
echo ""

# Customer data (tenant_id:api_key format)
CUSTOMERS="
acmeinc_23xv2:acmeinc_23xv2_api_qK44-NTGn0FxAyZZ
techcorp_99zx4:techcorp_99zx4_api_vz7MM1EkLosWs-Ui
datasystems_45abc:datasystems_45abc_api_nIRbW0pmvCukJB_b
cloudworks_78def:cloudworks_78def_api_brGXeGioqVY2qUKO
bytefactory_12ghi:bytefactory_12ghi_api_H2T7nBqcvGBgwlIz
"

# Pipeline templates
TEMPLATES="
bill-sample-export-template
usage-analytics-template
cost-optimization-template
resource-inventory-template
performance-metrics-template
"

# Track pipeline count
PIPELINE_COUNT=0

# Launch all pipelines in parallel
echo "$CUSTOMERS" | while IFS=: read TENANT_ID API_KEY; do
  # Skip empty lines
  [[ -z "$TENANT_ID" ]] && continue

  echo "$TEMPLATES" | while read TEMPLATE; do
    # Skip empty lines
    [[ -z "$TEMPLATE" ]] && continue
    ((PIPELINE_COUNT++))

    # Run in background
    (
      echo "[Pipeline $PIPELINE_COUNT/25] Starting: $TENANT_ID / $TEMPLATE"

      RESPONSE=$(curl -s -X POST \
        "http://localhost:8080/api/v1/pipelines/run/$TENANT_ID/gcp/cost/$TEMPLATE" \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{}')

      # Check if successful
      if echo "$RESPONSE" | grep -q '"pipeline_logging_id"'; then
        PIPELINE_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['pipeline_logging_id'])" 2>/dev/null || echo "unknown")
        echo "[Pipeline $PIPELINE_COUNT/25] ✓ SUCCESS: $TENANT_ID / $TEMPLATE (ID: $PIPELINE_ID)"
      else
        echo "[Pipeline $PIPELINE_COUNT/25] ✗ FAILED: $TENANT_ID / $TEMPLATE"
        echo "  Error: $RESPONSE" | head -c 200
      fi
    ) &

    # Small delay to avoid overwhelming the server
    sleep 0.2
  done
done

# Wait for all background jobs to complete
echo ""
echo "Waiting for all 25 pipelines to complete..."
wait

echo ""
echo "========================================="
echo "All 25 Pipeline Tests Completed!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Check BigQuery for created tables in each tenant dataset"
echo "2. Query pipeline_runs table for execution status"
echo "3. Review step_logs for detailed execution logs"
