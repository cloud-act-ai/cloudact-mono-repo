#!/bin/bash
# Test script to run GCP cost billing pipeline

# Clean up any previous processes
pkill -f uvicorn 2>/dev/null
sleep 2

# Start the API server
export GOOGLE_APPLICATION_CREDENTIALS=/Users/gurukallam/.gcp/gac-prod-471220-7a1eb8cb0a6a.json
export ENABLE_AUTH=false  # Disable authentication for testing
echo "Starting API server..."
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080 > api_test.log 2>&1 &
API_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 5

# Check health
echo "Checking API health..."
curl -s http://localhost:8080/health | jq .

# Run the pipeline (using acme1281 tenant which matches the test_key API key)
echo -e "\nRunning GCP cost billing pipeline..."
curl -X POST http://localhost:8080/api/v1/pipelines/run/acme1281/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key" \
  -d '{
    "date": "2024-11-17",
    "trigger_by": "test_script"
  }' -s | jq .

echo -e "\nChecking logs for errors..."
tail -20 api_test.log | grep -E "ERROR|SUCCESS|Pipeline|executed"

# Clean up
echo -e "\nCleaning up..."
kill $API_PID 2>/dev/null
