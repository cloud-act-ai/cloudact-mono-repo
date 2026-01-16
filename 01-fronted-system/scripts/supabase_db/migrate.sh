#!/bin/bash
# ============================================================================
# Supabase Migration Runner (API-based)
# ============================================================================
# Runs all pending SQL migrations using Supabase Management API.
# Tracks applied migrations in schema_migrations table.
#
# Usage:
#   ./migrate.sh                  # Run all pending migrations (local)
#   ./migrate.sh --stage          # Run migrations on STAGING
#   ./migrate.sh --prod           # Run migrations on PRODUCTION (with confirmation)
#   ./migrate.sh --status         # Show migration status (local)
#   ./migrate.sh --status --prod  # Show migration status (production)
#   ./migrate.sh --force 05       # Force re-run migration 05_*.sql
#   ./migrate.sh --dry-run        # Show what would be run without executing
#   ./migrate.sh --dry-run --prod # Dry run on production
#   ./migrate.sh --yes --prod     # Skip confirmation prompt
#
# Requirements:
#   - SUPABASE_ACCESS_TOKEN environment variable set
#   - Or logged in via: supabase login
#
# Environment Files:
#   Local:      .env.local
#   Stage:      .env.stage
#   Production: .env.prod
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$SCRIPT_DIR/../.."
ENV_FILE=""
ENVIRONMENT="local"
SKIP_CONFIRM="false"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project references for each environment
get_project_ref() {
    case "$ENVIRONMENT" in
        local) echo "kwroaccbrxppfiysqlzs" ;;
        stage) echo "kwroaccbrxppfiysqlzs" ;;
        prod)  echo "ovfxswhkkshouhsryzaf" ;;
    esac
}

# Get env file path for environment
get_env_file() {
    case "$1" in
        local) echo "$FRONTEND_DIR/.env.local" ;;
        stage) echo "$FRONTEND_DIR/.env.stage" ;;
        prod)  echo "$FRONTEND_DIR/.env.prod" ;;
    esac
}

# Get environment label
get_env_label() {
    case "$1" in
        local) echo "LOCAL (Development)" ;;
        stage) echo "STAGING" ;;
        prod)  echo "PRODUCTION" ;;
    esac
}

# Get environment color
get_env_color() {
    case "$1" in
        local) echo "$BLUE" ;;
        stage) echo "$CYAN" ;;
        prod)  echo "$MAGENTA" ;;
    esac
}

# Set environment (local, stage, or prod)
set_environment() {
    ENV_FILE=$(get_env_file "$ENVIRONMENT")
    local color=$(get_env_color "$ENVIRONMENT")
    local label=$(get_env_label "$ENVIRONMENT")

    echo ""
    if [ "$ENVIRONMENT" = "prod" ]; then
        echo -e "${MAGENTA}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${MAGENTA}║       🚨 PRODUCTION ENVIRONMENT 🚨               ║${NC}"
        echo -e "${MAGENTA}║  All changes are PERMANENT and affect LIVE data  ║${NC}"
        echo -e "${MAGENTA}╚══════════════════════════════════════════════════╝${NC}"
    elif [ "$ENVIRONMENT" = "stage" ]; then
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║           📦 STAGING ENVIRONMENT 📦              ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${BLUE}Environment: ${label}${NC}"
    fi

    # Verify env file exists
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: Environment file not found: $ENV_FILE${NC}"
        echo ""
        echo "Available environment files:"
        for env in local stage prod; do
            local file=$(get_env_file "$env")
            if [ -f "$file" ]; then
                echo -e "  ${GREEN}[EXISTS]${NC} $env -> $file"
            else
                echo -e "  ${RED}[MISSING]${NC} $env -> $file"
            fi
        done
        exit 1
    fi

    echo -e "Using: ${color}$ENV_FILE${NC}"
    echo -e "Project: ${color}$(get_project_ref)${NC}"
    echo ""
}

# Confirm dangerous action
confirm_action() {
    local confirm_text="$1"

    # Skip confirmation if --yes flag is set
    if [ "$SKIP_CONFIRM" = "true" ]; then
        echo -e "${YELLOW}Skipping confirmation (--yes flag)${NC}"
        return
    fi

    if [ "$ENVIRONMENT" = "prod" ]; then
        echo ""
        echo -e "${RED}⚠️  WARNING: You are about to modify PRODUCTION database!${NC}"
        echo -e "${YELLOW}Project: $(get_project_ref)${NC}"
        echo ""
        read -p "Type '$confirm_text' to confirm: " confirmation
        if [ "$confirmation" != "$confirm_text" ]; then
            echo -e "${RED}Aborted. No changes made.${NC}"
            exit 1
        fi
        echo ""
    elif [ "$ENVIRONMENT" = "stage" ]; then
        echo -e "${YELLOW}Running on STAGING database...${NC}"
        read -p "Continue? (y/N): " confirmation
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            echo -e "${RED}Aborted.${NC}"
            exit 1
        fi
        echo ""
    fi
}

