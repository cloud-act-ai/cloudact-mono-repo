#!/bin/bash
# ===============================================================================
# Script: fix_genai_pricing_for_org.sh
# Purpose: Transform genai_payg_pricing.csv to add ALL required x_* columns
#
# BUG FIX: genai_payg_pricing.csv is missing required x_* fields:
#   - x_org_slug (REQUIRED)
#   - x_ingestion_date (REQUIRED - partition key)
#   - x_pipeline_id (REQUIRED)
#   - x_pipeline_run_date (REQUIRED)
#   - x_run_id (REQUIRED)
#   - x_ingested_at (REQUIRED)
#   - x_credential_id (NULLABLE)
#
# Usage:
#   ./fix_genai_pricing_for_org.sh acme_inc_01082026 cloudact-testing-1 acme_inc_01082026_local
#
# Arguments:
#   $1 - org_slug (e.g., acme_inc_01082026)
#   $2 - gcp_project_id (e.g., cloudact-testing-1)
#   $3 - dataset (e.g., acme_inc_01082026_local)
# ===============================================================================

set -e  # Exit on error

ORG_SLUG=$1
GCP_PROJECT_ID=$2
DATASET=$3

if [ -z "$ORG_SLUG" ] || [ -z "$GCP_PROJECT_ID" ] || [ -z "$DATASET" ]; then
    echo "ERROR: Missing required arguments"
    echo "Usage: $0 <org_slug> <gcp_project_id> <dataset>"
    echo "Example: $0 acme_inc_01082026 cloudact-testing-1 acme_inc_01082026_local"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
SOURCE_CSV="$REPO_ROOT/04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv"
TEMP_CSV="/tmp/genai_payg_pricing_with_org_${ORG_SLUG}.csv"
TABLE="${GCP_PROJECT_ID}:${DATASET}.genai_payg_pricing"

# Generate pipeline metadata
CURRENT_DATE=$(date +%Y-%m-%d)
CURRENT_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_ID="run_pricing_seed_$(date +%Y%m%d)_$(openssl rand -hex 4)"
PIPELINE_ID="genai_pricing_seed"

echo "============================================================"
echo "Fix GenAI Pricing CSV for Org"
echo "============================================================"
echo "Org Slug:         $ORG_SLUG"
echo "GCP Project:      $GCP_PROJECT_ID"
echo "Dataset:          $DATASET"
echo "Table:            $TABLE"
echo "Source CSV:       $SOURCE_CSV"
echo "Temp CSV:         $TEMP_CSV"
echo "Ingestion Date:   $CURRENT_DATE"
echo "Run ID:           $RUN_ID"
echo ""

# Step 1: Check source CSV exists
if [ ! -f "$SOURCE_CSV" ]; then
    echo "ERROR: Source CSV not found at $SOURCE_CSV"
    exit 1
fi

echo "[1/4] Creating modified CSV with all required x_* columns..."

# Step 2: Transform CSV to add ALL required x_* columns
# Original CSV header + new x_* columns at the end
ORIGINAL_HEADER=$(head -n 1 "$SOURCE_CSV")

# New header with x_* columns
# Schema order: x_org_slug at start, then other x_* fields at end
echo "x_org_slug,${ORIGINAL_HEADER},x_ingestion_date,x_pipeline_id,x_credential_id,x_pipeline_run_date,x_run_id,x_ingested_at" > "$TEMP_CSV"

# Add data lines with x_* values
# x_org_slug at start, other x_* at end
tail -n +2 "$SOURCE_CSV" | while IFS= read -r line; do
    # Append x_* values: x_org_slug at start, others at end
    echo "${ORG_SLUG},${line},${CURRENT_DATE},${PIPELINE_ID},,${CURRENT_DATE},${RUN_ID},${CURRENT_TIMESTAMP}"
done >> "$TEMP_CSV"

echo "   Created: $TEMP_CSV"
echo "   Rows: $(wc -l < "$TEMP_CSV")"

# Step 3: Verify transformed CSV
echo ""
echo "[2/4] Verifying transformed CSV..."
echo "   Header columns: $(head -n 1 "$TEMP_CSV" | tr ',' '\n' | wc -l)"
echo "   First 2 data rows (truncated):"
head -n 3 "$TEMP_CSV" | tail -n 2 | cut -c1-120

# Step 4: Load to BigQuery
echo ""
echo "[3/4] Loading to BigQuery..."
bq load \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --replace \
    "$TABLE" \
    "$TEMP_CSV"

if [ $? -eq 0 ]; then
    echo "   ✓ Successfully loaded $(tail -n +2 "$TEMP_CSV" | wc -l) pricing rows"
else
    echo "   ✗ Failed to load pricing data"
    exit 1
fi

# Step 5: Verify data in BigQuery
echo ""
echo "[4/4] Verifying data in BigQuery..."
ROW_COUNT=$(bq query --use_legacy_sql=false --format=csv \
    "SELECT COUNT(*) FROM \`${GCP_PROJECT_ID}.${DATASET}.genai_payg_pricing\` WHERE x_org_slug='$ORG_SLUG'" | tail -n 1)

echo "   Rows in BigQuery for org '$ORG_SLUG': $ROW_COUNT"

if [ "$ROW_COUNT" -gt 0 ]; then
    echo ""
    echo "============================================================"
    echo "✓ SUCCESS: GenAI pricing loaded for $ORG_SLUG"
    echo "============================================================"
else
    echo ""
    echo "============================================================"
    echo "✗ WARNING: No rows found for $ORG_SLUG in BigQuery"
    echo "============================================================"
    exit 1
fi

# Cleanup
rm -f "$TEMP_CSV"
echo ""
echo "Cleaned up temporary file: $TEMP_CSV"
