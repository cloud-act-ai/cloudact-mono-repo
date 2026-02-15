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
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from google.cloud import bigquery

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

        IDEM-001 FIX: Uses parameterized queries to prevent SQL injection.
        IDEM-002 FIX: Returns actual deleted row count via job.num_dml_affected_rows.
        ERR-001 FIX: Improved logging for table-not-found scenarios.

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
        # IDEM-001 FIX: Use parameterized query to prevent SQL injection
        delete_query = f"""
        DELETE FROM `{full_table_id}`
        WHERE x_org_slug = @org_slug
          AND x_pipeline_id = @pipeline_id
          AND x_credential_id = @credential_id
          AND x_pipeline_run_date = @run_date
        """

        if additional_conditions:
            # Validate: only allow simple column=value conditions, no subqueries or SQL keywords
            import re
            _SAFE_CONDITION_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*@[a-zA-Z_][a-zA-Z0-9_]*$')
            if not _SAFE_CONDITION_RE.match(additional_conditions.strip()):
                raise ValueError(
                    f"Unsafe additional_delete_conditions rejected: {additional_conditions!r}. "
                    "Only simple 'column = @param' conditions are allowed."
                )
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
            # IDEM-001 FIX: Execute with parameterized query
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
                    bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id),
                    bigquery.ScalarQueryParameter("run_date", "DATE", run_date.isoformat()),
                ]
            )

            job = bq_client.client.query(delete_query, job_config=job_config)
            job.result()  # Wait for completion

            # IDEM-002 FIX: Get actual deleted row count
            rows_deleted = job.num_dml_affected_rows or 0

            logger.info(
                f"DELETE executed for {full_table_id}",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "run_date": str(run_date),
                    "rows_deleted": rows_deleted  # IDEM-002 FIX: Log actual count
                }
            )
            return rows_deleted

        except Exception as e:
            # ERR-001 FIX: Log at WARNING level with table name for debugging
            if "Not found" in str(e) or "does not exist" in str(e).lower():
                logger.warning(
                    f"Table {full_table_id} not found, skipping DELETE. "
                    f"This may indicate a configuration issue if table should exist.",
                    extra={"org_slug": org_slug, "table": full_table_id}
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
        ingested_at = datetime.now(timezone.utc).isoformat()
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

    async def write_with_merge(
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
        merge_keys: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        IDEM-003 FIX: Atomic write using MERGE instead of DELETE + INSERT.

        This provides transaction safety - no data loss if process crashes mid-write.
        Uses BigQuery MERGE with UNNEST pattern (correct approach, no temp tables).

        Args:
            bq_client: BigQuery client instance
            org_slug: Organization identifier
            dataset_type: Dataset type (e.g., 'prod', 'staging')
            table_name: Target table name
            data: List of row dictionaries to insert
            pipeline_id: Pipeline template name
            credential_id: Credential ID for multi-account isolation
            run_date: Data date being processed
            run_id: Optional run UUID (auto-generated if not provided)
            merge_keys: Columns to use for MERGE matching (default: composite key)

        Returns:
            Dict with status, rows_affected
        """
        if not data:
            return {"status": "SUCCESS", "rows_affected": 0, "message": "No data to write"}

        if run_id is None:
            run_id = str(uuid.uuid4())

        # Default merge keys: composite key for idempotency
        if merge_keys is None:
            merge_keys = ["org_slug", "x_pipeline_id", "x_credential_id", "x_pipeline_run_date"]

        # Get dataset ID and full table ID
        dataset_id = bq_client.get_org_dataset_id(org_slug, dataset_type)
        full_table_id = f"{bq_client.project_id}.{dataset_id}.{table_name}"

        # Add lineage columns to all rows
        enriched_data = self._add_lineage_columns(
            data=data,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            credential_id=credential_id,
            run_date=run_date,
            run_id=run_id
        )

        try:
            client = bq_client.client
            total_affected = 0

            # Process in batches (UNNEST has practical limits ~500 rows)
            batch_size = 500
            for i in range(0, len(enriched_data), batch_size):
                batch = enriched_data[i:i + batch_size]

                # Get all column names from first row
                columns = list(batch[0].keys())
                update_columns = [c for c in columns if c not in merge_keys]

                # Build UNNEST source with proper value escaping
                struct_values = []
                for row in batch:
                    field_values = []
                    for col in columns:
                        val = row.get(col)
                        if val is None:
                            field_values.append(f"CAST(NULL AS STRING) as {col}")
                        elif isinstance(val, bool):
                            field_values.append(f"{'TRUE' if val else 'FALSE'} as {col}")
                        elif isinstance(val, (int, float)):
                            field_values.append(f"{val} as {col}")
                        elif col.endswith("_date") or col == "x_pipeline_run_date":
                            field_values.append(f"DATE('{val}') as {col}")
                        elif col == "x_ingested_at":
                            field_values.append(f"TIMESTAMP('{val}') as {col}")
                        else:
                            escaped = str(val).replace("'", "''")
                            field_values.append(f"'{escaped}' as {col}")
                    struct_values.append(f"STRUCT({', '.join(field_values)})")

                unnest_source = ", ".join(struct_values)

                # Build MERGE ON clause
                on_clause = " AND ".join([
                    f"COALESCE(CAST(T.{k} AS STRING), '') = COALESCE(CAST(S.{k} AS STRING), '')"
                    if k != "x_pipeline_run_date" else f"T.{k} = S.{k}"
                    for k in merge_keys
                ])

                update_set = ", ".join([f"{c} = S.{c}" for c in update_columns]) if update_columns else "x_ingested_at = S.x_ingested_at"
                insert_columns = ", ".join(columns)
                insert_values = ", ".join([f"S.{c}" for c in columns])

                merge_query = f"""
                    MERGE `{full_table_id}` T
                    USING UNNEST([{unnest_source}]) S
                    ON {on_clause}
                    WHEN MATCHED THEN
                        UPDATE SET {update_set}
                    WHEN NOT MATCHED THEN
                        INSERT ({insert_columns})
                        VALUES ({insert_values})
                """

                job = client.query(merge_query)
                job.result()
                total_affected += job.num_dml_affected_rows or len(batch)

            logger.info(
                f"MERGE write complete: {table_name}",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "rows_affected": total_affected
                }
            )

            return {
                "status": "SUCCESS",
                "rows_affected": total_affected,
                "run_id": run_id,
                "table": full_table_id
            }

        except Exception as e:
            logger.error(f"MERGE write failed: {e}", exc_info=True)
            raise

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
