#!/bin/bash
# Load GenAI usage data into BigQuery
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Loading GenAI Usage Data"
echo "================================================"
echo ""

check_requirements
check_auth
check_dataset

TARGET_TABLE="${PROJECT_ID}:${DATASET}.genai_payg_usage_raw"

# Providers to load
PROVIDERS=("openai" "anthropic" "gemini")

for provider in "${PROVIDERS[@]}"; do
    DATA_FILE="${DATA_DIR}/genai/${provider}_usage_raw.json"

    if [[ ! -f "$DATA_FILE" ]]; then
        log_warn "Skipping ${provider}: ${DATA_FILE} not found"
        continue
    fi

    log_info "Loading ${provider} data from ${DATA_FILE}..."

    # Count records
    record_count=$(wc -l < "$DATA_FILE" | tr -d ' ')
    log_info "  Records to load: ${record_count}"

    # Load data (append mode - don't replace, as we're loading multiple providers)
    bq load \
        --source_format=NEWLINE_DELIMITED_JSON \
        --schema="${SCHEMA_DIR}/genai_payg_usage_raw.json" \
        "${TARGET_TABLE}" \
        "${DATA_FILE}"

    if [[ $? -eq 0 ]]; then
        log_info "  ${provider} data loaded successfully!"
    else
        log_error "  Failed to load ${provider} data"
        exit 1
    fi
done

echo ""
log_info "GenAI data loading complete!"

# Show record counts
echo ""
log_info "Verifying loaded data..."
bq query --use_legacy_sql=false \
    "SELECT provider, COUNT(*) as records, SUM(total_tokens) as total_tokens
     FROM \`${PROJECT_ID}.${DATASET}.genai_payg_usage_raw\`
     GROUP BY provider
     ORDER BY provider"
