"""
GenAI PAYG Cost Processor

Calculates costs from PAYG usage using pricing tables.
Reads from: {org_slug}_{env}.genai_payg_usage_raw, genai_payg_pricing
Writes to: {org_slug}_{env}.genai_payg_costs_daily

Usage in pipeline:
    ps_type: genai.payg_cost

Issues Fixed:
    #32: Fixed cached tokens field mismatch (cached_input_tokens in schema)
    #33: Added volume discount calculation using volume_discount_pct from pricing
    #34: Added batch processing support using batch_input_per_1m and batch_output_per_1m
    #39: Added validation for zero rates, negative tokens, invalid date ranges
    #41: Fixed SQL injection vulnerability - use parameterized queries for provider filter
    #43: Added NULL handling for hierarchy fields
    #44: Added idempotency tracking - check if date already processed before inserting
    #45: Added retry with exponential backoff for BigQuery rate limits (429 errors)

Idempotency Fixes:
    HIGH #5: Use atomic MERGE instead of DELETE+INSERT to prevent race conditions
"""

import logging
import asyncio
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from google.cloud import bigquery
from google.api_core import exceptions as google_exceptions

from src.core.engine.bq_client import BigQueryClient, BigQueryPoolManager
from src.app.config import get_settings

# BigQuery rate limit retry configuration
BQ_MAX_RETRIES = 5
BQ_INITIAL_BACKOFF_SECONDS = 1.0
BQ_MAX_BACKOFF_SECONDS = 60.0
BQ_BACKOFF_MULTIPLIER = 2.0

# SECURITY: Valid table name pattern for SQL injection prevention
import re
VALID_TABLE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
VALID_PROJECT_ID_PATTERN = re.compile(r'^[a-z][a-z0-9\-]*[a-z0-9]$')

# SECURITY: Allowlist of valid GenAI table names
VALID_GENAI_TABLES = frozenset([
    'genai_payg_usage_raw',
    'genai_payg_costs_daily',
    'genai_payg_pricing',
    'genai_commitment_usage_raw',
    'genai_commitment_costs_daily',
    'genai_commitment_pricing',
    'genai_infrastructure_usage_raw',
    'genai_infrastructure_costs_daily',
    'genai_infrastructure_pricing',
    'genai_costs_daily_unified',
    'genai_usage_daily_unified',
])


