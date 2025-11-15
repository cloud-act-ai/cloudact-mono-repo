#!/bin/bash

# Test Pipeline End-to-End
# This script tests the complete pricing_calculation pipeline for acme1281

set -e

API_BASE="http://localhost:8080/api/v1"

echo "================================"
echo "Pipeline End-to-End Test"
echo "================================"

# Step 1: Create tenant acme1281
echo ""
echo "Step 1: Creating tenant acme1281..."
curl -X POST "$API_BASE/admin/tenants" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme1281",
    "tenant_name": "ACME Corporation",
    "description": "Test tenant for pricing calculation pipeline",
    "dataset_types": ["google"]
  }' | python3 -m json.tool

# Step 2: Create API key for acme1281
echo ""
echo "Step 2: Creating API key for acme1281..."
API_KEY_RESPONSE=$(curl -s -X POST "$API_BASE/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme1281",
    "description": "Test API key for pricing calculation"
  }')

echo "$API_KEY_RESPONSE" | python3 -m json.tool

# Extract API key
API_KEY=$(echo "$API_KEY_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['api_key'])")

echo ""
echo "API Key created: $API_KEY"

# Step 3: Trigger pipeline
echo ""
echo "Step 3: Triggering pricing_calculation pipeline..."
PIPELINE_RESPONSE=$(curl -s -X POST "$API_BASE/pipelines/run/pricing_calculation" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-14",
    "trigger_by": "test_script"
  }')

echo "$PIPELINE_RESPONSE" | python3 -m json.tool

# Extract pipeline logging ID
PIPELINE_LOGGING_ID=$(echo "$PIPELINE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['pipeline_logging_id'])")

echo ""
echo "Pipeline triggered: $PIPELINE_LOGGING_ID"

# Step 4: Wait for pipeline to complete
echo ""
echo "Step 4: Waiting for pipeline to complete..."
sleep 5

# Step 5: Check pipeline status
echo ""
echo "Step 5: Checking pipeline status..."
curl -s -X GET "$API_BASE/pipelines/runs/$PIPELINE_LOGGING_ID" \
  -H "x-api-key: $API_KEY" | python3 -m json.tool

echo ""
echo "================================"
echo "Test Complete!"
echo "================================"
echo ""
echo "Check BigQuery for results:"
echo "  - Dataset: gac-prod-471220.acme1281_google"
echo "  - Tables: pricing_export_raw, pricing_export_final"
echo "  - Metadata: gac-prod-471220.metadata.pipeline_runs"
echo "  - DQ Results: gac-prod-471220.metadata.dq_results"