# Load environment variables
load_env() {
    if [ -f "$ENV_FILE" ]; then
        while IFS='=' read -r key value; do
            [[ "$key" =~ ^#.*$ ]] && continue
            [[ -z "$key" ]] && continue
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            export "$key=$value"
        done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" 2>/dev/null || true)
    fi
}

# Get access token (from env var or supabase CLI)
get_access_token() {
    if [ -n "$SUPABASE_ACCESS_TOKEN" ]; then
        echo "$SUPABASE_ACCESS_TOKEN"
        return
    fi

    # Try to get from supabase CLI config
    local token_file="$HOME/.supabase/access_token"
    if [ -f "$token_file" ]; then
        cat "$token_file"
        return
    fi

    echo ""
}

# Check authentication
check_auth() {
    echo -n "Checking Supabase authentication... "

    local token=$(get_access_token)
    if [ -z "$token" ]; then
        echo -e "${RED}NOT AUTHENTICATED${NC}"
        echo ""
        echo "Please set SUPABASE_ACCESS_TOKEN or login:"
        echo "  export SUPABASE_ACCESS_TOKEN=your-token"
        echo "  # or"
        echo "  supabase login"
        echo ""
        echo "Get a token from: https://supabase.com/dashboard/account/tokens"
        exit 1
    fi
    echo -e "${GREEN}OK${NC}"
}

# Run SQL using Supabase Management API
run_sql() {
    local sql="$1"
    local project_ref=$(get_project_ref)
    local token=$(get_access_token)

    # Use Management API to execute SQL
    local response=$(curl -s -X POST \
        "https://api.supabase.com/v1/projects/${project_ref}/database/query" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"query\": $(echo "$sql" | jq -Rs .)}" 2>/dev/null)

    # Check for errors
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        echo "$response" | jq -r '.error' >&2
        return 1
    fi

    # Return the result
    echo "$response" | jq -r '.[0][]? // empty' 2>/dev/null || echo "$response"
}

# Run SQL file
run_sql_file() {
    local file="$1"
    local sql=$(cat "$file")
    run_sql "$sql"
}

# Ensure migration tracking table exists
ensure_tracking_table() {
    run_sql "CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        checksum VARCHAR(64),
        execution_time_ms INTEGER,
        applied_by VARCHAR(255) DEFAULT current_user
    );" 2>/dev/null || true
}

# Escape single quotes for SQL safety
escape_sql() {
    local value="$1"
    echo "${value//\'/\'\'}"
}

# Check if migration is applied
is_applied() {
    local filename="$1"
    local filename_escaped=$(escape_sql "$filename")
    local result=$(run_sql "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename_escaped';" 2>/dev/null | tr -d ' \n"')
    [ "$result" = "1" ]
}

# Calculate file checksum
get_checksum() {
    local file="$1"
    if command -v sha256sum &> /dev/null; then
        sha256sum "$file" | cut -d' ' -f1
    else
        shasum -a 256 "$file" | cut -d' ' -f1
    fi
}

# Record migration as applied
record_migration() {
    local filename="$1"
    local checksum="$2"
    local duration="$3"
    local filename_escaped=$(escape_sql "$filename")
    local checksum_escaped=$(escape_sql "$checksum")
    run_sql "INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
             VALUES ('$filename_escaped', '$checksum_escaped', $duration)
             ON CONFLICT (filename) DO UPDATE SET
                applied_at = NOW(),
                checksum = '$checksum_escaped',
                execution_time_ms = $duration;" 2>/dev/null
}

# Show migration status
show_status() {
    local label=$(get_env_label "$ENVIRONMENT")
    echo -e "${BLUE}=== Migration Status (${label}) ===${NC}"
    echo ""

    check_auth
    ensure_tracking_table

    # Get all numbered SQL files
    local files=($(ls -1 "$MIGRATIONS_DIR"/[0-9][0-9]_*.sql 2>/dev/null | sort))

    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${YELLOW}No migration files found${NC}"
        return
    fi

    local applied_count=0
    local pending_count=0

    for file in "${files[@]}"; do
        local filename=$(basename "$file")
        if is_applied "$filename"; then
            echo -e "${GREEN}[APPLIED]${NC} $filename"
            applied_count=$((applied_count + 1))
        else
            echo -e "${YELLOW}[PENDING]${NC} $filename"
            pending_count=$((pending_count + 1))
        fi
    done

    echo ""
    echo -e "Total: ${GREEN}$applied_count applied${NC}, ${YELLOW}$pending_count pending${NC}"
    echo ""
}

# Run pending migrations
run_migrations() {
    local dry_run="$1"
    local force_file="$2"
    local label=$(get_env_label "$ENVIRONMENT")

    echo -e "${BLUE}=== Running Migrations (${label}) ===${NC}"
    echo ""

    check_auth

    # Confirm if not dry-run
    if [ "$dry_run" != "true" ]; then
        confirm_action "yes-$ENVIRONMENT"
    fi

    ensure_tracking_table

    # Get all numbered SQL files (sorted)
    local files=($(ls -1 "$MIGRATIONS_DIR"/[0-9][0-9]_*.sql 2>/dev/null | sort))

    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${YELLOW}No migration files found${NC}"
        return
    fi

    local pending=0
    local applied=0
    local failed=0

    for file in "${files[@]}"; do
        local filename=$(basename "$file")

        # Handle force mode
        if [ -n "$force_file" ]; then
            if [[ ! "$filename" =~ ^${force_file}_ ]]; then
                continue
            fi
        elif is_applied "$filename"; then
            continue
        fi

        pending=$((pending + 1))

        if [ "$dry_run" = "true" ]; then
            echo -e "${YELLOW}[DRY-RUN]${NC} Would apply: $filename"
            continue
        fi

        echo -e "${BLUE}[APPLYING]${NC} $filename..."

        local start_time=$(date +%s)

        if output=$(run_sql_file "$file" 2>&1); then
            local end_time=$(date +%s)
            local duration=$(( (end_time - start_time) * 1000 ))

            local checksum=$(get_checksum "$file")
            record_migration "$filename" "$checksum" "$duration"

            echo -e "${GREEN}[SUCCESS]${NC} $filename (${duration}ms)"
            applied=$((applied + 1))
        else
            echo -e "${RED}[FAILED]${NC} $filename"
            echo -e "${RED}$output${NC}"
            failed=$((failed + 1))
            echo -e "${RED}Migration failed. Stopping.${NC}"
            exit 1
        fi
    done

    echo ""
    if [ "$dry_run" = "true" ]; then
        echo -e "${YELLOW}Dry run complete. $pending migration(s) would be applied.${NC}"
    elif [ $applied -eq 0 ] && [ $pending -eq 0 ]; then
        echo -e "${GREEN}All migrations are up to date.${NC}"
    else
        echo -e "${GREEN}Applied $applied migration(s).${NC}"
    fi
}

# Show help
show_help() {
    cat << 'EOF'
Supabase Migration Runner (API-based)

Usage: migrate.sh [OPTIONS]

Environment Options:
  (default)    Use LOCAL environment (.env.local)
  --stage      Use STAGING environment (.env.stage)
  --prod       Use PRODUCTION environment (.env.prod) - requires confirmation

Action Options:
  (default)    Run all pending migrations
  --status     Show migration status (applied vs pending)
  --dry-run    Show what would be run without executing
  --force NN   Force re-run migration starting with NN (e.g., --force 30)
  --yes, -y    Skip confirmation prompt
  --help       Show this help

Examples:
  ./migrate.sh                      # Run pending migrations on LOCAL
  ./migrate.sh --stage              # Run pending migrations on STAGING
  ./migrate.sh --prod               # Run pending migrations on PRODUCTION
  ./migrate.sh --status             # Check local migration status
  ./migrate.sh --status --prod      # Check production migration status
  ./migrate.sh --dry-run --prod     # Dry run on production
  ./migrate.sh --force 30 --prod    # Force re-run migration 30_*.sql on production
  ./migrate.sh --yes --prod         # Run production migrations without confirmation

Prerequisites:
  Set SUPABASE_ACCESS_TOKEN environment variable:
    export SUPABASE_ACCESS_TOKEN=your-token

  Get a token from: https://supabase.com/dashboard/account/tokens

Project References:
  Local/Stage: kwroaccbrxppfiysqlzs
  Production:  ovfxswhkkshouhsryzaf

Notes:
  - Production migrations require typing 'yes-prod' to confirm (unless --yes)
  - Migrations are tracked in schema_migrations table
  - Failed migrations stop execution immediately
EOF
}

# Main
main() {
    # Parse flags
    local args=()
    for arg in "$@"; do
        case "$arg" in
            --prod)
                ENVIRONMENT="prod"
                ;;
            --stage)
                ENVIRONMENT="stage"
                ;;
            --local)
                ENVIRONMENT="local"
                ;;
            --yes|-y)
                SKIP_CONFIRM="true"
                ;;
            *)
                args+=("$arg")
                ;;
        esac
    done

    # Show help first (before loading env)
    if [[ " ${args[*]} " =~ " --help " ]] || [[ " ${args[*]} " =~ " -h " ]]; then
        show_help
        exit 0
    fi

    # Check for jq
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq not installed${NC}"
        echo "Install with: brew install jq"
        exit 1
    fi

    # Set up environment
    set_environment
    load_env

    case "${args[0]:-}" in
        --status)
            show_status
            ;;
        --dry-run)
            run_migrations "true" ""
            ;;
        --force)
            if [ -z "${args[1]:-}" ]; then
                echo -e "${RED}Error: --force requires a migration prefix (e.g., --force 30)${NC}"
                exit 1
            fi
            run_migrations "false" "${args[1]}"
            ;;
        "")
            run_migrations "false" ""
            ;;
        *)
            echo -e "${RED}Unknown option: ${args[0]}${NC}"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
}

main "$@"
