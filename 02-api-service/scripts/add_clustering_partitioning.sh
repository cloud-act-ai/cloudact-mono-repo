#!/bin/bash

###############################################################################
# BigQuery Table Optimization Script
#
# Purpose: Add clustering and partitioning to 15 meta tables in organizations dataset
# Strategy: ALTER TABLE for clustering (zero downtime), CREATE TABLE AS SELECT for partitioning
#
# Usage:
#   ./add_clustering_partitioning.sh --dry-run      # Preview changes
#   ./add_clustering_partitioning.sh --execute      # Apply changes
#   ./add_clustering_partitioning.sh --rollback     # Restore from backups
#   ./add_clustering_partitioning.sh --status       # Check current table configurations
#
# Requirements:
#   - GCP_PROJECT_ID environment variable
#   - gcloud CLI authenticated
#   - BigQuery Admin permissions
#   - bq CLI tool installed
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-}"
DATASET="organizations"
BACKUP_SUFFIX="_backup_$(date +%Y%m%d_%H%M%S)"
MODE="${1:---dry-run}"

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Validate prerequisites
validate_prerequisites() {
    log_step "Validating prerequisites..."

    if [ -z "$PROJECT_ID" ]; then
        log_error "GCP_PROJECT_ID environment variable not set"
        exit 1
    fi

    if ! command -v bq &> /dev/null; then
        log_error "bq CLI tool not found. Please install Google Cloud SDK."
        exit 1
    fi

    if ! bq ls --project_id="$PROJECT_ID" &> /dev/null; then
        log_error "Cannot access BigQuery. Please authenticate with 'gcloud auth login'"
        exit 1
    fi

    if ! bq ls --project_id="$PROJECT_ID" --dataset_id="$DATASET" &> /dev/null; then
        log_error "Dataset '$DATASET' not found in project '$PROJECT_ID'"
        exit 1
    fi

    log_info "Prerequisites validated successfully"
}

# Get current table configuration
get_table_info() {
    local table_name=$1
    log_info "Current configuration for $table_name:"
    bq show --format=prettyjson "$PROJECT_ID:$DATASET.$table_name" | \
        jq -r '{clustering: .clustering, timePartitioning: .timePartitioning}'
}

# Show status of all tables
show_status() {
    log_step "Checking current table configurations..."

    local tables=(
        "org_profiles"
        "org_api_keys"
        "org_subscriptions"
        "org_usage_quotas"
        "org_integration_credentials"
        "org_pipeline_configs"
        "org_scheduled_pipeline_runs"
        "org_pipeline_execution_queue"
        "org_meta_pipeline_runs"
        "org_meta_step_logs"
        "org_meta_dq_results"
        "org_audit_logs"
        "org_cost_tracking"
        "org_kms_keys"
        "org_idempotency_keys"
    )

    for table in "${tables[@]}"; do
        echo ""
        log_info "=== $table ==="
        get_table_info "$table"
    done
}

# Add clustering only (zero downtime with ALTER TABLE)
add_clustering() {
    local table_name=$1
    shift
    local clustering_fields=("$@")

    local fields_str=$(IFS=,; echo "${clustering_fields[*]}")

    if [ "$MODE" == "--dry-run" ]; then
        log_info "[DRY RUN] Would add clustering to $table_name: [$fields_str]"
        echo "ALTER TABLE \`$PROJECT_ID.$DATASET.$table_name\`"
        echo "SET OPTIONS (clustering_fields = ['$(IFS="','"; echo "${clustering_fields[*]}")']);"
        echo ""
        return
    fi

    log_step "Adding clustering to $table_name..."

    bq update \
        --clustering_fields="$fields_str" \
        "$PROJECT_ID:$DATASET.$table_name"

    log_info "✓ Clustering added successfully to $table_name"
}

