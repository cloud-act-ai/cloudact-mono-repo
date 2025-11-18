#!/bin/bash
################################################################################
# Database Migration Script for Convergence Data Pipeline
# Usage: ./migrate.sh <environment> <action>
# Actions: status, upgrade, downgrade, history
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-}"
ACTION="${2:-status}"
REGION="us-central1"
DRY_RUN=false

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
usage() {
    cat << EOF
Usage: $0 <environment> <action> [options]

Environments:
  development    Run migrations on development database
  staging        Run migrations on staging database
  production     Run migrations on production database

Actions:
  status         Show current migration status (default)
  upgrade        Run all pending migrations
  downgrade      Rollback last migration
  history        Show migration history
  validate       Validate database schema
  backup         Create database backup before migration

Options:
  --dry-run      Show what would be executed without running
  --revision     Specific revision to migrate to (for upgrade/downgrade)
  --help         Show this help message

Examples:
  # Check migration status
  $0 development status

  # Run all pending migrations
  $0 staging upgrade

  # Rollback last migration
  $0 staging downgrade

  # Upgrade to specific revision
  $0 production upgrade --revision abc123

  # Create backup and upgrade
  $0 production backup && $0 production upgrade

EOF
    exit 1
}

# Parse arguments
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --revision)
            REVISION="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# Restore positional parameters
set -- "${POSITIONAL_ARGS[@]}"

ENVIRONMENT="${1:-}"
ACTION="${2:-status}"

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required"
    usage
fi

if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    usage
fi

# Validate action
if [[ ! "$ACTION" =~ ^(status|upgrade|downgrade|history|validate|backup)$ ]]; then
    log_error "Invalid action: $ACTION"
    usage
fi

# Load environment-specific configuration
case "$ENVIRONMENT" in
    development)
        GCP_PROJECT="${GCP_PROJECT_DEV:-}"
        DB_INSTANCE="convergence-dev"
        DB_NAME="convergence_dev"
        ;;
    staging)
        GCP_PROJECT="${GCP_PROJECT_STAGING:-}"
        DB_INSTANCE="convergence-staging"
        DB_NAME="convergence_staging"
        ;;
    production)
        GCP_PROJECT="${GCP_PROJECT_PROD:-}"
        DB_INSTANCE="convergence-prod"
        DB_NAME="convergence_prod"
        ;;
esac

# Validate GCP project
if [[ -z "$GCP_PROJECT" ]]; then
    log_error "GCP_PROJECT not set for environment: $ENVIRONMENT"
    exit 1
fi

log_info "=========================================="
log_info "Database Migration"
log_info "=========================================="
log_info "Environment:    $ENVIRONMENT"
log_info "GCP Project:    $GCP_PROJECT"
log_info "Database:       $DB_NAME"
log_info "Action:         $ACTION"
log_info "=========================================="

# Set GCP project
gcloud config set project "$GCP_PROJECT" --quiet

# Function to run BigQuery query
run_bq_query() {
    local query="$1"
    local output_format="${2:-table}"

    if [[ "$DRY_RUN" == "false" ]]; then
        bq query \
            --project_id="$GCP_PROJECT" \
            --use_legacy_sql=false \
            --format="$output_format" \
            "$query"
    else
        log_info "[DRY RUN] Would execute query:"
        echo "$query"
    fi
}

