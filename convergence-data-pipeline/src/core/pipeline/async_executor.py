"""
Async Pipeline Executor - Petabyte-Scale Parallel Processing
Orchestrates multi-step pipelines with async/await and parallel execution.
"""

import yaml
import uuid
import asyncio
import importlib
import traceback
import atexit
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
from src.core.metadata import MetadataLogger
from src.app.config import settings
from src.core.abstractor.config_loader import get_config_loader
from src.core.abstractor.models import PipelineConfig
from src.core.observability.metrics import (
    increment_pipeline_execution,
    observe_pipeline_duration,
    set_active_pipelines
)
from pydantic import ValidationError

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
# Dedicated Thread Pool for BigQuery Operations
# ============================================
# Create module-level thread pool with 200 workers for 10k tenant scale
# This prevents thread exhaustion when running 100+ concurrent pipelines
BQ_EXECUTOR = ThreadPoolExecutor(
    max_workers=200,
    thread_name_prefix="bq_worker"
)

def _shutdown_bq_executor():
    """Shutdown thread pool on application exit."""
    BQ_EXECUTOR.shutdown(wait=True)

# Register cleanup handler
atexit.register(_shutdown_bq_executor)


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

    def __init__(
        self,
        tenant_id: str,
        pipeline_id: str,
        trigger_type: str = "api",
        trigger_by: str = "api_user",
        tracking_pipeline_id: Optional[str] = None,
        pipeline_logging_id: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """
        Initialize async pipeline executor.

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier (matches YAML filename for config lookup)
            trigger_type: How pipeline was triggered (api, scheduler, manual)
            trigger_by: Who triggered the pipeline
            tracking_pipeline_id: Full tracking ID for database logging (e.g., tenant-provider-domain-template)
                                  If not provided, defaults to pipeline_id
            pipeline_logging_id: Pre-generated logging ID for this run
                                If not provided, generates a new UUID
            user_id: User UUID from frontend (X-User-ID header)
        """
        self.tenant_id = tenant_id
        self.pipeline_id = pipeline_id
        self.trigger_type = trigger_type
        self.trigger_by = trigger_by
        self.tracking_pipeline_id = tracking_pipeline_id or pipeline_id
        self.pipeline_logging_id = pipeline_logging_id or str(uuid.uuid4())
        self.user_id = user_id

        self.bq_client = get_bigquery_client()
        self.dq_validator = DataQualityValidator()
        self.logger = create_structured_logger(
            __name__,
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=self.pipeline_logging_id
        )

        # Initialize metadata logger (already async)
        self.metadata_logger = MetadataLogger(
            bq_client=self.bq_client.client,
            tenant_id=tenant_id
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

    async def load_config(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load pipeline configuration from YAML file with Pydantic validation (async).

        Searches recursively for pipeline in cloud-provider/domain structure:
        configs/{tenant_id}/{provider}/{domain}/{pipeline_id}.yml

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
                self.tenant_id,
                self.pipeline_id
            )

            # Get pipeline directory for resolving relative paths
            config_path_str = settings.find_pipeline_path(self.tenant_id, self.pipeline_id)
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

        Args:
            steps: List of step configurations
        """
        # Create nodes
        for idx, step in enumerate(steps):
            node = StepNode(step, idx)
            self.step_dag[node.step_id] = node

        # Build dependency relationships
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

    async def _update_pipeline_status_to_running(self) -> None:
        """
        Update the existing PENDING pipeline row to RUNNING status.

        The API endpoint creates an initial row with status='PENDING' for concurrency control.
        This method updates that row to 'RUNNING' when actual execution begins.
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            # NOTE: tenant_pipeline_runs is in CENTRAL tenants dataset, not per-tenant dataset
            tenant_pipeline_runs_table = f"{settings.gcp_project_id}.tenants.tenant_pipeline_runs"

            update_query = f"""
            UPDATE `{tenant_pipeline_runs_table}`
            SET status = 'RUNNING'
            WHERE pipeline_logging_id = @pipeline_logging_id
              AND tenant_id = @tenant_id
              AND status = 'PENDING'
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", self.pipeline_logging_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", self.tenant_id),
                ]
            )

            # Run update asynchronously
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(update_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Updated pipeline status to RUNNING",
                pipeline_logging_id=self.pipeline_logging_id,
                tracking_pipeline_id=self.tracking_pipeline_id
            )

            # Increment concurrent counter after successful status update
            await self._increment_concurrent_counter()

        except Exception as e:
            # Don't fail the pipeline if status update fails, just log it
            self.logger.warning(
                f"Failed to update pipeline status to RUNNING: {e}",
                pipeline_logging_id=self.pipeline_logging_id,
                exc_info=True
            )

    async def _increment_concurrent_counter(self) -> None:
        """
        Increment concurrent_pipelines_running counter and update related metrics.

        Updates:
        - concurrent_pipelines_running: Incremented by 1
        - max_concurrent_reached: Updated to maximum value seen
        - last_pipeline_started_at: Set to current timestamp
        """
        from google.cloud import bigquery
        from src.app.config import settings

        try:
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
            SET
                concurrent_pipelines_running = concurrent_pipelines_running + 1,
                max_concurrent_reached = GREATEST(max_concurrent_reached, concurrent_pipelines_running + 1),
                last_pipeline_started_at = CURRENT_TIMESTAMP(),
                last_updated = CURRENT_TIMESTAMP()
            WHERE
                tenant_id = @tenant_id
                AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", self.tenant_id),
                ]
            )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(update_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Incremented concurrent pipelines counter",
                tenant_id=self.tenant_id
            )

            # Query current count for Prometheus metric
            query_count = f"""
            SELECT concurrent_pipelines_running
            FROM `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
            WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE()
            """

            count_result = await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(query_count, job_config=job_config).result()
            )

            for row in count_result:
                set_active_pipelines(self.tenant_id, row.concurrent_pipelines_running)
                break

        except Exception as e:
            self.logger.warning(
                f"Failed to increment concurrent pipelines counter: {e}",
                tenant_id=self.tenant_id,
                exc_info=True
            )

    async def _update_tenant_usage_quotas(self) -> None:
        """
        Update customer usage quotas after pipeline completion.

        Quotas are tracked at TENANT level (not customer/user level).
        All users in a tenant share the same quota.
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
            else:
                success_increment = 0
                failed_increment = 0

            # Update usage quotas directly by tenant_id
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
            SET
                pipelines_run_today = pipelines_run_today + 1,
                pipelines_succeeded_today = pipelines_succeeded_today + @success_increment,
                pipelines_failed_today = pipelines_failed_today + @failed_increment,
                concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0),
                last_pipeline_completed_at = CURRENT_TIMESTAMP(),
                last_updated = CURRENT_TIMESTAMP()
            WHERE
                tenant_id = @tenant_id
                AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", self.tenant_id),
                    bigquery.ScalarQueryParameter("success_increment", "INT64", success_increment),
                    bigquery.ScalarQueryParameter("failed_increment", "INT64", failed_increment),
                ]
            )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                BQ_EXECUTOR,
                lambda: self.bq_client.client.query(update_query, job_config=job_config).result()
            )

            self.logger.info(
                f"Updated customer usage quotas",
                tenant_id=self.tenant_id,
                status=self.status,
                pipelines_run=1,
                pipelines_succeeded=success_increment,
                pipelines_failed=failed_increment
            )

        except Exception as e:
            self.logger.warning(
                f"Failed to update customer usage quotas: {e}",
                tenant_id=self.tenant_id,
                status=self.status,
                exc_info=True
            )

    async def execute(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute the complete pipeline asynchronously with parallel step execution.

        Args:
            parameters: Runtime parameters (e.g., date, filters)

        Returns:
            Execution summary
        """
        # Create distributed tracing span
        tracer = get_tracer(__name__) if TRACING_ENABLED else None
        span = None

        if tracer:
            span = tracer.start_span(
                f"pipeline.execute",
                attributes={
                    "pipeline.id": self.tracking_pipeline_id,
                    "pipeline.tenant_id": self.tenant_id,
                    "pipeline.trigger_type": self.trigger_type
                }
            )

        self.start_time = datetime.utcnow()
        self.status = "RUNNING"
        error_message = None

        try:
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
            self.status = "FAILED"
            self.end_time = datetime.utcnow()
            timeout_minutes = self.config.get('timeout_minutes', 30) if self.config else 30
            timeout_seconds = timeout_minutes * 60
            error_message = f"TIMEOUT: Pipeline execution exceeded {timeout_minutes} minutes ({timeout_seconds}s)"
            self.logger.error(
                error_message,
                timeout_minutes=timeout_minutes,
                timeout_seconds=timeout_seconds
            )

        except Exception as e:
            self.status = "FAILED"
            self.end_time = datetime.utcnow()
            error_message = str(e)
            self.logger.error(f"Pipeline failed: {e}", exc_info=True)
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
                        tenant_id=self.tenant_id,
                        pipeline_id=self.tracking_pipeline_id,
                        status=self.status
                    )

                    # Observe duration
                    observe_pipeline_duration(
                        tenant_id=self.tenant_id,
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
                        parameters=self.config.get('parameters', {}) if self.config else None
                    )

                # Stop metadata logger and flush all pending logs
                await self.metadata_logger.stop()
            except Exception as cleanup_error:
                self.logger.error(f"Error during metadata logger cleanup: {cleanup_error}", exc_info=True)

            # Update customer usage quotas
            try:
                await self._update_tenant_usage_quotas()
            except Exception as quota_error:
                self.logger.error(f"Error updating customer usage quotas: {quota_error}", exc_info=True)

            # Clean up BigQuery client resources
            try:
                if hasattr(self, 'bq_client') and self.bq_client:
                    if hasattr(self.bq_client, 'client') and self.bq_client.client:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(BQ_EXECUTOR, self.bq_client.client.close)
                        self.logger.debug("BigQuery client closed successfully")
            except Exception as cleanup_error:
                self.logger.error(f"Error closing BigQuery client: {cleanup_error}", exc_info=True)

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
            for idx, (step_id, result) in enumerate(zip(level_step_ids, results)):
                if isinstance(result, Exception):
                    failed_steps.append({
                        'step_id': step_id,
                        'error': str(result),
                        'exception_type': type(result).__name__
                    })
                    self.logger.error(
                        f"Step {step_id} failed in level {level_idx + 1}",
                        extra={"error": str(result), "exception_type": type(result).__name__}
                    )

            # If any steps failed, raise aggregated error
            if failed_steps:
                error_summary = "; ".join([f"{s['step_id']}: {s['error']}" for s in failed_steps])
                raise ValueError(
                    f"{len(failed_steps)} step(s) failed in level {level_idx + 1}: {error_summary}"
                )

            self.logger.info(f"Completed level {level_idx + 1}/{len(execution_levels)}")

        # All steps completed
        self.status = "COMPLETED"
        self.end_time = datetime.utcnow()

        self.logger.info("Pipeline completed successfully")

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
                    "tenant.id": self.tenant_id
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

            # Wrap step execution in timeout and capture result
            result = await asyncio.wait_for(
                self._execute_step_internal(step_config, step_id, step_type),
                timeout=step_timeout_seconds
            )

            if step_type == "gcp.bq_etl":
                rows_processed = result.get('rows_written', 0)
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

        except asyncio.TimeoutError:
            step_status = "FAILED"
            error_message = f"TIMEOUT: Step execution exceeded {step_timeout_minutes} minutes ({step_timeout_seconds}s)"
            self.logger.error(
                f"Step {step_id} timed out",
                timeout_minutes=step_timeout_minutes,
                timeout_seconds=step_timeout_seconds
            )
            raise

        except Exception as e:
            step_status = "FAILED"
            error_message = str(e)
            stack_trace = traceback.format_exc()
            if 'stack_trace' not in step_metadata:
                step_metadata['stack_trace'] = stack_trace
            self.logger.error(f"Step {step_id} failed: {e}", exc_info=True)
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
                user_id=self.user_id
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
            step_type: Step type (e.g., "gcp.bq_etl", "setup.tenants.onboarding")

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
            # Include pipeline-level variables in context for template replacement
            context = {
                "tenant_id": self.tenant_id,
                "pipeline_id": self.pipeline_id,
                "step_id": step_id
            }

            # Merge pipeline-level variables and parameters into context
            if "variables" in self.config:
                context.update(self.config["variables"])
            if "parameters" in self.config:
                context.update(self.config["parameters"])

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
            'tenant_id': self.tenant_id,
            'status': self.status,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration_ms': duration_ms,
            'steps': self.step_results
        }