# Add partitioning + clustering (requires table recreation)
add_partitioning_and_clustering() {
    local table_name=$1
    local partition_field=$2
    local partition_type=$3  # DAY, HOUR, MONTH, YEAR
    shift 3
    local clustering_fields=("$@")

    local fields_str=$(IFS=,; echo "${clustering_fields[*]}")
    local temp_table="${table_name}_temp"
    local backup_table="${table_name}${BACKUP_SUFFIX}"

    if [ "$MODE" == "--dry-run" ]; then
        log_info "[DRY RUN] Would add partitioning + clustering to $table_name:"
        echo "  Partition: $partition_type on $partition_field"
        echo "  Clustering: [$fields_str]"
        echo ""
        echo "-- Step 1: Create backup"
        echo "CREATE TABLE \`$PROJECT_ID.$DATASET.$backup_table\`"
        echo "AS SELECT * FROM \`$PROJECT_ID.$DATASET.$table_name\`;"
        echo ""
        echo "-- Step 2: Create new partitioned+clustered table"
        echo "CREATE TABLE \`$PROJECT_ID.$DATASET.$temp_table\`"
        echo "PARTITION BY DATE($partition_field)"
        echo "CLUSTER BY $fields_str"
        echo "AS SELECT * FROM \`$PROJECT_ID.$DATASET.$table_name\`;"
        echo ""
        echo "-- Step 3: Drop old table"
        echo "DROP TABLE \`$PROJECT_ID.$DATASET.$table_name\`;"
        echo ""
        echo "-- Step 4: Rename temp table"
        echo "ALTER TABLE \`$PROJECT_ID.$DATASET.$temp_table\`"
        echo "RENAME TO $table_name;"
        echo ""
        return
    fi

    log_step "Adding partitioning + clustering to $table_name..."
    log_warn "This operation requires table recreation and brief unavailability"

    # Step 1: Create backup
    log_info "Creating backup: $backup_table"
    bq cp --force \
        "$PROJECT_ID:$DATASET.$table_name" \
        "$PROJECT_ID:$DATASET.$backup_table"

    # Step 2: Create temp partitioned+clustered table
    log_info "Creating new partitioned+clustered table: $temp_table"
    bq query --use_legacy_sql=false \
        "CREATE TABLE \`$PROJECT_ID.$DATASET.$temp_table\`
        PARTITION BY DATE($partition_field)
        CLUSTER BY $fields_str
        AS SELECT * FROM \`$PROJECT_ID.$DATASET.$table_name\`"

    # Step 3: Drop old table
    log_info "Dropping old table: $table_name"
    bq rm -f "$PROJECT_ID:$DATASET.$table_name"

    # Step 4: Rename temp table to original name
    log_info "Renaming $temp_table to $table_name"
    bq cp --force \
        "$PROJECT_ID:$DATASET.$temp_table" \
        "$PROJECT_ID:$DATASET.$table_name"
    bq rm -f "$PROJECT_ID:$DATASET.$temp_table"

    log_info "✓ Partitioning + clustering added successfully to $table_name"
    log_info "  Backup available at: $backup_table"
}

# Rollback from backups
rollback_tables() {
    log_step "Rolling back tables from backups..."

    if [ "$MODE" != "--rollback" ]; then
        log_error "This function should only be called in --rollback mode"
        exit 1
    fi

    # Find all backup tables
    local backups=$(bq ls --project_id="$PROJECT_ID" --dataset_id="$DATASET" --max_results=1000 | \
        grep "_backup_" | awk '{print $1}')

    if [ -z "$backups" ]; then
        log_warn "No backup tables found"
        return
    fi

    log_info "Found backup tables:"
    echo "$backups"
    echo ""

    read -p "Are you sure you want to restore from these backups? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warn "Rollback cancelled"
        return
    fi

    for backup in $backups; do
        # Extract original table name (remove backup suffix)
        local original_table=$(echo "$backup" | sed -E 's/_backup_[0-9]{8}_[0-9]{6}//')

        log_info "Restoring $original_table from $backup"

        # Drop current table
        bq rm -f "$PROJECT_ID:$DATASET.$original_table"

        # Restore from backup
        bq cp --force \
            "$PROJECT_ID:$DATASET.$backup" \
            "$PROJECT_ID:$DATASET.$original_table"

        log_info "✓ Restored $original_table"
    done

    log_info "Rollback completed successfully"
}

# Main optimization function
optimize_tables() {
    log_step "Starting table optimization process..."

    # ========================================
    # TABLES WITH CLUSTERING ONLY (No Partitioning)
    # ========================================

    # 1. org_profiles - No natural time field for partitioning
    add_clustering "org_profiles" "org_slug" "status"

    # 2. org_integration_credentials - No time-based queries
    add_clustering "org_integration_credentials" "org_slug" "provider" "validation_status"

    # 3. org_pipeline_configs - Config lookups by org + provider
    add_clustering "org_pipeline_configs" "org_slug" "provider" "is_active"

    # 4. org_kms_keys - Small table, no time-based queries
    add_clustering "org_kms_keys" "org_slug" "key_type" "is_active"

    # 5. org_idempotency_keys - Lookup by key first, then org
    add_clustering "org_idempotency_keys" "idempotency_key" "org_slug"

    # ========================================
    # TABLES WITH PARTITIONING + CLUSTERING
    # ========================================

    # 6. org_api_keys - Partition by created_at (audit trail)
    add_partitioning_and_clustering "org_api_keys" "created_at" "DAY" \
        "org_slug" "is_active"

    # 7. org_subscriptions - Partition by created_at (billing history)
    add_partitioning_and_clustering "org_subscriptions" "created_at" "DAY" \
        "org_slug" "status" "plan_name"

    # 8. org_usage_quotas - Partition by usage_date (daily quota queries)
    add_partitioning_and_clustering "org_usage_quotas" "usage_date" "DAY" \
        "org_slug" "usage_date"

    # 9. org_scheduled_pipeline_runs - Partition by scheduled_time
    add_partitioning_and_clustering "org_scheduled_pipeline_runs" "scheduled_time" "DAY" \
        "org_slug" "state" "config_id"

    # 10. org_pipeline_execution_queue - Partition by scheduled_time
    # Note: Different clustering order (state first for queue queries)
    add_partitioning_and_clustering "org_pipeline_execution_queue" "scheduled_time" "DAY" \
        "state" "priority" "org_slug"

    # 11. org_meta_pipeline_runs - Partition by start_time (main query field)
    add_partitioning_and_clustering "org_meta_pipeline_runs" "start_time" "DAY" \
        "org_slug" "status"

    # 12. org_meta_step_logs - Partition by start_time (correlates with pipeline runs)
    add_partitioning_and_clustering "org_meta_step_logs" "start_time" "DAY" \
        "org_slug" "pipeline_logging_id"

    # 13. org_meta_dq_results - Partition by ingestion_date
    add_partitioning_and_clustering "org_meta_dq_results" "ingestion_date" "DAY" \
        "org_slug" "overall_status"

    # 14. org_audit_logs - Partition by created_at (compliance queries)
    add_partitioning_and_clustering "org_audit_logs" "created_at" "DAY" \
        "org_slug" "action" "resource_type"

    # 15. org_cost_tracking - Partition by usage_date (cost analytics)
    add_partitioning_and_clustering "org_cost_tracking" "usage_date" "DAY" \
        "org_slug" "resource_type" "provider"

    log_info "✓ All table optimizations completed successfully"
}

# Print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

BigQuery Table Optimization Script for 15 meta tables in organizations dataset

OPTIONS:
    --dry-run      Preview changes without executing (default)
    --execute      Apply clustering and partitioning changes
    --rollback     Restore tables from backups
    --status       Show current table configurations
    --help         Show this help message

EXAMPLES:
    # Preview changes
    $0 --dry-run

    # Apply optimizations
    $0 --execute

    # Check current status
    $0 --status

    # Rollback to backups
    $0 --rollback

ENVIRONMENT VARIABLES:
    GCP_PROJECT_ID    Required. GCP project ID (e.g., your-project-id)

TABLES OPTIMIZED (15 total):
    Clustering only (5):
        - org_profiles
        - org_integration_credentials
        - org_pipeline_configs
        - org_kms_keys
        - org_idempotency_keys

    Partitioning + Clustering (10):
        - org_api_keys (partitioned by created_at)
        - org_subscriptions (partitioned by created_at)
        - org_usage_quotas (partitioned by usage_date)
        - org_scheduled_pipeline_runs (partitioned by scheduled_time)
        - org_pipeline_execution_queue (partitioned by scheduled_time)
        - org_meta_pipeline_runs (partitioned by start_time)
        - org_meta_step_logs (partitioned by start_time)
        - org_meta_dq_results (partitioned by ingestion_date)
        - org_audit_logs (partitioned by created_at)
        - org_cost_tracking (partitioned by usage_date)

NOTES:
    - Clustering operations use ALTER TABLE (zero downtime)
    - Partitioning operations require table recreation (brief unavailability)
    - Backups are created automatically before partitioning changes
    - All tables cluster by org_slug first for multi-tenant isolation

EOF
}

# Main execution
main() {
    case "$MODE" in
        --dry-run)
            log_info "Running in DRY RUN mode (no changes will be made)"
            validate_prerequisites
            optimize_tables
            ;;
        --execute)
            log_warn "Running in EXECUTE mode (changes will be applied)"
            validate_prerequisites
            read -p "Are you sure you want to proceed? (yes/no): " confirm
            if [ "$confirm" != "yes" ]; then
                log_warn "Operation cancelled"
                exit 0
            fi
            optimize_tables
            ;;
        --rollback)
            log_warn "Running in ROLLBACK mode (restoring from backups)"
            validate_prerequisites
            rollback_tables
            ;;
        --status)
            validate_prerequisites
            show_status
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            log_error "Invalid option: $MODE"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main