# Function to create migration tracking table
create_migration_table() {
    log_info "Creating migration tracking table..."

    local query="
    CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT}.${DB_NAME}.schema_migrations\` (
        version STRING NOT NULL,
        description STRING,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
        applied_by STRING,
        execution_time_ms INT64,
        status STRING
    )
    OPTIONS(
        description='Tracks database schema migrations'
    );
    "

    run_bq_query "$query"
}

# Function to get current schema version
get_current_version() {
    local query="
    SELECT version, applied_at, status
    FROM \`${GCP_PROJECT}.${DB_NAME}.schema_migrations\`
    ORDER BY applied_at DESC
    LIMIT 1
    "

    run_bq_query "$query" "prettyjson"
}

# Function to get migration history
get_migration_history() {
    local query="
    SELECT
        version,
        description,
        applied_at,
        applied_by,
        execution_time_ms,
        status
    FROM \`${GCP_PROJECT}.${DB_NAME}.schema_migrations\`
    ORDER BY applied_at DESC
    LIMIT 20
    "

    run_bq_query "$query"
}

# Function to validate schema
validate_schema() {
    log_info "Validating database schema..."

    # List all tables
    log_info "Listing all tables in dataset: $DB_NAME"

    if [[ "$DRY_RUN" == "false" ]]; then
        bq ls --project_id="$GCP_PROJECT" "${DB_NAME}"
    else
        log_info "[DRY RUN] Would list tables in: $DB_NAME"
    fi

    # Check for required tables
    local required_tables=(
        "pipelines"
        "pipeline_runs"
        "pipeline_schedules"
        "schema_migrations"
    )

    for table in "${required_tables[@]}"; do
        log_info "Checking table: $table"

        if [[ "$DRY_RUN" == "false" ]]; then
            if bq show "${GCP_PROJECT}:${DB_NAME}.${table}" &>/dev/null; then
                log_success "Table $table exists"
            else
                log_error "Required table $table is missing!"
            fi
        else
            log_info "[DRY RUN] Would check table: $table"
        fi
    done
}

# Function to backup dataset
backup_dataset() {
    log_info "Creating dataset backup..."

    local backup_dataset="${DB_NAME}_backup_$(date +%Y%m%d_%H%M%S)"

    log_info "Backup dataset: $backup_dataset"

    if [[ "$DRY_RUN" == "false" ]]; then
        # Create backup dataset
        bq mk \
            --project_id="$GCP_PROJECT" \
            --dataset \
            --description="Backup of ${DB_NAME} created on $(date)" \
            "${backup_dataset}"

        # Copy all tables
        log_info "Copying tables to backup dataset..."

        tables=$(bq ls --project_id="$GCP_PROJECT" --format=csv "${DB_NAME}" | tail -n +2 | cut -d, -f1)

        for table in $tables; do
            log_info "Backing up table: $table"

            bq cp \
                --project_id="$GCP_PROJECT" \
                "${GCP_PROJECT}:${DB_NAME}.${table}" \
                "${GCP_PROJECT}:${backup_dataset}.${table}"
        done

        log_success "Backup created: $backup_dataset"
        echo "$backup_dataset" > /tmp/last_backup.txt
    else
        log_info "[DRY RUN] Would create backup: $backup_dataset"
    fi
}

# Function to apply migration
apply_migration() {
    local version="$1"
    local description="$2"
    local migration_sql="$3"

    log_info "Applying migration: $version - $description"

    if [[ "$DRY_RUN" == "false" ]]; then
        local start_time=$(date +%s%3N)

        # Run migration
        run_bq_query "$migration_sql" || {
            log_error "Migration failed!"

            # Record failure
            local fail_query="
            INSERT INTO \`${GCP_PROJECT}.${DB_NAME}.schema_migrations\`
            (version, description, applied_by, execution_time_ms, status)
            VALUES (
                '$version',
                '$description',
                '$(whoami)',
                0,
                'FAILED'
            )
            "
            run_bq_query "$fail_query"
            return 1
        }

        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))

        # Record success
        local success_query="
        INSERT INTO \`${GCP_PROJECT}.${DB_NAME}.schema_migrations\`
        (version, description, applied_by, execution_time_ms, status)
        VALUES (
            '$version',
            '$description',
            '$(whoami)',
            $execution_time,
            'SUCCESS'
        )
        "
        run_bq_query "$success_query"

        log_success "Migration applied successfully in ${execution_time}ms"
    else
        log_info "[DRY RUN] Would apply migration:"
        echo "$migration_sql"
    fi
}

# Execute action
case "$ACTION" in
    status)
        log_info "Getting migration status..."
        create_migration_table
        get_current_version
        ;;

    history)
        log_info "Getting migration history..."
        create_migration_table
        get_migration_history
        ;;

    validate)
        validate_schema
        ;;

    backup)
        backup_dataset
        ;;

    upgrade)
        if [[ "$ENVIRONMENT" == "production" ]] && [[ "$DRY_RUN" == "false" ]]; then
            log_warning "You are about to run migrations on PRODUCTION database!"
            read -p "Are you sure you want to continue? (yes/no): " confirm

            if [[ "$confirm" != "yes" ]]; then
                log_info "Migration cancelled"
                exit 0
            fi

            # Auto-backup for production
            log_info "Creating automatic backup before migration..."
            backup_dataset
        fi

        create_migration_table

        # Example: Add your migration SQL here
        # In practice, you would load these from migration files
        log_info "Running pending migrations..."

        # Migration 001: Example
        # apply_migration "001" "Add indexes" "CREATE INDEX ..."

        log_warning "No pending migrations found"
        log_info "To add migrations, edit this script or implement a migration file system"
        ;;

    downgrade)
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Downgrade is not recommended for production!"
            read -p "Are you absolutely sure? (yes/no): " confirm

            if [[ "$confirm" != "yes" ]]; then
                log_info "Downgrade cancelled"
                exit 0
            fi
        fi

        log_warning "Downgrade functionality not yet implemented"
        log_info "To implement: Add migration rollback SQL statements"
        ;;

    *)
        log_error "Unknown action: $ACTION"
        usage
        ;;
esac

log_success "=========================================="
log_success "Migration operation completed"
log_success "=========================================="
