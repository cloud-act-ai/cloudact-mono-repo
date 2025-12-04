#!/bin/bash
# ============================================================================
# Supabase Migration Runner
# ============================================================================
# Runs all pending SQL migrations in order.
# Tracks applied migrations in schema_migrations table.
#
# Usage:
#   ./migrate.sh              # Run all pending migrations
#   ./migrate.sh --status     # Show migration status
#   ./migrate.sh --force 05   # Force re-run migration 05_*.sql
#   ./migrate.sh --dry-run    # Show what would be run without executing
#
# Requirements:
#   - psql installed: brew install libpq && brew link --force libpq
#   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR"
ENV_FILE="$SCRIPT_DIR/../../.env.local"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
load_env() {
    if [ -f "$ENV_FILE" ]; then
        # Read key=value pairs, handling special characters
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            [[ "$key" =~ ^#.*$ ]] && continue
            [[ -z "$key" ]] && continue
            # Remove quotes from value
            value="${value%\"}"
            value="${value#\"}"
            # Export the variable
            export "$key=$value"
        done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")
    fi
}

# Extract project ref from URL
get_project_ref() {
    echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|'
}

# Run SQL command using psql with env vars
run_sql() {
    local sql="$1"
    local project_ref=$(get_project_ref)

    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
        echo -e "${RED}Error: NEXT_PUBLIC_SUPABASE_URL not set${NC}" >&2
        exit 1
    fi

    if [ -z "$SUPABASE_DB_PASSWORD" ]; then
        echo -e "${RED}Error: SUPABASE_DB_PASSWORD not set${NC}" >&2
        exit 1
    fi

    # Use direct connection: db.<project_ref>.supabase.co:5432
    PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
        -h "db.${project_ref}.supabase.co" \
        -p 5432 \
        -U "postgres" \
        -d "postgres" \
        -t -q -c "$sql" 2>/dev/null
}

# Run SQL file
run_sql_file() {
    local file="$1"
    local project_ref=$(get_project_ref)

    PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
        -h "db.${project_ref}.supabase.co" \
        -p 5432 \
        -U "postgres" \
        -d "postgres" \
        -q -f "$file" 2>&1
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

# Check if migration is applied
is_applied() {
    local filename="$1"
    local result=$(run_sql "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename';" 2>/dev/null | tr -d ' \n')
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
    run_sql "INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
             VALUES ('$filename', '$checksum', $duration)
             ON CONFLICT (filename) DO UPDATE SET
                applied_at = NOW(),
                checksum = '$checksum',
                execution_time_ms = $duration;" 2>/dev/null
}

# Show migration status
show_status() {
    echo -e "${BLUE}=== Migration Status ===${NC}"
    echo ""

    ensure_tracking_table

    # Get all numbered SQL files
    local files=($(ls -1 "$MIGRATIONS_DIR"/[0-9][0-9]_*.sql 2>/dev/null | sort))

    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${YELLOW}No migration files found${NC}"
        return
    fi

    for file in "${files[@]}"; do
        local filename=$(basename "$file")
        if is_applied "$filename"; then
            echo -e "${GREEN}[APPLIED]${NC} $filename"
        else
            echo -e "${YELLOW}[PENDING]${NC} $filename"
        fi
    done
    echo ""
}

# Run pending migrations
run_migrations() {
    local dry_run="$1"
    local force_file="$2"

    echo -e "${BLUE}=== Running Migrations ===${NC}"
    echo ""

    ensure_tracking_table

    # Get all numbered SQL files (sorted)
    local files=($(ls -1 "$MIGRATIONS_DIR"/[0-9][0-9]_*.sql 2>/dev/null | sort))

    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${YELLOW}No migration files found${NC}"
        return
    fi

    local pending=0
    local applied=0

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

# Main
main() {
    load_env

    # Check for psql
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}Error: psql not installed${NC}"
        echo "Install with: brew install libpq && brew link --force libpq"
        exit 1
    fi

    case "${1:-}" in
        --status)
            show_status
            ;;
        --dry-run)
            run_migrations "true" ""
            ;;
        --force)
            if [ -z "${2:-}" ]; then
                echo -e "${RED}Error: --force requires a migration prefix (e.g., --force 05)${NC}"
                exit 1
            fi
            run_migrations "false" "$2"
            ;;
        --help|-h)
            echo "Supabase Migration Runner"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (none)       Run all pending migrations"
            echo "  --status     Show migration status"
            echo "  --dry-run    Show what would be run without executing"
            echo "  --force NN   Force re-run migration starting with NN"
            echo "  --help       Show this help"
            echo ""
            echo "Required in .env.local:"
            echo "  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co"
            echo "  SUPABASE_DB_PASSWORD=your-database-password"
            ;;
        *)
            run_migrations "false" ""
            ;;
    esac
}

main "$@"
