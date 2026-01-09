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
    Run org dataset sync (create missing tables).
    Idempotent - safe to call multiple times (uses IF NOT EXISTS).

    Returns:
        int: Number of tables synced
    """
    try:
        from src.core.processors.setup.organizations.onboarding import OrgOnboardingProcessor

        processor = OrgOnboardingProcessor()

        # Run sync with force_recreate=False (idempotent)
        result = await processor.execute(
            step_config={},
            context={
                "org_slug": org_slug,
                "force_recreate_dataset": False,
                "force_recreate_tables": False,
                "skip_profile_creation": True,  # Profile already exists
                "sync_mode": True  # Only sync missing tables
            }
        )

        tables_created = len(result.get('tables_created', []))
        return tables_created

    except Exception as e:
        logger.error(f"Sync execution failed for {org_slug}: {e}", exc_info=True)
        raise
