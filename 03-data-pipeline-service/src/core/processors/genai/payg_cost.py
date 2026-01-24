"""
GenAI PAYG Cost Processor

Calculates costs from PAYG usage using pricing tables.
Reads from: {org_slug}_{env}.genai_payg_usage_raw, genai_payg_pricing
Writes to: {org_slug}_{env}.genai_payg_costs_daily

Usage in pipeline:
    ps_type: genai.payg_cost

Date Range Support:
    - Single date: config.date or context.date (legacy)
    - Date range: config.start_date + config.end_date or context.start_date + context.end_date (new)
    - When using date range, processor loops through each day and processes individually

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
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from google.cloud import bigquery
from google.api_core import exceptions as google_exceptions

from src.core.engine.bq_client import BigQueryClient, BigQueryPoolManager
from src.app.config import get_settings
from src.core.utils.audit_logger import log_execute, AuditLogger

# BigQuery rate limit retry configuration
# QUAL-003: Exponential backoff for 429 (Too Many Requests) and 503 (Service Unavailable) errors
BQ_MAX_RETRIES = 5  # Maximum retry attempts: 5 tries = up to 31 seconds total wait (1+2+4+8+16)
BQ_INITIAL_BACKOFF_SECONDS = 1.0  # First retry after 1 second
BQ_MAX_BACKOFF_SECONDS = 60.0  # Cap backoff at 60 seconds to prevent indefinite waits
BQ_BACKOFF_MULTIPLIER = 2.0  # Double wait time on each retry: 1s → 2s → 4s → 8s → 16s → 32s

# SECURITY: Valid table name pattern for SQL injection prevention
import re
import time
from google.api_core import exceptions as google_exceptions
from typing import Callable, TypeVar, Any

T = TypeVar('T')


def retry_with_backoff(
    func: Callable[..., T],
    *args: Any,
    max_retries: int = BQ_MAX_RETRIES,
    initial_backoff: float = BQ_INITIAL_BACKOFF_SECONDS,
    max_backoff: float = BQ_MAX_BACKOFF_SECONDS,
    multiplier: float = BQ_BACKOFF_MULTIPLIER,
    logger: Any = None,
    **kwargs: Any
) -> T:
    """
    Retry a function with exponential backoff for BigQuery rate limits.

    Handles 429 (Too Many Requests), 500 (Internal Server Error), and 503 (Service Unavailable).
    Uses exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 60s).

    Args:
        func: Function to retry
        *args: Positional arguments to pass to func
        max_retries: Maximum number of retry attempts
        initial_backoff: Initial backoff delay in seconds
        max_backoff: Maximum backoff delay in seconds
        multiplier: Backoff multiplier for exponential backoff
        logger: Logger instance for retry messages
        **kwargs: Keyword arguments to pass to func

    Returns:
        Result of func call

    Raises:
        Last exception if all retries exhausted
    """
    last_exception = None
    backoff = initial_backoff

    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except (google_exceptions.TooManyRequests,
                google_exceptions.InternalServerError,
                google_exceptions.ServiceUnavailable) as e:
            last_exception = e

            if attempt < max_retries - 1:
                # Calculate backoff with exponential growth
                wait_time = min(backoff, max_backoff)
                if logger:
                    logger.warning(
                        f"BigQuery rate limit/error (attempt {attempt + 1}/{max_retries}): {e}. "
                        f"Retrying in {wait_time:.1f}s..."
                    )
                time.sleep(wait_time)
                backoff *= multiplier
            else:
                if logger:
                    logger.error(
                        f"BigQuery operation failed after {max_retries} retries: {e}"
                    )
                raise
        except Exception as e:
            # Non-retryable exception, fail immediately
            if logger:
                logger.error(f"Non-retryable BigQuery error: {e}")
            raise

    # Should never reach here, but just in case
    if last_exception:
        raise last_exception
    raise RuntimeError("Unexpected retry logic failure")
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

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, _exc_type, _exc_val, _exc_tb):
        """Async context manager exit - cleanup connection pool."""
        if self._pool_manager:
            try:
                self._pool_manager.shutdown()
            except Exception as e:
                self.logger.warning(f"Error closing connection pool: {e}")
        return False

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
                - config.date: Single date to process (legacy, YYYY-MM-DD)
                - config.start_date: Start date for range (new, YYYY-MM-DD)
                - config.end_date: End date for range (new, YYYY-MM-DD)
                - config.force_reprocess: If True, reprocess even if already done (default: False)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - run_id: Pipeline run ID
                - start_date: Alternative start date from context
                - end_date: Alternative end date from context

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - rows_inserted: Number of cost records created
                - total_cost_usd: Total cost calculated
                - days_processed: Number of days processed
        """
        org_slug = context.get("org_slug")
        run_id = context.get("run_id", "manual")
        config = step_config.get("config", {})

        # BUG SEC-02: Add org_slug format validation
        from src.core.utils.validators import is_valid_org_slug

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}
        if not is_valid_org_slug(org_slug):
            return {"status": "FAILED", "error": "Invalid org_slug format"}

        provider = config.get("provider")  # Optional filter
        force_reprocess = config.get("force_reprocess", False)

        # Support both single date and date ranges
        start_date_str = context.get("start_date") or config.get("start_date")
        end_date_str = context.get("end_date") or config.get("end_date")
        single_date_str = config.get("date") or context.get("date")

        if start_date_str and end_date_str:
            # Date range mode
            start_date = self._parse_date(start_date_str)
            end_date = self._parse_date(end_date_str)
            if not start_date or not end_date:
                return {"status": "FAILED", "error": "Invalid start_date or end_date format"}

            dates_to_process = self._generate_date_range(start_date, end_date)
            self.logger.info(
                f"Calculating PAYG costs for {org_slug} (date range)",
                extra={"start_date": str(start_date), "end_date": str(end_date), "days": len(dates_to_process), "provider": provider or "all"}
            )
        elif single_date_str:
            # Single date mode (legacy)
            single_date = self._parse_date(single_date_str)
            if not single_date:
                return {"status": "FAILED", "error": "Invalid date format"}

            dates_to_process = [single_date]
            self.logger.info(
                f"Calculating PAYG costs for {org_slug} (single date)",
                extra={"date": str(single_date), "provider": provider or "all"}
            )
        else:
            return {"status": "FAILED", "error": "Either 'date' or 'start_date'+'end_date' is required"}

        # Issue #39: Validate dates are not in the future
        for process_date in dates_to_process:
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

        # SEC-005: Audit logging - Log pipeline execution start
        pipeline_id = context.get("pipeline_id", "genai_payg_cost")
        await log_execute(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_PIPELINE,
            resource_id=pipeline_id,
            details={
                "run_id": run_id,
                "action": "START",
                "processor": "GenAIPaygCostProcessor",
                "provider": provider or "all",
                "dates": len(dates_to_process)
            }
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            total_rows_inserted = 0
            total_cost_all_dates = 0.0
            process_date = None  # Initialize for exception handler

            # Process each date
            for process_date in dates_to_process:
                # Issue #44: Check idempotency - skip if already processed
                if not force_reprocess:
                    already_processed = await self._check_already_processed(
                        bq_client, project_id, dataset_id, org_slug, process_date, provider
                    )
                    if already_processed:
                        self.logger.debug(f"Date {process_date} already processed for {org_slug}, skipping")
                        continue

                # Issue #39: Validate usage data before processing
                validation_result = await self._validate_usage_data(
                    bq_client, project_id, dataset_id, org_slug, process_date, provider
                )
                if validation_result["has_errors"]:
                    self.logger.warning(
                        f"Validation errors for {process_date}: {validation_result['errors']}"
                    )
                    continue

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
                        u.x_org_slug,
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

                        -- Issue #43: Hierarchy columns (5-field model, populated during cost allocation, NULL at calculation time)
                        CAST(NULL AS STRING) as x_hierarchy_entity_id,
                        CAST(NULL AS STRING) as x_hierarchy_entity_name,
                        CAST(NULL AS STRING) as x_hierarchy_level_code,
                        CAST(NULL AS STRING) as x_hierarchy_path,
                        CAST(NULL AS STRING) as x_hierarchy_path_names,

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
                        AND u.x_org_slug = @org_slug
                        {provider_condition}
                ) S
                ON T.cost_date = S.cost_date
                    AND T.x_org_slug = S.x_org_slug
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
                        x_hierarchy_entity_id = S.x_hierarchy_entity_id,
                        x_hierarchy_entity_name = S.x_hierarchy_entity_name,
                        x_hierarchy_level_code = S.x_hierarchy_level_code,
                        x_hierarchy_path = S.x_hierarchy_path,
                        x_hierarchy_path_names = S.x_hierarchy_path_names,
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
                            x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
                            x_hierarchy_path, x_hierarchy_path_names,
                            calculated_at, x_pipeline_id, x_credential_id, x_pipeline_run_date,
                            x_run_id, x_ingested_at)
                    VALUES (S.cost_date, S.x_org_slug, S.provider, S.model, S.model_family, S.region,
                            S.input_tokens, S.output_tokens, S.cached_input_tokens, S.total_tokens,
                            S.input_cost_usd, S.output_cost_usd, S.cached_cost_usd, S.total_cost_usd,
                            S.discount_applied_pct, S.effective_rate_input, S.effective_rate_output,
                            S.request_count,
                            S.x_hierarchy_entity_id, S.x_hierarchy_entity_name, S.x_hierarchy_level_code,
                            S.x_hierarchy_path, S.x_hierarchy_path_names,
                            S.calculated_at, S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date,
                            S.x_run_id, S.x_ingested_at)
                """

                job_config = bigquery.QueryJobConfig(query_parameters=query_params)

                # Issue #45: Use retry logic for BigQuery rate limits
                job = await self._execute_with_retry(
                    bq_client, cost_query, job_config, "calculate_payg_costs"
                )

                rows_inserted = job.num_dml_affected_rows or 0
                total_rows_inserted += rows_inserted

                # Get total cost for this date
                total_query = f"""
                    SELECT COALESCE(SUM(total_cost_usd), 0) as total
                    FROM `{project_id}.{dataset_id}.genai_payg_costs_daily`
                    WHERE cost_date = @process_date AND org_slug = @org_slug
                """
                total_result = list(bq_client.query(total_query, parameters=[
                    bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]))
                date_cost = total_result[0].get("total", 0) if total_result else 0
                total_cost_all_dates += date_cost

            # Log summary
            self.logger.info(
                f"Calculated {total_rows_inserted} PAYG cost records across {len(dates_to_process)} days, "
                f"total: ${total_cost_all_dates:.2f}"
            )

            # SEC-005: Audit logging - Log successful completion
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_SUCCESS,
                details={
                    "run_id": run_id,
                    "rows_inserted": total_rows_inserted,
                    "total_cost_usd": round(total_cost_all_dates, 2),
                    "days_processed": len(dates_to_process)
                }
            )

            return {
                "status": "SUCCESS",
                "rows_inserted": total_rows_inserted,
                "total_cost_usd": round(total_cost_all_dates, 2),
                "days_processed": len(dates_to_process)
            }

        except Exception as e:
            # SECURITY: Log full error internally but return generic message to API
            date_str = "undefined"
            if 'process_date' in locals() and process_date:
                date_str = str(process_date)
            self.logger.error(
                f"Failed to calculate PAYG costs: {type(e).__name__}: {e}",
                exc_info=True,
                extra={"org_slug": org_slug, "date": date_str}
            )

            # SEC-005: Audit logging - Log failure
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_FAILURE,
                error_message=f"{type(e).__name__}: {str(e)}",
                details={"run_id": run_id, "date": date_str}
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
                AND u.x_org_slug = @org_slug
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
        # Check if hierarchy_entity_id exists in x_org_hierarchy
        hierarchy_check_query = f"""
            SELECT DISTINCT
                u.x_hierarchy_entity_id,
                u.x_hierarchy_entity_name
            FROM `{project_id}.{dataset_id}.genai_payg_usage_raw` u
            LEFT JOIN `{project_id}.{dataset_id}.x_org_hierarchy` h
                ON h.entity_id = u.x_hierarchy_entity_id
            WHERE u.usage_date = @process_date
                AND u.x_org_slug = @org_slug
                AND u.x_hierarchy_entity_id IS NOT NULL
                AND h.entity_id IS NULL
                {provider_condition}
        """

        try:
            orphan_results = list(bq_client.query(hierarchy_check_query, parameters=query_params))
            for row in orphan_results:
                self.logger.warning(
                    f"Orphan hierarchy allocation: entity_id={row.get('x_hierarchy_entity_id')}, "
                    f"entity_name={row.get('x_hierarchy_entity_name')} not found in x_org_hierarchy"
                )
        except Exception as e:
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
            # Issue #45: Use retry wrapper for BigQuery rate limits
            job = retry_with_backoff(
                bq_client.client.query,
                delete_query,
                job_config=bigquery.QueryJobConfig(query_parameters=query_params),
                logger=self.logger
            )
            job.result()
            if job.num_dml_affected_rows:
                self.logger.info(f"Deleted {job.num_dml_affected_rows} existing records for reprocessing")
        except Exception as e:
            self.logger.warning(f"Delete existing records failed (table may not exist): {e}")

    def _generate_date_range(self, start_date: date, end_date: date) -> list:
        """Generate list of dates from start_date to end_date (inclusive)."""
        dates = []
        current_date = start_date
        while current_date <= end_date:
            dates.append(current_date)
            current_date += timedelta(days=1)
        return dates

    def _parse_date(self, date_str: str) -> Optional[date]:
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
