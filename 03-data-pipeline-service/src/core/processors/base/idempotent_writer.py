"""
IdempotentWriterMixin - Base class for DELETE + INSERT pattern with lineage columns.

This mixin provides idempotent write operations to BigQuery using a composite key
for deduplication. It enables:
1. Safe pipeline re-runs (no duplicates on retry)
2. Multi-account support (data isolation per credential)
3. Full lineage traceability

Composite Key: (org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)

Usage:
    class MyProcessor(IdempotentWriterMixin):
        async def execute(self, step_config, context):
            data = await self.fetch_data()
            return await self.write_with_dedup(
                bq_client=self.bq_client,
                org_slug=context['org_slug'],
                dataset_type='prod',
                table_name='my_table',
                data=data,
                pipeline_id='my_pipeline',
                credential_id=context['credential_id'],
                run_date=context['run_date'],
                run_id=context['run_id']
            )
"""

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class IdempotentWriterMixin:
    """
    Mixin providing idempotent write operations using DELETE + INSERT pattern.

    All data tables must have these 5 REQUIRED lineage columns:
    - x_pipeline_id: Pipeline template name (e.g., genai_payg_openai)
    - x_credential_id: Credential ID for multi-account isolation
    - x_pipeline_run_date: Data date being processed (for idempotent re-runs)
    - x_run_id: Unique run UUID for traceability
    - x_ingested_at: Timestamp when data was written
    """

    async def write_with_dedup(
        self,
        bq_client: Any,
        org_slug: str,
        dataset_type: str,
        table_name: str,
        data: List[Dict[str, Any]],
        pipeline_id: str,
        credential_id: str,
        run_date: date,
        run_id: Optional[str] = None,
        additional_delete_conditions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Write data with idempotent DELETE + INSERT pattern.

        Steps:
        1. DELETE existing data for (org_slug, pipeline_id, credential_id, run_date)
        2. Add lineage columns to all rows
        3. INSERT new data

        Args:
            bq_client: BigQuery client instance
            org_slug: Organization identifier
            dataset_type: Dataset type (e.g., 'prod', 'staging')
            table_name: Target table name
            data: List of row dictionaries to insert
            pipeline_id: Pipeline template name (e.g., 'genai_payg_openai')
            credential_id: Credential ID for multi-account isolation
            run_date: Data date being processed
            run_id: Optional run UUID (auto-generated if not provided)
            additional_delete_conditions: Optional extra WHERE conditions for DELETE

        Returns:
            Dict with status, rows_deleted, rows_inserted
        """
        if not data:
            logger.info(
                f"No data to write for {table_name}",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "run_date": str(run_date)
                }
            )
            return {
                "status": "SUCCESS",
                "rows_deleted": 0,
                "rows_inserted": 0,
                "message": "No data to write"
            }

        # Generate run_id if not provided
        if run_id is None:
            run_id = str(uuid.uuid4())

        # Get dataset ID
        dataset_id = bq_client.get_org_dataset_id(org_slug, dataset_type)
        full_table_id = f"{bq_client.project_id}.{dataset_id}.{table_name}"

        # Step 1: DELETE existing data for composite key
        rows_deleted = await self._delete_existing_data(
            bq_client=bq_client,
            full_table_id=full_table_id,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            credential_id=credential_id,
            run_date=run_date,
            additional_conditions=additional_delete_conditions
        )

        # Step 2: Add lineage columns to all rows
        enriched_data = self._add_lineage_columns(
            data=data,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            credential_id=credential_id,
            run_date=run_date,
            run_id=run_id
        )

        # Step 3: INSERT new data
        bq_client.insert_rows(
            org_slug=org_slug,
            dataset_type=dataset_type,
            table_name=table_name,
            rows=enriched_data
        )

        logger.info(
            f"Idempotent write complete: {table_name}",
            extra={
                "org_slug": org_slug,
                "pipeline_id": pipeline_id,
                "credential_id": credential_id,
                "run_date": str(run_date),
                "run_id": run_id,
                "rows_deleted": rows_deleted,
                "rows_inserted": len(enriched_data)
            }
        )

        return {
            "status": "SUCCESS",
            "rows_deleted": rows_deleted,
            "rows_inserted": len(enriched_data),
            "run_id": run_id,
            "table": full_table_id
        }

    async def _delete_existing_data(
        self,
        bq_client: Any,
        full_table_id: str,
        org_slug: str,
        pipeline_id: str,
        credential_id: str,
        run_date: date,
        additional_conditions: Optional[str] = None
    ) -> int:
        """
        Delete existing data for the composite key.

        Composite Key: (org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)

        Args:
            bq_client: BigQuery client
            full_table_id: Full table ID (project.dataset.table)
            org_slug: Organization identifier
            pipeline_id: Pipeline template name
            credential_id: Credential ID
            run_date: Data date
            additional_conditions: Extra WHERE conditions

        Returns:
            Number of rows deleted
        """
        # Build DELETE query with composite key
        delete_query = f"""
        DELETE FROM `{full_table_id}`
        WHERE org_slug = '{org_slug}'
          AND x_pipeline_id = '{pipeline_id}'
          AND x_credential_id = '{credential_id}'
          AND x_pipeline_run_date = '{run_date.isoformat()}'
        """

        if additional_conditions:
            delete_query += f"\n  AND {additional_conditions}"

        logger.debug(
            f"Executing DELETE for idempotent write",
            extra={
                "table": full_table_id,
                "org_slug": org_slug,
                "pipeline_id": pipeline_id,
                "credential_id": credential_id,
                "run_date": str(run_date)
            }
        )

        try:
            # Execute DELETE query
            result = list(bq_client.query(delete_query))

            # BigQuery doesn't return deleted row count directly from DELETE
            # We log this as informational
            logger.info(
                f"DELETE executed for {full_table_id}",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "run_date": str(run_date)
                }
            )
            return 0  # Placeholder - BigQuery DELETE doesn't return count

        except Exception as e:
            # If table doesn't exist or no rows match, that's OK
            if "Not found" in str(e) or "does not exist" in str(e).lower():
                logger.info(
                    f"Table {full_table_id} not found, skipping DELETE",
                    extra={"org_slug": org_slug}
                )
                return 0
            raise

    def _add_lineage_columns(
        self,
        data: List[Dict[str, Any]],
        org_slug: str,
        pipeline_id: str,
        credential_id: str,
        run_date: date,
        run_id: str
    ) -> List[Dict[str, Any]]:
        """
        Add the 5 REQUIRED lineage columns to all rows.

        Columns added:
        - org_slug: Organization identifier (if not already present)
        - x_pipeline_id: Pipeline template name
        - x_credential_id: Credential ID for multi-account isolation
        - x_pipeline_run_date: Data date being processed
        - x_run_id: Unique run UUID
        - x_ingested_at: Current timestamp

        Args:
            data: List of row dictionaries
            org_slug: Organization identifier
            pipeline_id: Pipeline template name
            credential_id: Credential ID
            run_date: Data date
            run_id: Run UUID

        Returns:
            Enriched data with lineage columns
        """
        ingested_at = datetime.utcnow().isoformat()
        run_date_str = run_date.isoformat() if isinstance(run_date, date) else str(run_date)

        enriched_data = []
        for row in data:
            enriched_row = row.copy()

            # Ensure org_slug is set (don't override if already present)
            if "org_slug" not in enriched_row:
                enriched_row["org_slug"] = org_slug

            # Add lineage columns (always overwrite to ensure consistency)
            enriched_row["x_pipeline_id"] = pipeline_id
            enriched_row["x_credential_id"] = credential_id
            enriched_row["x_pipeline_run_date"] = run_date_str
            enriched_row["x_run_id"] = run_id
            enriched_row["x_ingested_at"] = ingested_at

            enriched_data.append(enriched_row)

        return enriched_data

    def build_pipeline_id(
        self,
        category: str,
        domain: str,
        provider: str,
        credential_alias: Optional[str] = None
    ) -> str:
        """
        Build standardized pipeline ID.

        Format: {category}_{domain}_{provider}
        With alias: {category}_{domain}_{provider}_{alias}

        Examples:
            - genai_payg_openai
            - genai_payg_openai_team_a
            - cloud_cost_gcp
            - cloud_cost_gcp_prod_billing

        Args:
            category: Pipeline category (genai, cloud, saas)
            domain: Pipeline domain (payg, cost, commitment)
            provider: Provider name (openai, gcp, aws)
            credential_alias: Optional credential alias for multi-account

        Returns:
            Standardized pipeline ID
        """
        base_id = f"{category}_{domain}_{provider}"

        if credential_alias and credential_alias != "default":
            return f"{base_id}_{credential_alias}"

        return base_id
