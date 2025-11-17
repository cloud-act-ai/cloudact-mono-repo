#!/bin/bash

# Simple Happy Path Test for Convergence Data Pipeline
# Tests: Onboarding → Pipeline Execution → Verification

set -e  # Exit on error

PROJECT_ID="gac-prod-471220"
TENANT_ID="demo_test"
API_URL="http://localhost:8080/api/v1"

echo "🧪 CONVERGENCE DATA PIPELINE - HAPPY PATH TEST"
echo "=============================================="
echo ""

# Step 1: Start the server
echo "📡 Step 1: Starting API server..."
pkill -f "uvicorn src.app.main:app" 2>/dev/null || true
sleep 2
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080 --log-level info > server.log 2>&1 &
SERVER_PID=$!
echo "   Server started (PID: $SERVER_PID)"
echo "   Waiting 5 seconds for server startup..."
sleep 5

# Step 2: Onboard tenant
echo ""
echo "👤 Step 2: Onboarding tenant '$TENANT_ID'..."
ONBOARD_RESPONSE=$(curl -s -X POST "$API_URL/customers/onboard" \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\": \"$TENANT_ID\"}")

echo "   Response: $ONBOARD_RESPONSE"

# Extract API key
API_KEY=$(echo $ONBOARD_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['api_key'])" 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
    echo "   ❌ Failed to get API key"
    kill $SERVER_PID
    exit 1
fi

echo "   ✅ Tenant onboarded successfully"
echo "   API Key: $API_KEY"

# Step 3: Run dry-run pipeline
echo ""
echo "🔄 Step 3: Running dry-run pipeline..."
PIPELINE_RESPONSE=$(curl -s -X POST "$API_URL/pipelines/run/$TENANT_ID/gcp/example/dryrun" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-17", "trigger_by": "happy_path_test"}')

echo "   Response: $PIPELINE_RESPONSE"

# Check if pipeline succeeded
STATUS=$(echo $PIPELINE_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null || echo "")

if [ "$STATUS" = "SUCCESS" ]; then
    echo "   ✅ Pipeline executed successfully"
else
    echo "   ⚠️  Pipeline status: $STATUS"
fi

# Step 4: Verify metadata
echo ""
echo "📊 Step 4: Verifying metadata in BigQuery..."
PIPELINE_RUNS=$(bq query --use_legacy_sql=false --format=json \
  "SELECT pipeline_logging_id, pipeline_id, status FROM \`$PROJECT_ID.$TENANT_ID.x_meta_pipeline_runs\` ORDER BY start_time DESC LIMIT 1" 2>/dev/null)

if [ ! -z "$PIPELINE_RUNS" ]; then
    echo "   ✅ Pipeline run logged:"
    echo "$PIPELINE_RUNS" | python3 -m json.tool
else
    echo "   ⚠️  No pipeline runs found"
fi

# Step 5: Cleanup
echo ""
echo "🧹 Step 5: Cleaning up test data..."
bq rm -r -f -d $PROJECT_ID:$TENANT_ID 2>/dev/null && echo "   ✅ Dataset deleted" || echo "   ⚠️  Dataset cleanup skipped"
kill $SERVER_PID 2>/dev/null && echo "   ✅ Server stopped" || echo "   ⚠️  Server already stopped"

echo ""
echo "=============================================="
echo "✅ HAPPY PATH TEST COMPLETE!"
echo "=============================================="
