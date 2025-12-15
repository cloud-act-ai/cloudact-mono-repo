#!/bin/bash

# ================================================================================
# Migration Runner Script
# ================================================================================
# This script helps run database migrations safely with dry-run previews.
#
# Usage:
#   ./run_migration.sh <migration_name> <org_dataset> [--execute]
#
# Examples:
#   # Dry run (preview only)
#   ./run_migration.sh backfill_currency_audit_fields acme_corp_prod
#
#   # Execute migration
#   ./run_migration.sh backfill_currency_audit_fields acme_corp_prod --execute
#
#   # Sync procedures first
#   ./run_migration.sh --sync
# ================================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SERVICE_URL="${API_SERVICE_URL:-http://localhost:8001}"

# Validate environment
if [ -z "$CA_ROOT_API_KEY" ]; then
  echo -e "${RED}Error: CA_ROOT_API_KEY environment variable not set${NC}"
  echo "Export your root API key: export CA_ROOT_API_KEY='your-key'"
  exit 1
fi

if [ -z "$GCP_PROJECT_ID" ]; then
  echo -e "${RED}Error: GCP_PROJECT_ID environment variable not set${NC}"
  echo "Export your GCP project: export GCP_PROJECT_ID='your-project-id'"
  exit 1
fi

# Help text
show_help() {
  echo "Migration Runner Script"
  echo ""
  echo "Usage:"
  echo "  $0 <migration_name> <org_dataset> [--execute]"
  echo "  $0 --sync                                      # Sync procedures to BigQuery"
  echo "  $0 --list                                      # List available procedures"
  echo "  $0 --help                                      # Show this help"
  echo ""
  echo "Arguments:"
  echo "  migration_name    Name of migration procedure (without sp_ prefix)"
  echo "  org_dataset       Organization dataset (e.g., acme_corp_prod)"
  echo "  --execute         Execute migration (default: dry run only)"
  echo ""
  echo "Examples:"
  echo "  # Dry run (preview)"
  echo "  $0 backfill_currency_audit_fields acme_corp_prod"
  echo ""
  echo "  # Execute migration"
  echo "  $0 backfill_currency_audit_fields acme_corp_prod --execute"
  echo ""
  echo "Environment Variables:"
  echo "  CA_ROOT_API_KEY      Root API key (required)"
  echo "  GCP_PROJECT_ID       GCP project ID (required)"
  echo "  API_SERVICE_URL      Pipeline service URL (default: http://localhost:8001)"
}

# Sync procedures to BigQuery
sync_procedures() {
  echo -e "${BLUE}Syncing procedures to BigQuery...${NC}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_SERVICE_URL}/api/v1/procedures/sync" \
    -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"force": true}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Procedures synced successfully${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}✗ Failed to sync procedures (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
  fi
}

# List available procedures
list_procedures() {
  echo -e "${BLUE}Available procedures:${NC}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_SERVICE_URL}/api/v1/procedures" \
    -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -eq 200 ]; then
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}✗ Failed to list procedures (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
  fi
}

# Run migration using bq CLI
run_migration_bq() {
  local MIGRATION_NAME=$1
  local ORG_DATASET=$2
  local DRY_RUN=$3

  # Add sp_ prefix if not present
  if [[ ! "$MIGRATION_NAME" =~ ^sp_ ]]; then
    PROCEDURE_NAME="sp_${MIGRATION_NAME}"
  else
    PROCEDURE_NAME="$MIGRATION_NAME"
  fi

  if [ "$DRY_RUN" = "TRUE" ]; then
    echo -e "${YELLOW}Running dry run for: ${PROCEDURE_NAME}${NC}"
    echo -e "${YELLOW}Organization: ${ORG_DATASET}${NC}"
  else
    echo -e "${RED}EXECUTING MIGRATION: ${PROCEDURE_NAME}${NC}"
    echo -e "${RED}Organization: ${ORG_DATASET}${NC}"
    echo ""
    read -p "Are you sure you want to execute this migration? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "Migration cancelled"
      exit 0
    fi
  fi

  # Execute using bq CLI
  echo ""
  echo -e "${BLUE}Executing procedure...${NC}"

  bq query --use_legacy_sql=false \
    "CALL \`${GCP_PROJECT_ID}.organizations\`.${PROCEDURE_NAME}(
      '${GCP_PROJECT_ID}',
      '${ORG_DATASET}',
      ${DRY_RUN}
    )"

  if [ $? -eq 0 ]; then
    if [ "$DRY_RUN" = "TRUE" ]; then
      echo -e "${GREEN}✓ Dry run completed successfully${NC}"
      echo ""
      echo "To execute the migration, run:"
      echo "  $0 $MIGRATION_NAME $ORG_DATASET --execute"
    else
      echo -e "${GREEN}✓ Migration completed successfully${NC}"
    fi
  else
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
  fi
}

# Main script logic
main() {
  # Handle special commands
  case "${1:-}" in
    --help|-h)
      show_help
      exit 0
      ;;
    --sync)
      sync_procedures
      exit 0
      ;;
    --list)
      list_procedures
      exit 0
      ;;
  esac

  # Validate arguments
  if [ $# -lt 2 ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo ""
    show_help
    exit 1
  fi

  MIGRATION_NAME=$1
  ORG_DATASET=$2
  DRY_RUN="TRUE"

  # Check for --execute flag
  if [ "${3:-}" = "--execute" ]; then
    DRY_RUN="FALSE"
  fi

  # Check if bq CLI is installed
  if ! command -v bq &> /dev/null; then
    echo -e "${RED}Error: bq CLI not found${NC}"
    echo "Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi

  # Run migration
  run_migration_bq "$MIGRATION_NAME" "$ORG_DATASET" "$DRY_RUN"
}

# Run main function
main "$@"
