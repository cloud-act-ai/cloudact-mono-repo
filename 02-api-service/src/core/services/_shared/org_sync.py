"""
Org Dataset Auto-Sync Service

Background task that syncs organization-specific datasets on startup.
Idempotent and safe for concurrent Cloud Run instances.

Pattern: Mirrors bootstrap and Supabase migrations - let BigQuery handle atomicity
"""
import asyncio
import random
import logging
from typing import Dict
from pathlib import Path

from src.app.config import get_settings
from src.core.engine.bq_client import get_bigquery_client

logger = logging.getLogger(__name__)
settings = get_settings()


async def sync_all_org_datasets_background():
    """
    Background task to sync all org datasets.
    Safe for concurrent instances - uses BigQuery IF NOT EXISTS.

    Called from main.py lifespan on startup.
    Non-blocking - runs in background via asyncio.create_task()
    """
    try:
        # Random jitter (0-60s) to spread load across instances
        jitter = random.uniform(0, 60)
        logger.info(f"Org sync: Waiting {jitter:.1f}s before starting (load spreading)")
        await asyncio.sleep(jitter)

        # Get all active orgs
        bq_client = get_bigquery_client()
        query = """
        SELECT org_slug
        FROM `{project}.organizations.org_profiles`
        WHERE status = 'ACTIVE'
        ORDER BY created_at ASC
        """.format(project=settings.gcp_project_id)

        job = bq_client.client.query(query)
        orgs = [row['org_slug'] for row in job.result()]

        if not orgs:
            logger.info("Org sync: No active orgs found - skipping")
            return

        logger.info(f"Org sync: Found {len(orgs)} active orgs")

        # Sync each org (with rate limiting)
        synced_count = 0
        skipped_count = 0
        failed_count = 0

        for i, org_slug in enumerate(orgs, 1):
            try:
                result = await sync_one_org_dataset(org_slug)

                if result['status'] == 'SYNCED':
                    synced_count += 1
                elif result['status'] == 'SKIPPED':
                    skipped_count += 1

                # Progress log every 10 orgs
                if i % 10 == 0:
                    logger.info(
                        f"Org sync: Progress {i}/{len(orgs)} "
                        f"({synced_count} synced, {skipped_count} skipped)"
                    )

                # Rate limit: 10 syncs/second
                await asyncio.sleep(0.1)

            except Exception as e:
                failed_count += 1
                logger.error(f"Org sync failed for {org_slug}: {e}")
                continue

        logger.info(
            f"✓ Org sync completed: {len(orgs)} orgs checked, "
            f"{synced_count} synced, {skipped_count} skipped, {failed_count} failed"
        )

    except Exception as e:
        logger.error(f"Org sync background task failed: {e}", exc_info=True)


async def sync_one_org_dataset(org_slug: str) -> Dict:
    """
    Sync a single org dataset (idempotent).
    Uses BigQuery IF NOT EXISTS - safe for concurrent calls.

    Args:
        org_slug: Organization slug to sync

    Returns:
        dict: {"status": "SYNCED" | "SKIPPED", "tables_synced": int}
    """
    try:
        # Check current status (lightweight check)
        status = await check_org_status_lightweight(org_slug)

        if status['needs_sync']:
            # Run sync (idempotent)
            tables_synced = await run_org_sync(org_slug)
            logger.info(f"Org sync: {org_slug} synced ({tables_synced} tables)")
            return {"status": "SYNCED", "tables_synced": tables_synced}
        else:
            return {"status": "SKIPPED", "tables_synced": 0}

    except Exception as e:
        logger.error(f"Failed to sync org {org_slug}: {e}", exc_info=True)
        raise