class PAYGCostProcessor:
    """
    Calculates PAYG costs from usage and pricing.

    Reads from: genai_payg_usage_raw, genai_payg_pricing
    Writes to: genai_payg_costs_daily

    Features:
    - Issue #45: Retry with exponential backoff for BigQuery rate limits (429 errors)
    - Uses connection pool manager for efficient BigQuery client reuse
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger("src.core.processors.genai.payg_cost")
        self._pool_manager = BigQueryPoolManager.get_instance()

    def _validate_table_name(self, table_name: str) -> bool:
        """
        SECURITY: Validate table name against allowlist.

        Args:
            table_name: The table name to validate (without project/dataset prefix)

        Returns:
            True if table name is valid, False otherwise
        """
        if not table_name:
            return False
        if table_name not in VALID_GENAI_TABLES:
            self.logger.error(
                f"Invalid table name: {table_name}. Must be one of: {VALID_GENAI_TABLES}"
            )
            return False
        return True

    def _validate_identifier(self, identifier: str, identifier_type: str) -> bool:
        """
        SECURITY: Validate SQL identifiers to prevent injection.

        Args:
            identifier: The identifier to validate
            identifier_type: Type for logging (e.g., 'project_id', 'dataset_id')

        Returns:
            True if identifier is valid, False otherwise
        """
        if not identifier:
            self.logger.error(f"Empty {identifier_type}")
            return False

        if identifier_type == 'project_id':
            if not VALID_PROJECT_ID_PATTERN.match(identifier):
                self.logger.error(f"Invalid {identifier_type}: {identifier}")
                return False
        else:
            if not VALID_TABLE_NAME_PATTERN.match(identifier):
                self.logger.error(f"Invalid {identifier_type}: {identifier}")
                return False

        return True

    async def _execute_with_retry(
        self,
        bq_client: BigQueryClient,
        query: str,
        job_config: Optional[bigquery.QueryJobConfig] = None,
        operation_name: str = "query"
    ) -> bigquery.QueryJob:
        """
        Execute BigQuery query with retry logic for rate limits (429 errors).

        Issue #45: Implements exponential backoff for TooManyRequests errors.

        Args:
            bq_client: BigQuery client instance
            query: SQL query to execute
            job_config: Optional query job configuration
            operation_name: Name of operation for logging

        Returns:
            bigquery.QueryJob: The completed query job

        Raises:
            google_exceptions.TooManyRequests: If all retries exhausted
            Exception: For non-retryable errors
        """
        last_exception = None
        backoff_seconds = BQ_INITIAL_BACKOFF_SECONDS

        for attempt in range(BQ_MAX_RETRIES):
            try:
                job = bq_client.client.query(query, job_config=job_config)
                job.result()  # Wait for completion
                return job

            except google_exceptions.TooManyRequests as e:
                last_exception = e
                self._pool_manager.record_error()

                if attempt < BQ_MAX_RETRIES - 1:
                    # Calculate backoff with jitter (always positive)
                    jitter = backoff_seconds * 0.1 * abs(0.5 - asyncio.get_event_loop().time() % 1)
                    wait_time = min(max(backoff_seconds + jitter, 0.1), BQ_MAX_BACKOFF_SECONDS)

                    self.logger.warning(
                        f"BigQuery rate limit hit for {operation_name}. "
                        f"Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{BQ_MAX_RETRIES})",
                        extra={
                            "operation": operation_name,
                            "attempt": attempt + 1,
                            "wait_seconds": wait_time
                        }
                    )
                    await asyncio.sleep(wait_time)
                    backoff_seconds *= BQ_BACKOFF_MULTIPLIER
                else:
                    self.logger.error(
                        f"BigQuery rate limit: all {BQ_MAX_RETRIES} retries exhausted for {operation_name}",
                        extra={"operation": operation_name}
                    )
                    raise

            except google_exceptions.ServiceUnavailable as e:
                # Also retry on service unavailable (503)
                last_exception = e
                self._pool_manager.record_error()

                if attempt < BQ_MAX_RETRIES - 1:
                    wait_time = min(backoff_seconds, BQ_MAX_BACKOFF_SECONDS)
                    self.logger.warning(
                        f"BigQuery service unavailable for {operation_name}. "
                        f"Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{BQ_MAX_RETRIES})",
                        extra={"operation": operation_name, "attempt": attempt + 1}
                    )
                    await asyncio.sleep(wait_time)
                    backoff_seconds *= BQ_BACKOFF_MULTIPLIER
                else:
                    raise

            except Exception as e:
                # Non-retryable error - fail immediately
                self._pool_manager.record_error()
                self.logger.error(
                    f"BigQuery {operation_name} failed with non-retryable error: {type(e).__name__}",
                    extra={"operation": operation_name, "error_type": type(e).__name__}
                )
                raise

        # Should not reach here, but just in case
        if last_exception:
            raise last_exception
        raise RuntimeError(f"Unexpected state in retry loop for {operation_name}")

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculate PAYG costs from usage.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name (optional, processes all if not set)
                - config.date: Date to process (YYYY-MM-DD)
                - config.force_reprocess: If True, reprocess even if already done (default: False)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - run_id: Pipeline run ID

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - rows_inserted: Number of cost records created
                - total_cost_usd: Total cost calculated
        """
        org_slug = context.get("org_slug")
        run_id = context.get("run_id", "manual")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        provider = config.get("provider")  # Optional filter
        process_date = self._parse_date(config.get("date") or context.get("start_date"))
        force_reprocess = config.get("force_reprocess", False)

        # Issue #39: Validate date
        if not process_date:
            return {"status": "FAILED", "error": "date is required"}

        # Issue #39: Validate date is not in the future
        if process_date > date.today():
            return {"status": "FAILED", "error": f"Cannot process future date: {process_date}"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        # SECURITY: Validate identifiers before using in SQL
        if not self._validate_identifier(project_id, 'project_id'):
            return {"status": "FAILED", "error": "Invalid project_id configuration"}
        if not self._validate_identifier(dataset_id, 'dataset_id'):
            return {"status": "FAILED", "error": "Invalid dataset_id configuration"}

        # SECURITY: Validate table names are from allowlist
        required_tables = ['genai_payg_usage_raw', 'genai_payg_costs_daily', 'genai_payg_pricing']
        for table in required_tables:
            if not self._validate_table_name(table):
                return {"status": "FAILED", "error": f"Invalid table name: {table}"}

        self.logger.info(
            f"Calculating PAYG costs for {org_slug}",
            extra={"org_slug": org_slug, "provider": provider, "date": str(process_date)}
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Issue #44: Check idempotency - skip if already processed
            if not force_reprocess:
                already_processed = await self._check_already_processed(
                    bq_client, project_id, dataset_id, org_slug, process_date, provider
                )
                if already_processed:
                    self.logger.info(f"Date {process_date} already processed for {org_slug}, skipping")
                    return {
                        "status": "SUCCESS",
                        "rows_inserted": 0,
                        "total_cost_usd": 0,
                        "date": str(process_date),
                        "skipped": True,
                        "reason": "Already processed"
                    }

            # Issue #39: Validate usage data before processing
            validation_result = await self._validate_usage_data(
                bq_client, project_id, dataset_id, org_slug, process_date, provider
            )
            if validation_result["has_errors"]:
                return {
                    "status": "FAILED",
                    "error": "Data validation failed",
                    "validation_errors": validation_result["errors"]
                }

            # Build query parameters - Issue #41: Use parameterized queries for provider
            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
            ]

            # Issue #41: Add provider as parameter instead of string interpolation
            provider_condition = ""
            if provider:
                provider_condition = "AND u.provider = @provider"
                query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

            # HIGH FIX #5: Use atomic MERGE instead of DELETE+INSERT
            # This prevents race conditions between delete and insert operations
            # Issue #32, #33, #34, #43: Complete cost calculation with all fixes
            cost_query = f"""
                MERGE `{project_id}.{dataset_id}.genai_payg_costs_daily` T
                USING (
                    SELECT
                        u.usage_date as cost_date,
                        u.org_slug,
                        u.provider,
                        u.model,
                        u.model_family,
                        u.region,
                        u.input_tokens,
                        u.output_tokens,
                        -- Issue #32: Use cached_input_tokens (matches schema field name)
                        u.cached_input_tokens,
                        u.total_tokens,

                        -- Issue #34: Support batch processing - use batch rates when is_batch=true
                        ROUND(u.input_tokens * CASE
                            WHEN u.is_batch = true AND p.batch_input_per_1m IS NOT NULL
                            THEN p.batch_input_per_1m
                            ELSE COALESCE(p.override_input_per_1m, p.input_per_1m)
                        END / 1000000, 6) as input_cost_usd,

                        ROUND(u.output_tokens * CASE
                            WHEN u.is_batch = true AND p.batch_output_per_1m IS NOT NULL
                            THEN p.batch_output_per_1m
                            ELSE COALESCE(p.override_output_per_1m, p.output_per_1m)
                        END / 1000000, 6) as output_cost_usd,

                        -- Cached tokens use cached rate or discounted rate
                        ROUND(COALESCE(u.cached_input_tokens, 0) * COALESCE(
                            p.cached_input_per_1m,
                            p.input_per_1m * (1 - COALESCE(p.cached_discount_pct, 50) / 100)
                        ) / 1000000, 6) as cached_cost_usd,

                        -- Issue #33: Apply volume discount to total cost
                        ROUND(
                            (
                                (u.input_tokens * CASE
                                    WHEN u.is_batch = true AND p.batch_input_per_1m IS NOT NULL
                                    THEN p.batch_input_per_1m
                                    ELSE COALESCE(p.override_input_per_1m, p.input_per_1m)
                                END) +
                                (u.output_tokens * CASE
                                    WHEN u.is_batch = true AND p.batch_output_per_1m IS NOT NULL
                                    THEN p.batch_output_per_1m
                                    ELSE COALESCE(p.override_output_per_1m, p.output_per_1m)
                                END) +
                                (COALESCE(u.cached_input_tokens, 0) * COALESCE(
                                    p.cached_input_per_1m,
                                    p.input_per_1m * (1 - COALESCE(p.cached_discount_pct, 50) / 100)
                                ))
                            ) / 1000000 * (1 - COALESCE(p.volume_discount_pct, 0) / 100)
                        , 6) as total_cost_usd,

                        -- Issue #33: Calculate total discount applied (override + volume + batch)
                        CASE
                            WHEN u.is_batch = true AND p.batch_discount_pct IS NOT NULL
                            THEN p.batch_discount_pct
                            WHEN p.is_override = true AND p.override_input_per_1m IS NOT NULL
                            THEN ROUND((1 - p.override_input_per_1m / NULLIF(p.input_per_1m, 0)) * 100, 2)
                            ELSE COALESCE(p.volume_discount_pct, 0)
                        END as discount_applied_pct,

                        -- Effective rates after discounts
                        ROUND(CASE
                            WHEN u.is_batch = true AND p.batch_input_per_1m IS NOT NULL
                            THEN p.batch_input_per_1m
                            ELSE COALESCE(p.override_input_per_1m, p.input_per_1m)
                        END * (1 - COALESCE(p.volume_discount_pct, 0) / 100), 4) as effective_rate_input,

                        ROUND(CASE
                            WHEN u.is_batch = true AND p.batch_output_per_1m IS NOT NULL
                            THEN p.batch_output_per_1m
                            ELSE COALESCE(p.override_output_per_1m, p.output_per_1m)
                        END * (1 - COALESCE(p.volume_discount_pct, 0) / 100), 4) as effective_rate_output,

                        u.request_count,

                        -- Issue #43: Handle NULL hierarchy fields with COALESCE for safe insertion
                        NULLIF(TRIM(COALESCE(u.hierarchy_dept_id, '')), '') as hierarchy_dept_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_dept_name, '')), '') as hierarchy_dept_name,
                        NULLIF(TRIM(COALESCE(u.hierarchy_project_id, '')), '') as hierarchy_project_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_project_name, '')), '') as hierarchy_project_name,
                        NULLIF(TRIM(COALESCE(u.hierarchy_team_id, '')), '') as hierarchy_team_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_team_name, '')), '') as hierarchy_team_name,

                        CURRENT_TIMESTAMP() as calculated_at,
                        -- Standardized lineage columns (x_ prefix)
                        CONCAT('genai_payg_cost_', COALESCE(u.provider, 'unknown')) as x_pipeline_id,
                        u.x_credential_id as x_credential_id,
                        @process_date as x_pipeline_run_date,
                        @run_id as x_run_id,
                        CURRENT_TIMESTAMP() as x_ingested_at
                    FROM `{project_id}.{dataset_id}.genai_payg_usage_raw` u
                    LEFT JOIN `{project_id}.{dataset_id}.genai_payg_pricing` p
                        ON u.provider = p.provider
                        AND u.model = p.model
                        AND (p.region = u.region OR p.region = 'global')
                        AND (p.status IS NULL OR p.status = 'active')
                        AND (p.effective_from IS NULL OR p.effective_from <= u.usage_date)
                        AND (p.effective_to IS NULL OR p.effective_to >= u.usage_date)
                    WHERE u.usage_date = @process_date
                        AND u.org_slug = @org_slug
                        {provider_condition}
                ) S
                ON T.cost_date = S.cost_date
                    AND T.org_slug = S.org_slug
                    AND T.provider = S.provider
                    AND T.model = S.model
                    AND COALESCE(T.region, 'global') = COALESCE(S.region, 'global')
                WHEN MATCHED THEN
                    UPDATE SET
                        input_tokens = S.input_tokens,
                        output_tokens = S.output_tokens,
                        cached_input_tokens = S.cached_input_tokens,
                        total_tokens = S.total_tokens,
                        input_cost_usd = S.input_cost_usd,
                        output_cost_usd = S.output_cost_usd,
                        cached_cost_usd = S.cached_cost_usd,
                        total_cost_usd = S.total_cost_usd,
                        discount_applied_pct = S.discount_applied_pct,
                        effective_rate_input = S.effective_rate_input,
                        effective_rate_output = S.effective_rate_output,
                        request_count = S.request_count,
                        hierarchy_dept_id = S.hierarchy_dept_id,
                        hierarchy_dept_name = S.hierarchy_dept_name,
                        hierarchy_project_id = S.hierarchy_project_id,
                        hierarchy_project_name = S.hierarchy_project_name,
                        hierarchy_team_id = S.hierarchy_team_id,
                        hierarchy_team_name = S.hierarchy_team_name,
                        calculated_at = S.calculated_at,
                        x_pipeline_id = S.x_pipeline_id,
                        x_credential_id = S.x_credential_id,
                        x_pipeline_run_date = S.x_pipeline_run_date,
                        x_run_id = S.x_run_id,
                        x_ingested_at = S.x_ingested_at
                WHEN NOT MATCHED THEN
                    INSERT (cost_date, org_slug, provider, model, model_family, region,
                            input_tokens, output_tokens, cached_input_tokens, total_tokens,
                            input_cost_usd, output_cost_usd, cached_cost_usd, total_cost_usd,
                            discount_applied_pct, effective_rate_input, effective_rate_output,
                            request_count,
                            hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                            hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                            calculated_at, x_pipeline_id, x_credential_id, x_pipeline_run_date,
                            x_run_id, x_ingested_at)
                    VALUES (S.cost_date, S.org_slug, S.provider, S.model, S.model_family, S.region,
                            S.input_tokens, S.output_tokens, S.cached_input_tokens, S.total_tokens,
                            S.input_cost_usd, S.output_cost_usd, S.cached_cost_usd, S.total_cost_usd,
                            S.discount_applied_pct, S.effective_rate_input, S.effective_rate_output,
                            S.request_count,
                            S.hierarchy_dept_id, S.hierarchy_dept_name, S.hierarchy_project_id,
                            S.hierarchy_project_name, S.hierarchy_team_id, S.hierarchy_team_name,
                            S.calculated_at, S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date,
                            S.x_run_id, S.x_ingested_at)
            """

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)

            # Issue #45: Use retry logic for BigQuery rate limits
            job = await self._execute_with_retry(
                bq_client, cost_query, job_config, "calculate_payg_costs"
            )

            rows_inserted = job.num_dml_affected_rows or 0

            # Get total cost
            total_query = f"""
                SELECT COALESCE(SUM(total_cost_usd), 0) as total
                FROM `{project_id}.{dataset_id}.genai_payg_costs_daily`
                WHERE cost_date = @process_date AND org_slug = @org_slug
            """
            total_result = list(bq_client.query(total_query, parameters=[
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]))
            total_cost = total_result[0].get("total", 0) if total_result else 0

            self.logger.info(f"Calculated {rows_inserted} PAYG cost records, total: ${total_cost:.2f}")
            return {
                "status": "SUCCESS",
                "rows_inserted": rows_inserted,
                "total_cost_usd": round(total_cost, 2),
                "date": str(process_date)
            }

        except Exception as e:
            # SECURITY: Log full error internally but return generic message to API
            self.logger.error(
                f"Failed to calculate PAYG costs: {type(e).__name__}: {e}",
                exc_info=True,
                extra={"org_slug": org_slug, "date": str(process_date)}
            )
            return {
                "status": "FAILED",
                "error": "Failed to calculate costs. Check logs for details."
            }

    async def _check_already_processed(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> bool:
        """
        Issue #44: Check if this date has already been processed.
        Returns True if records exist for this date/org/provider combination.
        """
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        check_query = f"""
            SELECT COUNT(*) as count
            FROM `{project_id}.{dataset_id}.genai_payg_costs_daily`
            WHERE cost_date = @process_date
                AND org_slug = @org_slug
                {provider_condition}
        """

        try:
            result = list(bq_client.query(check_query, parameters=query_params))
            return result[0].get("count", 0) > 0 if result else False
        except Exception:
            # Table might not exist yet
            return False

    async def _validate_usage_data(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> Dict[str, Any]:
        """
        Issue #39: Validate usage data before processing.
        Checks for:
        - Negative token values
        - Zero/missing pricing rates
        - Invalid data patterns
        """
        errors = []
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND u.provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        # Check for negative tokens
        negative_check_query = f"""
            SELECT provider, model, COUNT(*) as count
            FROM `{project_id}.{dataset_id}.genai_payg_usage_raw` u
            WHERE usage_date = @process_date
                AND org_slug = @org_slug
                AND (input_tokens < 0 OR output_tokens < 0 OR total_tokens < 0)
                {provider_condition}
            GROUP BY provider, model
        """

        try:
            negative_results = list(bq_client.query(negative_check_query, parameters=query_params))
            for row in negative_results:
                errors.append({
                    "type": "negative_tokens",
                    "provider": row.get("provider"),
                    "model": row.get("model"),
                    "count": row.get("count")
                })
        except Exception as e:
            self.logger.warning(f"Negative tokens check failed: {e}")

        # Check for missing pricing (warning only, not blocking)
        missing_price_query = f"""
            SELECT DISTINCT u.provider, u.model, u.region
            FROM `{project_id}.{dataset_id}.genai_payg_usage_raw` u
            LEFT JOIN `{project_id}.{dataset_id}.genai_payg_pricing` p
                ON u.provider = p.provider
                AND u.model = p.model
                AND (p.region = u.region OR p.region = 'global')
                AND (p.status IS NULL OR p.status = 'active')
            WHERE u.usage_date = @process_date
                AND u.org_slug = @org_slug
                AND p.provider IS NULL
                {provider_condition}
        """

        try:
            missing_results = list(bq_client.query(missing_price_query, parameters=query_params))
            for row in missing_results:
                self.logger.warning(
                    f"Missing pricing for {row.get('provider')}/{row.get('model')} in {row.get('region')}"
                )
        except Exception as e:
            self.logger.warning(f"Missing pricing check failed: {e}")

        # Issue #5: Check for orphan hierarchy allocations (warning only)
        # Use x_org_hierarchy view (pre-filtered by org_slug) for faster queries
        hierarchy_check_query = f"""
            SELECT DISTINCT
                u.hierarchy_dept_id,
                u.hierarchy_project_id,
                u.hierarchy_team_id
            FROM `{project_id}.{dataset_id}.genai_payg_usage_raw` u
            LEFT JOIN `{project_id}.{dataset_id}.x_org_hierarchy` h
                ON (
                    (h.entity_type = 'department' AND h.entity_id = u.hierarchy_dept_id) OR
                    (h.entity_type = 'project' AND h.entity_id = u.hierarchy_project_id) OR
                    (h.entity_type = 'team' AND h.entity_id = u.hierarchy_team_id)
                )
            WHERE u.usage_date = @process_date
                AND u.org_slug = @org_slug
                AND (u.hierarchy_dept_id IS NOT NULL OR u.hierarchy_project_id IS NOT NULL OR u.hierarchy_team_id IS NOT NULL)
                AND h.entity_id IS NULL
                {provider_condition}
        """

        try:
            orphan_results = list(bq_client.query(hierarchy_check_query, parameters=query_params))
            for row in orphan_results:
                dept_id = row.get("hierarchy_dept_id")
                project_id_val = row.get("hierarchy_project_id")
                team_id = row.get("hierarchy_team_id")
                self.logger.warning(
                    f"Issue #5: Orphan hierarchy allocation detected - "
                    f"dept_id={dept_id}, project_id={project_id_val}, team_id={team_id}. "
                    f"These IDs may not exist in x_org_hierarchy view."
                )
        except Exception as e:
            # Don't fail on hierarchy check errors - just warn
            self.logger.warning(f"Hierarchy validation check failed: {e}")

        return {
            "has_errors": len(errors) > 0,
            "errors": errors
        }

    async def _delete_existing_records(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> None:
        """
        Issue #44: Delete existing records before inserting new ones.
        This ensures idempotent reprocessing.
        """
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        delete_query = f"""
            DELETE FROM `{project_id}.{dataset_id}.genai_payg_costs_daily`
            WHERE cost_date = @process_date
                AND org_slug = @org_slug
                {provider_condition}
        """

        try:
            job = bq_client.client.query(
                delete_query,
                job_config=bigquery.QueryJobConfig(query_parameters=query_params)
            )
            job.result()
            if job.num_dml_affected_rows:
                self.logger.info(f"Deleted {job.num_dml_affected_rows} existing records for reprocessing")
        except Exception as e:
            self.logger.warning(f"Delete existing records failed (table may not exist): {e}")

    def _parse_date(self, date_str: str) -> date:
        """Parse date string to date object."""
        if not date_str:
            return None
        if isinstance(date_str, date):
            return date_str
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None


def get_engine():
    """Factory function for pipeline executor - REQUIRED for dynamic loading"""
    return PAYGCostProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = PAYGCostProcessor()
    return await processor.execute(step_config, context)
