#!/usr/bin/env python3
"""
Supabase Migration Job
======================
Runs pending SQL migrations using Supabase Management API.

Usage:
    python jobs/supabase_migrate.py

Environment:
    ENVIRONMENT: staging or production
    SUPABASE_ACCESS_TOKEN: Supabase personal access token
"""

import asyncio
import hashlib
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx


# Project mapping
PROJECT_REFS = {
    "staging": "kwroaccbrxppfiysqlzs",
    "production": "ovfxswhkkshouhsryzaf",
}


async def run_sql(project_ref: str, token: str, sql: str) -> dict:
    """Execute SQL using Supabase Management API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"query": sql},
        )

        if response.status_code not in (200, 201):
            raise Exception(f"API error {response.status_code}: {response.text}")

        result = response.json()

        # Check for SQL errors in response
        if isinstance(result, dict) and "error" in result:
            raise Exception(f"SQL error: {result['error']}")

        return result


async def ensure_tracking_table(project_ref: str, token: str):
    """Create migration tracking table if not exists."""
    sql = """
    CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        checksum VARCHAR(64),
        execution_time_ms INTEGER,
        applied_by VARCHAR(255) DEFAULT 'cloud_run_job'
    );
    """
    await run_sql(project_ref, token, sql)


async def get_applied_migrations(project_ref: str, token: str) -> set:
    """Get set of already applied migration filenames."""
    sql = "SELECT filename FROM schema_migrations ORDER BY filename;"
    result = await run_sql(project_ref, token, sql)

    applied = set()
    if isinstance(result, list):
        for row in result:
            if isinstance(row, dict) and "filename" in row:
                applied.add(row["filename"])

    return applied


async def record_migration(
    project_ref: str,
    token: str,
    filename: str,
    checksum: str,
    execution_time_ms: int
):
    """Record a migration as applied."""
    sql = f"""
    INSERT INTO schema_migrations (filename, checksum, execution_time_ms, applied_by)
    VALUES ('{filename}', '{checksum}', {execution_time_ms}, 'cloud_run_job')
    ON CONFLICT (filename) DO UPDATE SET
        applied_at = NOW(),
        checksum = EXCLUDED.checksum,
        execution_time_ms = EXCLUDED.execution_time_ms;
    """
    await run_sql(project_ref, token, sql)


def get_migration_files(migrations_dir: Path) -> list:
    """Get sorted list of migration SQL files."""
    files = []
    for f in migrations_dir.glob("[0-9][0-9]_*.sql"):
        files.append(f)
    return sorted(files, key=lambda x: x.name)


def compute_checksum(content: str) -> str:
    """Compute SHA256 checksum of migration content."""
    return hashlib.sha256(content.encode()).hexdigest()[:16]


async def main():
    print("=" * 60)
    print("CloudAct Supabase Migration Job")
    print("=" * 60)

    # Get configuration
    environment = os.environ.get("ENVIRONMENT", "staging")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")

    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN environment variable required")
        sys.exit(1)

    project_ref = PROJECT_REFS.get(environment)
    if not project_ref:
        print(f"ERROR: Invalid environment: {environment}")
        print(f"  Valid environments: {', '.join(PROJECT_REFS.keys())}")
        sys.exit(1)

    print(f"Environment: {environment}")
    print(f"Project:     {project_ref}")
    print(f"Timestamp:   {datetime.now(timezone.utc).isoformat()}")
    print()

    # Find migrations directory
    # In Docker: /app/migrations/supabase_db/
    migrations_dir = Path("/app/migrations/supabase_db")
    if not migrations_dir.exists():
        # Fallback for local testing
        migrations_dir = Path(__file__).parent.parent.parent / "01-fronted-system/scripts/supabase_db"

    if not migrations_dir.exists():
        print(f"ERROR: Migrations directory not found: {migrations_dir}")
        sys.exit(1)

    print(f"Migrations:  {migrations_dir}")
    print()

    try:
        # Ensure tracking table exists
        print("Ensuring migration tracking table...")
        await ensure_tracking_table(project_ref, token)

        # Get applied migrations
        applied = await get_applied_migrations(project_ref, token)
        print(f"Already applied: {len(applied)} migrations")
        print()

        # Get all migration files
        migration_files = get_migration_files(migrations_dir)
        print(f"Total migration files: {len(migration_files)}")
        print()

        # Find pending migrations
        pending = []
        for f in migration_files:
            if f.name not in applied:
                pending.append(f)

        if not pending:
            print("✓ No pending migrations")
            print("=" * 60)
            return

        print(f"Pending migrations: {len(pending)}")
        for f in pending:
            print(f"  - {f.name}")
        print()

        # Run pending migrations
        success = 0
        failed = 0

        for migration_file in pending:
            filename = migration_file.name
            print(f"Running: {filename}...")

            try:
                # Read migration content
                content = migration_file.read_text()
                checksum = compute_checksum(content)

                # Execute migration
                start_time = time.time()
                await run_sql(project_ref, token, content)
                execution_time_ms = int((time.time() - start_time) * 1000)

                # Record as applied
                await record_migration(
                    project_ref, token, filename, checksum, execution_time_ms
                )

                print(f"  ✓ Applied in {execution_time_ms}ms")
                success += 1

            except Exception as e:
                print(f"  ✗ Failed: {e}")
                failed += 1
                # Continue with other migrations or stop?
                # For safety, stop on first failure
                print()
                print(f"✗ Migration failed, stopping")
                sys.exit(1)

        print()
        print("=" * 60)
        print(f"✓ Migration complete")
        print(f"  Applied: {success}")
        print(f"  Failed:  {failed}")
        print("=" * 60)

        if failed > 0:
            sys.exit(1)

    except Exception as e:
        print(f"✗ Migration job failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