async def check_org_status_lightweight(org_slug: str) -> Dict:
    """
    Lightweight status check - only checks if dataset and expected tables exist.
    Faster than full schema diff (no column comparison).

    Returns:
        dict: {"needs_sync": bool, "reason": str}
    """
    try:
        from google.cloud import bigquery

        bq_client = get_bigquery_client()

        # Check if org profile exists
        check_profile_query = f"""
        SELECT org_slug
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug AND status = 'ACTIVE'
        LIMIT 1
        """

        profile_result = list(bq_client.client.query(
            check_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not profile_result:
            return {"needs_sync": False, "reason": "org_not_found"}

        # Check if dataset exists
        dataset_id = settings.get_org_dataset_name(org_slug)
        full_dataset_id = f"{settings.gcp_project_id}.{dataset_id}"

        try:
            bq_client.client.get_dataset(full_dataset_id)
        except Exception:
            return {"needs_sync": True, "reason": "dataset_missing"}

        # Get expected tables from config
        schemas_dir = Path(__file__).parent.parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        expected_tables = set()
        if schemas_dir.exists():
            for schema_file in schemas_dir.glob("*.json"):
                expected_tables.add(schema_file.stem)

        # Get existing tables
        existing_tables = {table.table_id for table in bq_client.client.list_tables(full_dataset_id)}

        tables_missing = expected_tables - existing_tables

        if tables_missing:
            return {"needs_sync": True, "reason": f"{len(tables_missing)}_tables_missing"}

        return {"needs_sync": False, "reason": "synced"}

    except Exception as e:
        logger.error(f"Status check failed for {org_slug}: {e}", exc_info=True)
        return {"needs_sync": False, "reason": "check_failed"}


async def run_org_sync(org_slug: str) -> int:
    """
    Run org dataset sync (create missing tables AND add missing columns).
    Idempotent - safe to call multiple times (uses IF NOT EXISTS).

    Returns:
        int: Number of items synced (tables + columns)
    """
    try:
        import json
        from google.cloud import bigquery
        from pathlib import Path

        bq_client = get_bigquery_client()
        dataset_id = settings.get_org_dataset_name(org_slug)
        full_dataset_id = f"{settings.gcp_project_id}.{dataset_id}"

        tables_created = 0
        columns_added = 0

        # Ensure dataset exists
        try:
            bq_client.client.get_dataset(full_dataset_id)
        except Exception:
            # Create dataset (idempotent)
            dataset = bigquery.Dataset(full_dataset_id)
            dataset.location = settings.bigquery_location
            dataset.description = f"Dataset for organization {org_slug}"
            bq_client.client.create_dataset(dataset)
            logger.info(f"Org sync: Created dataset {full_dataset_id}")

        # Get schema files
        schemas_dir = Path(__file__).parent.parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        if not schemas_dir.exists():
            return 0

        # Get existing tables
        existing_tables = {table.table_id for table in bq_client.client.list_tables(full_dataset_id)}

        # Process each schema file
        for schema_file in schemas_dir.glob("*.json"):
            table_name = schema_file.stem

            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            # Skip metadata files (schema_versions.json, etc.) that aren't field arrays
            if not isinstance(schema_json, list):
                continue

            schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]
            table_id = f"{full_dataset_id}.{table_name}"

            if table_name not in existing_tables:
                # Create missing table (idempotent with IF NOT EXISTS)
                try:
                    table = bigquery.Table(table_id, schema=schema)
                    table.description = f"Table: {table_name}"
                    bq_client.client.create_table(table)
                    tables_created += 1
                except Exception as e:
                    # Ignore if table already exists (race condition)
                    if "already exists" not in str(e).lower():
                        logger.warning(f"Org sync: Failed to create {table_name}: {e}")
            else:
                # Add missing columns (idempotent with IF NOT EXISTS)
                try:
                    existing_table = bq_client.client.get_table(table_id)
                    existing_columns = {field.name for field in existing_table.schema}
                    expected_columns = {field['name'] for field in schema_json}

                    missing_columns = expected_columns - existing_columns

                    for col_name in missing_columns:
                        col_def = next((f for f in schema_json if f['name'] == col_name), None)
                        if col_def:
                            col_type = col_def['type']

                            alter_sql = f"""
                            ALTER TABLE `{table_id}`
                            ADD COLUMN IF NOT EXISTS {col_name} {col_type}
                            """

                            try:
                                bq_client.client.query(alter_sql).result()
                                columns_added += 1
                            except Exception as col_error:
                                # Ignore if column already exists (race condition)
                                if "already exists" not in str(col_error).lower():
                                    logger.warning(f"Org sync: Failed to add column {col_name} to {table_name}: {col_error}")
                except Exception as e:
                    logger.warning(f"Org sync: Failed to check schema for {table_name}: {e}")

        return tables_created + columns_added

    except Exception as e:
        logger.error(f"Sync execution failed for {org_slug}: {e}", exc_info=True)
        raise
