"""
Async Pipeline Executor - Petabyte-Scale Parallel Processing
Orchestrates multi-step pipelines with async/await and parallel execution.
"""

import re
import yaml
import uuid
import asyncio
import importlib
import traceback
import atexit
from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timezone, date
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
from src.core.metadata import MetadataLogger
from src.app.config import settings
from src.core.utils.error_classifier import create_error_context, classify_error
from src.core.abstractor.config_loader import get_config_loader
from src.core.abstractor.models import PipelineConfig
from src.core.observability.metrics import (
    increment_pipeline_execution,
    observe_pipeline_duration,
    set_active_pipelines
)
from src.core.notifications.service import get_notification_service
from src.core.utils.pipeline_lock import get_pipeline_lock_manager, PipelineLockManager
from pydantic import ValidationError

# ============================================
# UTC Date Helper
# ============================================
def get_utc_date() -> date:
    """Get current date in UTC timezone to ensure consistency with BigQuery."""
    return datetime.now(timezone.utc).date()


# Import OpenTelemetry for distributed tracing
try:
    from opentelemetry import trace
    from src.core.utils.telemetry import get_tracer
    TRACING_ENABLED = True
except ImportError:
    TRACING_ENABLED = False
    trace = None
    get_tracer = None

# ============================================
# Shared Thread Pool for BigQuery Operations
# ============================================
# Single shared pool is fine because:
# - BigQuery SERVICE handles query scheduling and concurrency (100 concurrent per project)
# - Thread pool just wraps sync calls to not block async event loop
# - Tenant isolation is at DATA level (datasets), not thread level
# - Worker count is configurable via settings for scalability tuning
BQ_EXECUTOR = ThreadPoolExecutor(
    max_workers=settings.pipeline_max_parallel_steps * 20,  # Scale with parallel steps (default: 200)
    thread_name_prefix="bq_worker"
)

def _shutdown_bq_executor():
    """Shutdown thread pool on application exit."""
    BQ_EXECUTOR.shutdown(wait=True)

# Register cleanup handler
atexit.register(_shutdown_bq_executor)


# ============================================
# Global Pipeline Concurrency Semaphore
# ============================================
# Limits total concurrent pipelines across ALL organizations
# Prevents resource exhaustion at platform level (10k+ users)
# Uses asyncio.Semaphore for proper async backpressure
_GLOBAL_PIPELINE_SEMAPHORE: asyncio.Semaphore = None


def get_global_pipeline_semaphore() -> asyncio.Semaphore:
    """
    Get or create the global pipeline concurrency semaphore.

    Uses lazy initialization to ensure the semaphore is created
    in the correct event loop context.

    Returns:
        asyncio.Semaphore for limiting concurrent pipelines
    """
    global _GLOBAL_PIPELINE_SEMAPHORE
    if _GLOBAL_PIPELINE_SEMAPHORE is None:
        _GLOBAL_PIPELINE_SEMAPHORE = asyncio.Semaphore(
            settings.pipeline_global_concurrent_limit
        )
    return _GLOBAL_PIPELINE_SEMAPHORE


class StepNode:
    """Represents a step in the pipeline DAG."""

    def __init__(self, step_config: Dict[str, Any], step_index: int):
        self.step_config = step_config
        self.step_index = step_index
        self.step_id = step_config['step_id']
        self.dependencies: Set[str] = set(step_config.get('depends_on', []))
        self.dependents: Set[str] = set()

    def __repr__(self) -> str:
        return f"StepNode({self.step_id}, deps={self.dependencies})"


