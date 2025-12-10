#!/bin/bash
# Cache Performance Testing Script
#
# This script tests the caching implementation by making multiple requests
# to the subscription endpoints and measuring response times.
#
# Usage:
#   ./scripts/test_cache_performance.sh [org_slug] [provider]
#
# Example:
#   ./scripts/test_cache_performance.sh test_org slack

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
ORG_SLUG="${1:-test_org}"
PROVIDER="${2:-slack}"
API_KEY="${API_KEY:-test_api_key}"

echo "=================================="
echo "Cache Performance Test"
echo "=================================="
echo "API URL: $API_BASE_URL"
echo "Org: $ORG_SLUG"
echo "Provider: $PROVIDER"
echo ""

# Test 1: List Providers (Cache Miss)
echo "Test 1: GET /subscriptions/${ORG_SLUG}/providers (Cache Miss)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/providers" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION1=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION1}s"
echo ""

# Test 2: List Providers (Cache Hit)
echo "Test 2: GET /subscriptions/${ORG_SLUG}/providers (Cache Hit)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/providers" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION2=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION2}s"
echo ""

if [ "$DURATION1" != "N/A" ] && [ "$DURATION2" != "N/A" ]; then
  SPEEDUP=$(echo "scale=1; $DURATION1 / $DURATION2" | bc)
  echo "Cache speedup: ${SPEEDUP}x faster"
  echo ""
fi

# Test 3: List Plans (Cache Miss)
echo "Test 3: GET /subscriptions/${ORG_SLUG}/providers/${PROVIDER}/plans (Cache Miss)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/providers/${PROVIDER}/plans" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION3=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION3}s"
echo ""

# Test 4: List Plans (Cache Hit)
echo "Test 4: GET /subscriptions/${ORG_SLUG}/providers/${PROVIDER}/plans (Cache Hit)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/providers/${PROVIDER}/plans" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION4=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION4}s"
echo ""

if [ "$DURATION3" != "N/A" ] && [ "$DURATION4" != "N/A" ]; then
  SPEEDUP=$(echo "scale=1; $DURATION3 / $DURATION4" | bc)
  echo "Cache speedup: ${SPEEDUP}x faster"
  echo ""
fi

# Test 5: All Plans (Cache Miss)
echo "Test 5: GET /subscriptions/${ORG_SLUG}/all-plans (Cache Miss)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/all-plans" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION5=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION5}s"
echo ""

# Test 6: All Plans (Cache Hit)
echo "Test 6: GET /subscriptions/${ORG_SLUG}/all-plans (Cache Hit)"
echo "----------------------------------------------------------------"
START=$(gdate +%s.%N 2>/dev/null || date +%s)
curl -s -H "X-API-Key: $API_KEY" \
  "$API_BASE_URL/api/v1/subscriptions/${ORG_SLUG}/all-plans" > /dev/null
END=$(gdate +%s.%N 2>/dev/null || date +%s)
DURATION6=$(echo "$END - $START" | bc 2>/dev/null || echo "N/A")
echo "Response time: ${DURATION6}s"
echo ""

if [ "$DURATION5" != "N/A" ] && [ "$DURATION6" != "N/A" ]; then
  SPEEDUP=$(echo "scale=1; $DURATION5 / $DURATION6" | bc)
  echo "Cache speedup: ${SPEEDUP}x faster"
  echo ""
fi

# Summary
echo "=================================="
echo "Performance Summary"
echo "=================================="
echo ""
echo "Endpoint                         | First Request | Cached Request | Speedup"
echo "-------------------------------- | ------------- | -------------- | -------"
echo "GET /providers                   | ${DURATION1}s       | ${DURATION2}s       | ${SPEEDUP:-N/A}x"
echo "GET /providers/{provider}/plans  | ${DURATION3}s       | ${DURATION4}s       | ${SPEEDUP:-N/A}x"
echo "GET /all-plans                   | ${DURATION5}s       | ${DURATION6}s       | ${SPEEDUP:-N/A}x"
echo ""
echo "✓ Test completed successfully"
echo ""
echo "To check cache statistics:"
echo "  python3 -c \"from src.core.utils.cache import get_cache; print(get_cache().get_stats())\""