class AsyncPipelineExecutor:
    """
    Async pipeline executor with parallel step execution and DAG-based dependencies.

    Features:
    - Fully async/await architecture
    - Parallel execution of independent steps
    - DAG-based dependency resolution
    - Non-blocking BigQuery operations
    - Integrated async metadata logging
    - Support for 100+ concurrent pipelines
    """

    # PIPE-001 FIX: org_slug validation pattern aligned with API service
    # Pattern: alphanumeric (mixed case) + underscore, 3-50 chars (matches middleware/validators)
    ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')

    @staticmethod
    def _validate_org_slug(org_slug: str) -> None:
        """
        Validate org_slug format (defense-in-depth).

        Auth layer should validate org_slug matches API key, but this provides
        additional validation at execution time.

        Args:
            org_slug: Organization identifier

        Raises:
            ValueError: If org_slug is invalid
        """
        if not org_slug:
            raise ValueError("org_slug is required and cannot be empty")

        if not isinstance(org_slug, str):
            raise ValueError(f"org_slug must be a string, got {type(org_slug).__name__}")

        if not AsyncPipelineExecutor.ORG_SLUG_PATTERN.match(org_slug):
            raise ValueError(
                f"Invalid org_slug format: '{org_slug}'. "
                "Must be 3-50 alphanumeric characters or underscores."
            )

    def __init__(
        self,
        org_slug: str,
        pipeline_id: str,
        trigger_type: str = "api",
        trigger_by: str = "api_user",
        tracking_pipeline_id: Optional[str] = None,
        pipeline_logging_id: Optional[str] = None,
        user_id: Optional[str] = None,
        org_api_key_id: Optional[str] = None
    ):
        """
        Initialize async pipeline executor.

        Args:
            org_slug: Organization identifier
            pipeline_id: Pipeline identifier (matches YAML filename for config lookup)
            trigger_type: How pipeline was triggered (api, scheduler, manual)
            trigger_by: Who triggered the pipeline
            tracking_pipeline_id: Full tracking ID for database logging (e.g., org-provider-domain-template)
                                  If not provided, defaults to pipeline_id
            pipeline_logging_id: Pre-generated logging ID for this run
                                If not provided, generates a new UUID
            user_id: User UUID from frontend (X-User-ID header)
            org_api_key_id: API key ID used for authentication (for audit trail)
        """
        # Validate org_slug (defense-in-depth - auth layer should have validated already)
        self._validate_org_slug(org_slug)

        self.org_slug = org_slug
        self.pipeline_id = pipeline_id
        self.trigger_type = trigger_type
        self.trigger_by = trigger_by
        self.tracking_pipeline_id = tracking_pipeline_id or pipeline_id
        self.pipeline_logging_id = pipeline_logging_id or str(uuid.uuid4())
        self.user_id = user_id
        self.org_api_key_id = org_api_key_id

        self.bq_client = get_bigquery_client()
        self._bq_client_closed = False  # FIX: Track if client has been closed to prevent double-close
        self.dq_validator = DataQualityValidator()
        self.logger = create_structured_logger(
            __name__,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            pipeline_logging_id=self.pipeline_logging_id
        )

        # Initialize metadata logger (already async)
        self.metadata_logger = MetadataLogger(
            bq_client=self.bq_client.client,
            org_slug=org_slug
        )

        # Initialize notification service
        self.notification_service = get_notification_service(
            config_base_path=Path(settings.config_base_path)
        )

        self.config: Optional[Dict[str, Any]] = None
        self.pipeline_dir: Optional[Path] = None
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status: str = "PENDING"
        self.step_results: List[Dict[str, Any]] = []

        # DAG for step dependencies
        self.step_dag: Dict[str, StepNode] = {}

        # Thread-safe storage for step execution results (keyed by step_id)
        # This replaces the problematic _last_step_result instance variable
        self._step_execution_results: Dict[str, Dict[str, Any]] = {}

    def _close_bq_client(self) -> None:
        """
        Close BigQuery client connection safely (idempotent).
        FIX: Prevents resource leaks and double-close errors.
        """
        if self._bq_client_closed:
            return  # Already closed

        try:
            if hasattr(self, 'bq_client') and self.bq_client:
                if hasattr(self.bq_client, 'client') and self.bq_client.client:
                    self.bq_client.client.close()
                    self._bq_client_closed = True
                    self.logger.debug("BigQuery client closed successfully")
        except Exception as cleanup_error:
            self.logger.error(f"Error closing BigQuery client: {cleanup_error}", exc_info=True)

    async def load_config(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load pipeline configuration from YAML file with Pydantic validation (async).

        Searches recursively for pipeline in cloud-provider/domain structure:
        configs/{org_slug}/{provider}/{domain}/{pipeline_id}.yml

        Args:
            parameters: Runtime parameters to inject into config

        Returns:
            Pipeline configuration dict

        Raises:
            FileNotFoundError: If pipeline config file not found
            ValidationError: If config fails Pydantic validation
            ValueError: If config has invalid YAML or missing required fields
        """
        try:
            # Use ConfigLoader with Pydantic validation
            loop = asyncio.get_event_loop()
            config_loader = get_config_loader()

            # Load and validate config asynchronously
            validated_config: PipelineConfig = await loop.run_in_executor(
                BQ_EXECUTOR,
                config_loader.load_pipeline_config,
                self.org_slug,
                self.pipeline_id
            )

            # Get pipeline directory for resolving relative paths
            config_path_str = settings.find_pipeline_path(self.org_slug, self.pipeline_id)
            self.pipeline_dir = Path(config_path_str).parent

            # Convert Pydantic model to dict for backward compatibility
            config = validated_config.model_dump()

            # Inject runtime parameters
            if parameters:
                config['parameters'] = {**(config.get('parameters', {})), **parameters}

            self.config = config
            self.logger.info(
                f"Loaded and validated pipeline config",
                pipeline_id=self.pipeline_id,
                num_steps=len(config.get('steps', [])),
                pipeline_dir=str(self.pipeline_dir)
            )

            # Build DAG from validated config
            self._build_dag(config.get('steps', []))

            return config

        except ValidationError as e:
            error_msg = f"Pipeline config validation failed for '{self.pipeline_id}': {e}"
            self.logger.error(error_msg, validation_errors=e.errors())
            raise ValueError(error_msg) from e
        except FileNotFoundError as e:
            error_msg = f"Pipeline config not found: {self.pipeline_id}"
            self.logger.error(error_msg)
            raise
        except Exception as e:
            error_msg = f"Error loading pipeline config '{self.pipeline_id}': {e}"
            self.logger.error(error_msg, exc_info=True)
            raise ValueError(error_msg) from e

    def _build_dag(self, steps: List[Dict[str, Any]]) -> None:
        """
        Build DAG from step configurations.

        Sequential by default: If a step has no explicit `depends_on`, it automatically
        depends on the previous step in the list. This ensures steps run sequentially
        unless parallel execution is explicitly configured.

        Args:
            steps: List of step configurations
        """
        # Build DAG from step configurations
        step_ids_in_order = []
        for idx, step in enumerate(steps):
            node = StepNode(step, idx)
            self.step_dag[node.step_id] = node
            step_ids_in_order.append(node.step_id)

        # Add dependencies (implicit or explicit)
        for idx, step_id in enumerate(step_ids_in_order):
            node = self.step_dag[step_id]
            step_config = node.step_config
            
            # CASE 1: Explicit dependencies provided (even if empty list)
            if 'depends_on' in step_config:
                # Use what's provided. If it's [], it means "no dependencies" -> Parallel!
                # Node init already set this from config, so we're good.
                pass
                
            # CASE 2: No depends_on key at all -> Default to Sequential
            # If step has no explicit depends_on key (not even empty list) and is not first,
            # make it depend on the previous step
            elif idx > 0:
                prev_step_id = step_ids_in_order[idx - 1]
                node.dependencies.add(prev_step_id)
                self.logger.debug(
                    f"Step '{step_id}' has no 'depends_on' key, "
                    f"adding implicit dependency on '{prev_step_id}' for sequential execution"
                )

        # Validate all dependencies exist
        for step_id, node in self.step_dag.items():
            for dep_id in node.dependencies:
                if dep_id not in self.step_dag:
                    raise ValueError(f"Step {step_id} depends on unknown step {dep_id}")
                self.step_dag[dep_id].dependents.add(step_id)

        self.logger.info(
            f"Built DAG with {len(self.step_dag)} steps",
            steps=list(self.step_dag.keys())
        )

    def _get_execution_levels(self) -> List[List[str]]:
        """
        Get execution levels for parallel processing.

        Returns:
            List of levels, where each level contains step IDs that can run in parallel
        """
        levels = []
        remaining = set(self.step_dag.keys())
        completed = set()

        while remaining:
            # Find steps with all dependencies completed
            current_level = [
                step_id for step_id in remaining
                if self.step_dag[step_id].dependencies.issubset(completed)
            ]

            if not current_level:
                raise ValueError(f"Circular dependency detected in pipeline DAG")

            levels.append(current_level)
            completed.update(current_level)
            remaining -= set(current_level)

        self.logger.info(
            f"Execution plan: {len(levels)} parallel levels",
            levels=[[step_id for step_id in level] for level in levels]
        )

        return levels

    async def _check_cancellation(self) -> bool:
        """
        Check if pipeline has been cancelled by querying BigQuery.

        Returns:
            True if pipeline should be cancelled, False otherwise

        Raises:
            Exception: Re-raises cancellation as an exception to stop execution
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            # Query current status from BigQuery
            check_query = f"""
            SELECT status
            FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
            WHERE pipeline_logging_id = @pipeline_logging_id
              AND org_slug = @org_slug
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", self.pipeline_logging_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                ]
            )

            loop = asyncio.get_event_loop()

            def run_query():
                job = self.bq_client.client.query(check_query, job_config=job_config)
                return list(job.result())

            rows = await loop.run_in_executor(BQ_EXECUTOR, run_query)

            if rows:
                current_status = rows[0]['status']
                if current_status == 'CANCELLING':
                    self.logger.info(
                        f"Pipeline cancellation detected - stopping execution",
                        pipeline_logging_id=self.pipeline_logging_id,
                        tracking_pipeline_id=self.tracking_pipeline_id
                    )
                    return True

            return False

        except Exception as e:
            # Don't fail the pipeline if cancellation check fails, just log it
            self.logger.warning(
                f"Failed to check cancellation status: {e}",
                pipeline_logging_id=self.pipeline_logging_id,
                exc_info=True
            )
            return False

    async def _update_pipeline_status_to_running(self) -> None:
        """
        Update the existing PENDING pipeline row to RUNNING status.

        The API endpoint creates an initial row with status='PENDING' for concurrency control.
        This method updates that row to 'RUNNING' when actual execution begins.
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            # NOTE: org_meta_pipeline_runs is in CENTRAL organizations dataset, not per-org dataset
            org_pipeline_runs_table = f"{settings.gcp_project_id}.organizations.org_meta_pipeline_runs"

            update_query = f"""
            UPDATE `{org_pipeline_runs_table}`
            SET status = 'RUNNING'
            WHERE pipeline_logging_id = @pipeline_logging_id
              AND org_slug = @org_slug
              AND status = 'PENDING'
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", self.pipeline_logging_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                ]
            )

            # Run update asynchronously
            loop = asyncio.get_event_loop()

            def run_query():
                job = self.bq_client.client.query(update_query, job_config=job_config)
                job.result()  # Wait for completion
                return job  # Return the job object, not the result iterator

            query_job = await loop.run_in_executor(BQ_EXECUTOR, run_query)

            # Check if status update affected any rows
            if query_job.num_dml_affected_rows == 0:
                raise RuntimeError(
                    f"Failed to update pipeline status to RUNNING - no rows affected. "
                    f"Pipeline {self.pipeline_logging_id} may not exist or status is not PENDING."
                )

            self.logger.info(
                f"Updated pipeline status to RUNNING",
                pipeline_logging_id=self.pipeline_logging_id,
                tracking_pipeline_id=self.tracking_pipeline_id
            )

            # Log state transition: PENDING -> RUNNING
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                from_state="PENDING",
                to_state="RUNNING",
                entity_type="PIPELINE",
                entity_name=self.tracking_pipeline_id,
                reason="Pipeline execution started",
                trigger_type=self.trigger_type,
                user_id=self.user_id
            )

            # FIX: Removed double-increment race condition
            # Concurrent counter is already incremented by api-service during validation
            # (see pipelines.py line 452 comment). No need to increment again here.
            # OLD CODE: await self._increment_concurrent_counter()

        except Exception as e:
            # Don't fail the pipeline if status update fails, just log it
            # MEMORY LEAK FIX #28: Background task errors properly logged with exc_info=True
            # Never silently swallow errors - always log with stack traces for debugging
            self.logger.warning(
                f"Failed to update pipeline status to RUNNING: {e}",
                pipeline_logging_id=self.pipeline_logging_id,
                exc_info=True
            )

    async def _increment_concurrent_counter(self) -> None:
        """
        DEPRECATED: This method is no longer used.

        Concurrent counter is now incremented by api-service during validation
        to prevent race conditions. See pipelines.py validate_pipeline_with_api_service().

        Kept for reference only. Do not call this method.

        Old behavior:
        - Incremented concurrent_pipelines_running by 1
        - Updated max_concurrent_reached to maximum value seen
        - Set last_updated to current timestamp
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            # BigQuery UPDATE is atomic: all SET expressions evaluate OLD values first,
            # then apply updates transactionally. This prevents race conditions when
            # multiple pipeline instances increment counters concurrently.
            today = get_utc_date()  # Use UTC date for consistency
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET
                concurrent_pipelines_running = concurrent_pipelines_running + 1,
                max_concurrent_reached = GREATEST(max_concurrent_reached, concurrent_pipelines_running + 1),
                last_updated = CURRENT_TIMESTAMP()
            WHERE
                org_slug = @org_slug
                AND usage_date = @usage_date
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                ]
            )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(update_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Incremented concurrent pipelines counter",
                org_slug=self.org_slug
            )

            # Query current count for Prometheus metric
            query_count = f"""
            SELECT concurrent_pipelines_running
            FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
            WHERE org_slug = @org_slug AND usage_date = @usage_date
            """

            count_result = await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(query_count, job_config=job_config).result()
            )

            for row in count_result:
                set_active_pipelines(self.org_slug, row.concurrent_pipelines_running)
                break

        except Exception as e:
            # MEMORY LEAK FIX #28: Background task errors properly logged
            self.logger.warning(
                f"Failed to increment concurrent pipelines counter: {e}",
                org_slug=self.org_slug,
                exc_info=True
            )

    async def _decrement_concurrent_counter(self) -> None:
        """
        Decrement only the concurrent_pipelines_running counter.

        Used for BLOCKED pipelines where we need to release the quota slot
        without updating success/fail counters since the pipeline never ran.
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            today = get_utc_date()  # Use UTC date for consistency
            decrement_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET
                concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0),
                last_updated = CURRENT_TIMESTAMP()
            WHERE
                org_slug = @org_slug
                AND usage_date = @usage_date
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                ]
            )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(decrement_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Decremented concurrent counter for blocked pipeline",
                org_slug=self.org_slug,
                pipeline_id=self.tracking_pipeline_id
            )

        except Exception as e:
            self.logger.warning(
                f"Failed to decrement concurrent counter: {e}",
                org_slug=self.org_slug,
                exc_info=True
            )

    async def _update_org_usage_quotas(self) -> None:
        """
        Update customer usage quotas after pipeline completion.

        Quotas are tracked at ORG level (not customer/user level).
        All users in an org share the same quota.
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            # Determine which counter to increment based on status
            if self.status == "COMPLETED":
                success_increment = 1
                failed_increment = 0
            elif self.status == "FAILED":
                success_increment = 0
                failed_increment = 1
            elif self.status == "TIMEOUT":
                success_increment = 0
                failed_increment = 1
            else:
                success_increment = 0
                failed_increment = 0

            # Update usage quotas directly by org_slug
            # NOTE: pipelines_run_today and pipelines_run_month are NOT incremented here
            # because api-service's reserve_pipeline_quota_atomic() already incremented them
            # when the pipeline was started. We only update success/fail counters and decrement concurrent.
            today = get_utc_date()  # Use UTC date for consistency
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET
                pipelines_succeeded_today = pipelines_succeeded_today + @success_increment,
                pipelines_failed_today = pipelines_failed_today + @failed_increment,
                concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0),
                last_pipeline_completed_at = CURRENT_TIMESTAMP(),
                last_updated = CURRENT_TIMESTAMP()
            WHERE
                org_slug = @org_slug
                AND usage_date = @usage_date
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                    bigquery.ScalarQueryParameter("success_increment", "INT64", success_increment),
                    bigquery.ScalarQueryParameter("failed_increment", "INT64", failed_increment),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                ]
            )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(update_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Updated customer usage quotas",
                org_slug=self.org_slug,
                status=self.status,
                pipelines_succeeded=success_increment,
                pipelines_failed=failed_increment,
                concurrent_decremented=1
            )

        except Exception as e:
            # MEMORY LEAK FIX #28: Background task errors properly logged
            self.logger.warning(
                f"Failed to update customer usage quotas: {e}",
                org_slug=self.org_slug,
                status=self.status,
                exc_info=True
            )

    async def execute(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute the complete pipeline asynchronously with parallel step execution.

        Uses global semaphore to limit concurrent pipelines across ALL organizations
        for platform-level resource protection (10k+ users).

        Args:
            parameters: Runtime parameters (e.g., date, filters)

        Returns:
            Execution summary
        """
        # Acquire global pipeline semaphore for platform-level concurrency control
        global_semaphore = get_global_pipeline_semaphore()
        async with global_semaphore:
            return await self._execute_with_semaphore(parameters)

    async def _execute_with_semaphore(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Internal execute method wrapped by global semaphore.

        Includes in-memory pipeline lock to prevent duplicate concurrent executions
        of the same pipeline for the same organization.
        """
        # ============================================
        # PIPELINE LOCK: Prevent duplicate concurrent runs
        # ============================================
        # In-memory lock provides fast duplicate detection before any BigQuery operations.
        # This is in ADDITION to the BigQuery atomic INSERT check in the router.
        # Belt-and-suspenders approach for critical data integrity.
        lock_manager = get_pipeline_lock_manager()
        lock_acquired = False

        # Try to acquire lock for this org + pipeline combination
        lock_success, existing_pipeline_id = await lock_manager.acquire_lock(
            org_slug=self.org_slug,
            pipeline_id=self.tracking_pipeline_id,
            pipeline_logging_id=self.pipeline_logging_id,
            locked_by=self.trigger_by
        )

        if not lock_success:
            # Another execution is already running for this org + pipeline
            self.logger.warning(
                f"Pipeline lock not acquired - duplicate execution blocked",
                extra={
                    "org_slug": self.org_slug,
                    "pipeline_id": self.tracking_pipeline_id,
                    "existing_pipeline_logging_id": existing_pipeline_id,
                    "blocked_pipeline_logging_id": self.pipeline_logging_id
                }
            )
            # Return summary indicating blocked execution
            self.status = "BLOCKED"
            self.end_time = datetime.utcnow()

            # Log state transition: PENDING -> BLOCKED
            try:
                await self.metadata_logger.log_state_transition(
                    pipeline_logging_id=self.pipeline_logging_id,
                    from_state="PENDING",
                    to_state="BLOCKED",
                    entity_type="PIPELINE",
                    entity_name=self.tracking_pipeline_id,
                    reason=f"Duplicate execution blocked. Existing pipeline: {existing_pipeline_id}",
                    trigger_type=self.trigger_type,
                    user_id=self.user_id
                )
            except Exception as e:
                self.logger.warning(f"Failed to log BLOCKED state transition: {e}")

            # CRITICAL: Decrement concurrent counter even for BLOCKED pipelines
            # The api-service already incremented it via reserve_pipeline_quota_atomic()
            # before we detected the duplicate, so we must decrement to avoid counter drift.
            try:
                await self._decrement_concurrent_counter()
            except Exception as e:
                self.logger.warning(f"Failed to decrement concurrent counter for BLOCKED pipeline: {e}")

            return {
                "pipeline_logging_id": self.pipeline_logging_id,
                "pipeline_id": self.tracking_pipeline_id,
                "org_slug": self.org_slug,
                "status": "BLOCKED",
                "message": f"Pipeline already running. Existing execution: {existing_pipeline_id}",
                "existing_pipeline_logging_id": existing_pipeline_id,
                "duration_seconds": 0,
                "steps_completed": 0,
                "steps_total": 0
            }

        lock_acquired = True
        self.logger.info(
            f"Pipeline lock acquired",
            extra={
                "org_slug": self.org_slug,
                "pipeline_id": self.tracking_pipeline_id,
                "pipeline_logging_id": self.pipeline_logging_id
            }
        )

        # ============================================
        # TRY BLOCK STARTS IMMEDIATELY AFTER LOCK
        # ============================================
        # CRITICAL: The try block MUST start immediately after lock_acquired = True
        # to ensure the finally block releases the lock even if setup code fails.
        # Any code between lock acquisition and try would leak the lock on exception.

        # Create distributed tracing span
        tracer = get_tracer(__name__) if TRACING_ENABLED else None
        span = None
        error_message = None
        pipeline_error_ctx = None  # Enhanced error context for logging

        try:
            if tracer:
                span = tracer.start_span(
                    f"pipeline.execute",
                    attributes={
                        "pipeline.id": self.tracking_pipeline_id,
                        "pipeline.org_slug": self.org_slug,
                        "pipeline.trigger_type": self.trigger_type
                    }
                )

            self.start_time = datetime.utcnow()
            self.status = "RUNNING"
            # Start metadata logger background workers
            await self.metadata_logger.start()

            # Load configuration
            await self.load_config(parameters)

            # Get pipeline timeout from config (default: 30 minutes)
            timeout_minutes = self.config.get('timeout_minutes', 30)
            timeout_seconds = timeout_minutes * 60

            self.logger.info(
                f"Pipeline timeout configured",
                timeout_minutes=timeout_minutes,
                timeout_seconds=timeout_seconds
            )

            # Wrap entire pipeline execution in timeout
            await asyncio.wait_for(
                self._execute_pipeline_internal(),
                timeout=timeout_seconds
            )

        except asyncio.TimeoutError:
            self.status = "TIMEOUT"
            self.end_time = datetime.utcnow()
            timeout_minutes = self.config.get('timeout_minutes', 30) if self.config else 30
            timeout_seconds = timeout_minutes * 60
            error_message = f"TIMEOUT: Pipeline execution exceeded {timeout_minutes} minutes ({timeout_seconds}s)"
            self.logger.error(
                error_message,
                timeout_minutes=timeout_minutes,
                timeout_seconds=timeout_seconds
            )

            # Log state transition: RUNNING -> TIMEOUT
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                from_state="RUNNING",
                to_state="TIMEOUT",
                entity_type="PIPELINE",
                entity_name=self.tracking_pipeline_id,
                reason=f"Pipeline timed out after {timeout_minutes} minutes",
                error_type="TIMEOUT",
                error_message=error_message,
                duration_in_state_ms=int((self.end_time - self.start_time).total_seconds() * 1000) if self.start_time else None,
                trigger_type=self.trigger_type,
                user_id=self.user_id,
                metadata={
                    "timeout_minutes": timeout_minutes,
                    "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                    "total_steps": len(self.step_dag) if self.step_dag else 0
                }
            )

            # Send timeout notification (treat as failure)
            try:
                await self.notification_service.notify_pipeline_failure(
                    org_slug=self.org_slug,
                    pipeline_id=self.tracking_pipeline_id,
                    pipeline_logging_id=self.pipeline_logging_id,
                    error_message=error_message,
                    details={
                        "trigger_type": self.trigger_type,
                        "trigger_by": self.trigger_by,
                        "timeout_minutes": timeout_minutes,
                        "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                        "total_steps": len(self.step_dag) if self.step_dag else 0
                    }
                )
            except Exception as notification_error:
                self.logger.warning(
                    f"Failed to send pipeline timeout notification: {notification_error}",
                    exc_info=True
                )

            # Cancel all running tasks
            for task in asyncio.all_tasks():
                if task is not asyncio.current_task():
                    task.cancel()
            # Cleanup partial resources on timeout
            self._close_bq_client()

        except ValueError as e:
            # Check if this is a cancellation (raised from _execute_pipeline_internal)
            if "Pipeline cancelled" in str(e):
                # Status already set to CANCELLED in _execute_pipeline_internal
                error_message = str(e)
                self.logger.warning(
                    f"Pipeline cancelled by user: {error_message}",
                    pipeline_logging_id=self.pipeline_logging_id
                )

                # Log state transition: RUNNING -> CANCELLED
                try:
                    await self.metadata_logger.log_state_transition(
                        pipeline_logging_id=self.pipeline_logging_id,
                        from_state="RUNNING",
                        to_state="CANCELLED",
                        entity_type="PIPELINE",
                        entity_name=self.tracking_pipeline_id,
                        reason="Pipeline cancelled by user request",
                        trigger_type=self.trigger_type,
                        user_id=self.user_id,
                        duration_in_state_ms=int((datetime.utcnow() - self.start_time).total_seconds() * 1000) if self.start_time else None,
                        metadata={
                            "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                            "total_steps": len(self.step_dag) if self.step_dag else 0
                        }
                    )
                except Exception as transition_error:
                    self.logger.warning(f"Failed to log CANCELLED state transition: {transition_error}")

                # No notification sent for user-initiated cancellations
                # Cleanup partial resources
                self._close_bq_client()
            else:
                # Regular ValueError - treat as failure
                self.status = "FAILED"
                self.end_time = datetime.utcnow()
                error_message = str(e)

                # Create enhanced error context
                pipeline_error_ctx = create_error_context(
                    exception=e,
                    step_name=None,  # Pipeline-level error
                    retry_count=0,
                    additional_context={}
                )

                self.logger.error(
                    f"Pipeline failed: {e}",
                    error_type=pipeline_error_ctx.get('error_type'),
                    is_retryable=pipeline_error_ctx.get('is_retryable'),
                    exc_info=True
                )

                # Log state transition: RUNNING -> FAILED
                await self.metadata_logger.log_state_transition(
                    pipeline_logging_id=self.pipeline_logging_id,
                    from_state="RUNNING",
                    to_state="FAILED",
                    entity_type="PIPELINE",
                    entity_name=self.tracking_pipeline_id,
                    reason=f"Pipeline failed with {pipeline_error_ctx.get('error_class')}: {str(e)[:200]}",
                    error_type=pipeline_error_ctx.get('error_type'),
                    error_message=error_message,
                    stack_trace=pipeline_error_ctx.get('stack_trace'),
                    retry_count=0,
                    duration_in_state_ms=int((self.end_time - self.start_time).total_seconds() * 1000) if self.start_time else None,
                    trigger_type=self.trigger_type,
                    user_id=self.user_id,
                    metadata={
                        "error_class": pipeline_error_ctx.get('error_class'),
                        "is_retryable": pipeline_error_ctx.get('is_retryable'),
                        "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                        "total_steps": len(self.step_dag) if self.step_dag else 0
                    }
                )

                # Send failure notification
                try:
                    await self.notification_service.notify_pipeline_failure(
                        org_slug=self.org_slug,
                        pipeline_id=self.tracking_pipeline_id,
                        pipeline_logging_id=self.pipeline_logging_id,
                        error_message=error_message,
                        details={
                            "trigger_type": self.trigger_type,
                            "trigger_by": self.trigger_by,
                            "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                            "total_steps": len(self.step_dag) if self.step_dag else 0
                        }
                    )
                except Exception as notification_error:
                    self.logger.warning(
                        f"Failed to send pipeline failure notification: {notification_error}",
                        exc_info=True
                    )

                # Cleanup partial resources on failure
                self._close_bq_client()
                raise

        except Exception as e:
            self.status = "FAILED"
            self.end_time = datetime.utcnow()
            error_message = str(e)

            # Create enhanced error context
            pipeline_error_ctx = create_error_context(
                exception=e,
                step_name=None,  # Pipeline-level error
                retry_count=0,
                additional_context={}
            )

            self.logger.error(
                f"Pipeline failed: {e}",
                error_type=pipeline_error_ctx.get('error_type'),
                is_retryable=pipeline_error_ctx.get('is_retryable'),
                exc_info=True
            )

            # Log state transition: RUNNING -> FAILED
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                from_state="RUNNING",
                to_state="FAILED",
                entity_type="PIPELINE",
                entity_name=self.tracking_pipeline_id,
                reason=f"Pipeline failed with {pipeline_error_ctx.get('error_class')}: {str(e)[:200]}",
                error_type=pipeline_error_ctx.get('error_type'),
                error_message=error_message,
                stack_trace=pipeline_error_ctx.get('stack_trace'),
                retry_count=0,
                duration_in_state_ms=int((self.end_time - self.start_time).total_seconds() * 1000) if self.start_time else None,
                trigger_type=self.trigger_type,
                user_id=self.user_id,
                metadata={
                    "error_class": pipeline_error_ctx.get('error_class'),
                    "is_retryable": pipeline_error_ctx.get('is_retryable'),
                    "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                    "total_steps": len(self.step_dag) if self.step_dag else 0
                }
            )

            # Send failure notification
            try:
                await self.notification_service.notify_pipeline_failure(
                    org_slug=self.org_slug,
                    pipeline_id=self.tracking_pipeline_id,
                    pipeline_logging_id=self.pipeline_logging_id,
                    error_message=error_message,
                    details={
                        "trigger_type": self.trigger_type,
                        "trigger_by": self.trigger_by,
                        "steps_completed": len([s for s in self.step_results if s.get('status') == 'COMPLETED']),
                        "total_steps": len(self.step_dag) if self.step_dag else 0
                    }
                )
            except Exception as notification_error:
                self.logger.warning(
                    f"Failed to send pipeline failure notification: {notification_error}",
                    exc_info=True
                )

            # Cleanup partial resources on failure
            self._close_bq_client()
            raise

        finally:
            try:
                # End distributed tracing span
                if span:
                    span.set_attribute("pipeline.status", self.status)
                    if error_message:
                        span.set_attribute("pipeline.error", error_message)
                    span.end()

                # Record Prometheus metrics
                if self.end_time and self.start_time:
                    duration_seconds = (self.end_time - self.start_time).total_seconds()

                    # Increment execution counter
                    increment_pipeline_execution(
                        org_slug=self.org_slug,
                        pipeline_id=self.tracking_pipeline_id,
                        status=self.status
                    )

                    # Observe duration
                    observe_pipeline_duration(
                        org_slug=self.org_slug,
                        pipeline_id=self.tracking_pipeline_id,
                        status=self.status,
                        duration_seconds=duration_seconds
                    )

                # Log pipeline completion
                if self.end_time:
                    await self.metadata_logger.log_pipeline_end(
                        pipeline_logging_id=self.pipeline_logging_id,
                        pipeline_id=self.tracking_pipeline_id,
                        status=self.status,
                        start_time=self.start_time,
                        trigger_type=self.trigger_type,
                        trigger_by=self.trigger_by,
                        error_message=error_message,
                        error_context=pipeline_error_ctx,
                        parameters=self.config.get('parameters', {}) if self.config else None
                    )

                # Stop metadata logger and flush all pending logs
                await self.metadata_logger.stop()
            except Exception as cleanup_error:
                self.logger.error(f"Error during metadata logger cleanup: {cleanup_error}", exc_info=True)

            # Update customer usage quotas
            try:
                await self._update_org_usage_quotas()
            except Exception as quota_error:
                self.logger.error(f"Error updating customer usage quotas: {quota_error}", exc_info=True)

            # ============================================
            # RELEASE PIPELINE LOCK
            # ============================================
            # Release lock so other requests can run this pipeline for this org.
            # Must be in finally block to ensure release even on exception.
            if lock_acquired:
                try:
                    released = await lock_manager.release_lock(
                        org_slug=self.org_slug,
                        pipeline_id=self.tracking_pipeline_id,
                        pipeline_logging_id=self.pipeline_logging_id
                    )
                    if released:
                        self.logger.info(
                            f"Pipeline lock released",
                            extra={
                                "org_slug": self.org_slug,
                                "pipeline_id": self.tracking_pipeline_id,
                                "pipeline_logging_id": self.pipeline_logging_id,
                                "final_status": self.status
                            }
                        )
                    else:
                        self.logger.warning(
                            f"Pipeline lock release returned False (may have been released by timeout)",
                            extra={
                                "org_slug": self.org_slug,
                                "pipeline_id": self.tracking_pipeline_id,
                                "pipeline_logging_id": self.pipeline_logging_id
                            }
                        )
                except Exception as lock_error:
                    self.logger.error(
                        f"Error releasing pipeline lock: {lock_error}",
                        exc_info=True
                    )

            # FIX: Clean up BigQuery client resources (idempotent)
            # Thread pool cleaned up at app exit via atexit
            self._close_bq_client()

        return self._get_execution_summary()

    async def _execute_pipeline_internal(self) -> None:
        """
        Internal pipeline execution logic (wrapped by timeout in execute()).
        """
        # NOTE: Pipeline start row already inserted by API endpoint with status='PENDING'
        # Update status to RUNNING now that execution has started
        await self._update_pipeline_status_to_running()

        # Get execution levels for parallel processing
        execution_levels = self._get_execution_levels()

        # Execute each level in sequence, but steps within level in parallel
        for level_idx, level_step_ids in enumerate(execution_levels):
            # Check for cancellation before each level
            if await self._check_cancellation():
                self.status = "CANCELLED"
                self.end_time = datetime.utcnow()
                cancellation_msg = f"Pipeline cancelled before level {level_idx + 1}/{len(execution_levels)}"
                self.logger.warning(cancellation_msg)
                raise ValueError(cancellation_msg)

            self.logger.info(
                f"Executing level {level_idx + 1}/{len(execution_levels)}",
                step_count=len(level_step_ids),
                steps=level_step_ids
            )

            # Execute all steps in this level concurrently
            step_tasks = [
                self._execute_step_async(
                    self.step_dag[step_id].step_config,
                    self.step_dag[step_id].step_index
                )
                for step_id in level_step_ids
            ]

            # Wait for all steps in this level to complete
            # Use return_exceptions=True to collect all results without cancelling other tasks
            results = await asyncio.gather(*step_tasks, return_exceptions=True)

            # Check for failures and aggregate errors
            failed_steps = []
            continued_steps = []  # Steps that failed but have on_failure: continue
            for idx, (step_id, result) in enumerate(zip(level_step_ids, results)):
                if isinstance(result, Exception):
                    # Check if step has on_failure: continue
                    step_config = self.step_dag[step_id].step_config
                    on_failure = step_config.get('on_failure', 'stop')

                    if on_failure == 'continue':
                        # Log warning but don't fail pipeline
                        continued_steps.append({
                            'step_id': step_id,
                            'error': str(result),
                            'exception_type': type(result).__name__
                        })
                        self.logger.warning(
                            f"Step {step_id} failed in level {level_idx + 1} but on_failure=continue, continuing pipeline",
                            extra={"error": str(result), "exception_type": type(result).__name__, "on_failure": "continue"}
                        )
                    else:
                        failed_steps.append({
                            'step_id': step_id,
                            'error': str(result),
                            'exception_type': type(result).__name__
                        })
                        self.logger.error(
                            f"Step {step_id} failed in level {level_idx + 1}",
                            extra={"error": str(result), "exception_type": type(result).__name__}
                        )

            # If any steps failed (without on_failure: continue), raise aggregated error
            if failed_steps:
                error_summary = "; ".join([f"{s['step_id']}: {s['error']}" for s in failed_steps])
                raise ValueError(
                    f"{len(failed_steps)} step(s) failed in level {level_idx + 1}: {error_summary}"
                )

            # Log continued steps info
            if continued_steps:
                self.logger.info(
                    f"Level {level_idx + 1}: {len(continued_steps)} step(s) failed but continued (on_failure=continue)"
                )

            self.logger.info(f"Completed level {level_idx + 1}/{len(execution_levels)}")

        # All steps completed
        self.status = "COMPLETED"
        self.end_time = datetime.utcnow()

        self.logger.info("Pipeline completed successfully")

        # Log state transition: RUNNING -> COMPLETED
        await self.metadata_logger.log_state_transition(
            pipeline_logging_id=self.pipeline_logging_id,
            from_state="RUNNING",
            to_state="COMPLETED",
            entity_type="PIPELINE",
            entity_name=self.tracking_pipeline_id,
            reason="All pipeline steps completed successfully",
            duration_in_state_ms=int((self.end_time - self.start_time).total_seconds() * 1000),
            trigger_type=self.trigger_type,
            user_id=self.user_id,
            metadata={
                "steps_completed": len(self.step_results),
                "total_steps": len(self.step_dag)
            }
        )

    async def _execute_step_async(self, step_config: Dict[str, Any], step_index: int) -> None:
        """
        Execute a single pipeline step asynchronously with timeout.

        Args:
            step_config: Step configuration from YAML
            step_index: Step position in pipeline (0-indexed)
        """
        step_id = step_config['step_id']
        step_type = step_config.get('ps_type', step_config.get('type', 'unknown'))

        # Create distributed tracing span for step
        tracer = get_tracer(__name__) if TRACING_ENABLED else None
        step_span = None

        if tracer:
            step_span = tracer.start_span(
                f"pipeline.step.{step_id}",
                attributes={
                    "step.id": step_id,
                    "step.type": step_type,
                    "step.index": step_index,
                    "pipeline.id": self.tracking_pipeline_id,
                    "org.slug": self.org_slug
                }
            )

        # Create unique step logging ID
        step_logging_id = str(uuid.uuid4())

        # Get step timeout from config (default: 10 minutes)
        step_timeout_minutes = step_config.get('timeout_minutes', 10)
        step_timeout_seconds = step_timeout_minutes * 60

        self.logger.info(
            f"Starting step: {step_id}",
            step_type=step_type,
            timeout_minutes=step_timeout_minutes,
            timeout_seconds=step_timeout_seconds
        )

        step_start = datetime.utcnow()
        step_status = "RUNNING"
        rows_processed = None
        error_message = None
        step_metadata = {}
        error_ctx = None  # Will be populated on failure

        try:
            # Log step start
            await self.metadata_logger.log_step_start(
                step_logging_id=step_logging_id,
                pipeline_logging_id=self.pipeline_logging_id,
                step_name=step_id,
                step_type=step_type,
                step_index=step_index,
                metadata=step_config.get('metadata', {}),
                user_id=self.user_id
            )

            # Log state transition: PENDING -> RUNNING
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                step_logging_id=step_logging_id,
                from_state="PENDING",
                to_state="RUNNING",
                entity_type="STEP",
                entity_name=step_id,
                reason="Step execution started",
                trigger_type=self.trigger_type,
                user_id=self.user_id
            )

            # Wrap step execution in timeout and capture result
            result = await asyncio.wait_for(
                self._execute_step_internal(step_config, step_id, step_type),
                timeout=step_timeout_seconds
            )

            # FIX: Check processor result status - processors may return {"status": "FAILED", "error": "..."}
            # instead of raising exceptions (e.g., procedure_executor.py catches BigQuery errors)
            # NOTE: Some processors (like external_bq_extractor) return a list of rows, not a dict
            if isinstance(result, dict):
                processor_status = result.get('status', 'SUCCESS')
            else:
                # Result is a list or other type - assume success if no exception was raised
                processor_status = 'SUCCESS'
            if processor_status == "FAILED":
                # Processor reported failure - extract error and fail the step
                error_message = result.get('error', 'Unknown error from processor')
                error_type = result.get('error_type', 'ProcessorError')
                self.logger.error(
                    f"Processor reported failure for step {step_id}",
                    extra={
                        "error": error_message,
                        "error_type": error_type,
                        "processor_result": result
                    }
                )
                # Raise exception to trigger step failure handling
                raise ValueError(f"Processor failed: {error_message}")

            if step_type == "gcp.bq_etl":
                # bq_etl processor returns 'rows_processed', fallback to 'rows_written' for compatibility
                rows_processed = result.get('rows_processed') or result.get('rows_written', 0)
                step_metadata = {
                    'destination_table': result.get('destination_table'),
                    'bytes_processed': result.get('bytes_processed'),
                    'job_id': result.get('job_id'),
                    'bytes_billed': result.get('bytes_billed'),
                    'cache_hit': result.get('cache_hit')
                }
            elif step_type == "data_quality":
                step_metadata = result

            step_status = "COMPLETED"
            self.logger.info(f"Completed step: {step_id}")

            # Log state transition: RUNNING -> COMPLETED
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                step_logging_id=step_logging_id,
                from_state="RUNNING",
                to_state="COMPLETED",
                entity_type="STEP",
                entity_name=step_id,
                reason="Step completed successfully",
                duration_in_state_ms=int((datetime.utcnow() - step_start).total_seconds() * 1000),
                trigger_type=self.trigger_type,
                user_id=self.user_id,
                metadata={"rows_processed": rows_processed} if rows_processed else None
            )

        except asyncio.TimeoutError as e:
            step_status = "FAILED"
            error_message = f"TIMEOUT: Step execution exceeded {step_timeout_minutes} minutes ({step_timeout_seconds}s)"

            # Create enhanced error context
            error_ctx = create_error_context(
                exception=e,
                step_name=step_id,
                retry_count=0,  # TODO: Implement retry logic
                additional_context={
                    "timeout_minutes": step_timeout_minutes,
                    "timeout_seconds": step_timeout_seconds
                }
            )
            step_metadata['error_context'] = error_ctx

            self.logger.error(
                f"Step {step_id} timed out",
                timeout_minutes=step_timeout_minutes,
                timeout_seconds=step_timeout_seconds,
                error_type=error_ctx.get('error_type')
            )

            # Log state transition: RUNNING -> FAILED (timeout)
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                step_logging_id=step_logging_id,
                from_state="RUNNING",
                to_state="FAILED",
                entity_type="STEP",
                entity_name=step_id,
                reason=f"Step timed out after {step_timeout_minutes} minutes",
                error_type=error_ctx.get('error_type'),
                error_message=error_message,
                stack_trace=error_ctx.get('stack_trace'),
                retry_count=0,
                duration_in_state_ms=int((datetime.utcnow() - step_start).total_seconds() * 1000),
                trigger_type=self.trigger_type,
                user_id=self.user_id
            )

            raise

        except Exception as e:
            step_status = "FAILED"
            error_message = str(e)

            # Create enhanced error context with classification
            error_ctx = create_error_context(
                exception=e,
                step_name=step_id,
                retry_count=0,  # TODO: Implement retry logic
                additional_context={}
            )
            step_metadata['error_context'] = error_ctx

            self.logger.error(
                f"Step {step_id} failed: {e}",
                error_type=error_ctx.get('error_type'),
                is_retryable=error_ctx.get('is_retryable'),
                exc_info=True
            )

            # Log state transition: RUNNING -> FAILED
            await self.metadata_logger.log_state_transition(
                pipeline_logging_id=self.pipeline_logging_id,
                step_logging_id=step_logging_id,
                from_state="RUNNING",
                to_state="FAILED",
                entity_type="STEP",
                entity_name=step_id,
                reason=f"Step failed with {error_ctx.get('error_class')}: {error_message[:200]}",
                error_type=error_ctx.get('error_type'),
                error_message=error_message,
                stack_trace=error_ctx.get('stack_trace'),
                retry_count=0,
                duration_in_state_ms=int((datetime.utcnow() - step_start).total_seconds() * 1000),
                trigger_type=self.trigger_type,
                user_id=self.user_id,
                metadata={
                    "error_class": error_ctx.get('error_class'),
                    "is_retryable": error_ctx.get('is_retryable')
                }
            )

            raise

        finally:
            step_end = datetime.utcnow()

            # End distributed tracing span for step
            if step_span:
                step_span.set_attribute("step.status", step_status)
                if rows_processed:
                    step_span.set_attribute("step.rows_processed", rows_processed)
                if error_message:
                    step_span.set_attribute("step.error", error_message)
                step_span.end()

            # Log step completion
            await self.metadata_logger.log_step_end(
                step_logging_id=step_logging_id,
                pipeline_logging_id=self.pipeline_logging_id,
                step_name=step_id,
                step_type=step_type,
                step_index=step_index,
                status=step_status,
                start_time=step_start,
                rows_processed=rows_processed,
                error_message=error_message,
                metadata=step_metadata,
                user_id=self.user_id,
                error_context=error_ctx
            )

            # Track step results for summary
            self.step_results.append({
                'step_logging_id': step_logging_id,
                'step_id': step_id,
                'step_type': step_type,
                'status': step_status,
                'start_time': step_start,
                'end_time': step_end,
                'duration_ms': int((step_end - step_start).total_seconds() * 1000),
                'rows_processed': rows_processed
            })

    async def _execute_step_internal(self, step_config: Dict[str, Any], step_id: str, step_type: str) -> Dict[str, Any]:
        """
        Internal step execution logic (wrapped by timeout in _execute_step_async()).

        Args:
            step_config: Step configuration from YAML
            step_id: Step identifier
            step_type: Step type (e.g., "gcp.bq_etl", "setup.organizations.onboarding")

        Returns:
            Step execution result dictionary
        """
        # Execute step using dynamic engine loading
        try:
            # Convert ps_type (e.g., "customer.onboarding") to module path (e.g., "src.core.processors.customer.onboarding")
            module_name = f"src.core.processors.{step_type.replace('.', '.')}"

            # Dynamically import the engine module
            engine_module = importlib.import_module(module_name)

            # Get the engine instance
            engine = engine_module.get_engine()

            # Execute the engine with step config and context
            # IMPORTANT: Merge variables/parameters first, then set core context values
            # This ensures org_slug from authentication always takes precedence over
            # template placeholders like "{org_slug}" in YAML variables section
            context = {}

            # Merge pipeline-level variables and parameters first
            if "variables" in self.config:
                context.update(self.config["variables"])
            if "parameters" in self.config:
                context.update(self.config["parameters"])

            # CRITICAL FIX: Merge results from dependency steps into context
            # This ensures outputs from previous steps (like start_date, end_date) are available
            # to dependent steps (e.g., calculate_costs depends_on extract_usage)
            depends_on = step_config.get('depends_on', [])
            for dep_step_id in depends_on:
                if dep_step_id in self._step_execution_results:
                    dep_result = self._step_execution_results[dep_step_id]
                    # Merge selected keys from dependency output into context
                    # These are commonly needed by downstream processors
                    for key in ['start_date', 'end_date', 'date', 'provider', 'credential_id',
                                'rows_processed', 'rows_written', 'output_table', 'dataset_id']:
                        if key in dep_result and key not in context:
                            context[key] = dep_result[key]
                    # Also merge any context key explicitly prefixed with 'output_'
                    for key, value in dep_result.items():
                        if key.startswith('output_') and key not in context:
                            context[key] = value
                    self.logger.debug(
                        f"Merged context from dependency {dep_step_id}",
                        extra={"keys_merged": list(dep_result.keys())}
                    )

            # Set core context values LAST to ensure they override any template placeholders
            context["org_slug"] = self.org_slug
            context["pipeline_id"] = self.pipeline_id
            context["step_id"] = step_id
            context["run_id"] = self.pipeline_logging_id  # For lineage tracking (x_run_id)
            # ENV-001 FIX: Add environment suffix for dataset naming ({org_slug}_{environment})
            # Maps: development->local, staging->stage, production->prod
            context["environment"] = settings.get_environment_suffix()
            # Add GCP project ID for BigQuery dataset references
            context["gcp_project_id"] = settings.gcp_project_id

            # PIPE-002 FIX: Add x_* metadata fields required by BQ loader
            # These are used for pipeline lineage tracking in cost tables
            context["x_pipeline_id"] = self.pipeline_id
            context["x_run_id"] = self.pipeline_logging_id
            # x_credential_id comes from step config or default
            if "credential_id" not in context:
                context["credential_id"] = context.get("x_credential_id", "default")
            # x_pipeline_run_date from parameters or current date
            if "x_pipeline_run_date" not in context:
                from datetime import datetime
                context["x_pipeline_run_date"] = context.get("start_date") or datetime.utcnow().date().isoformat()

            result = await engine.execute(step_config, context)

        except ModuleNotFoundError:
            raise ValueError(f"Engine not found for step type: {step_type}. Module: {module_name}")
        except AttributeError:
            raise ValueError(f"Engine module {module_name} does not have get_engine() function")
        except Exception as e:
            raise ValueError(f"Error executing engine for step type {step_type}: {str(e)}")

        # Store result in thread-safe dictionary keyed by step_id
        self._step_execution_results[step_id] = result

        return result


    def _get_execution_summary(self) -> Dict[str, Any]:
        """
        Get execution summary.

        Returns:
            Summary dict with tracking_pipeline_id matching database records
        """
        duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000) if self.end_time and self.start_time else None

        return {
            'pipeline_logging_id': self.pipeline_logging_id,
            'pipeline_id': self.tracking_pipeline_id,  # Use tracking ID for consistency with DB
            'org_slug': self.org_slug,
            'status': self.status,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration_ms': duration_ms,
            'steps': self.step_results
        }
