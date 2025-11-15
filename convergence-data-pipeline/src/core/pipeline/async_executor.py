"""
Async Pipeline Executor - Petabyte-Scale Parallel Processing
Orchestrates multi-step pipelines with async/await and parallel execution.
"""

import yaml
import uuid
import asyncio
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from pathlib import Path
from collections import defaultdict

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
from src.core.metadata import MetadataLogger
from src.app.config import settings


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
        trigger_by: str = "api_user"
    ):
        """
        Initialize async pipeline executor.

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier (matches YAML filename)
            trigger_type: How pipeline was triggered (api, scheduler, manual)
            trigger_by: Who triggered the pipeline
        """
        self.tenant_id = tenant_id
        self.pipeline_id = pipeline_id
        self.trigger_type = trigger_type
        self.trigger_by = trigger_by
        self.pipeline_logging_id = str(uuid.uuid4())

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
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status: str = "PENDING"
        self.step_results: List[Dict[str, Any]] = []

        # DAG for step dependencies
        self.step_dag: Dict[str, StepNode] = {}

    async def load_config(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load pipeline configuration from YAML file (async).

        Args:
            parameters: Runtime parameters to inject into config

        Returns:
            Pipeline configuration dict
        """
        config_path = Path(settings.get_tenant_pipelines_path(self.tenant_id)) / f"{self.pipeline_id}.yml"

        if not config_path.exists():
            raise FileNotFoundError(f"Pipeline config not found: {config_path}")

        # Read file asynchronously
        loop = asyncio.get_event_loop()
        config = await loop.run_in_executor(
            None,
            self._read_yaml_file,
            config_path
        )

        # Inject runtime parameters
        if parameters:
            config['parameters'] = {**(config.get('parameters', {})), **parameters}

        self.config = config
        self.logger.info(f"Loaded pipeline config", config_path=str(config_path))

        # Build DAG from config
        self._build_dag(config.get('steps', []))

        return config

    def _read_yaml_file(self, path: Path) -> Dict[str, Any]:
        """Helper to read YAML file (runs in executor)."""
        with open(path, 'r') as f:
            return yaml.safe_load(f)

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

    async def execute(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute the complete pipeline asynchronously with parallel step execution.

        Args:
            parameters: Runtime parameters (e.g., date, filters)

        Returns:
            Execution summary
        """
        self.start_time = datetime.utcnow()
        self.status = "RUNNING"
        error_message = None

        try:
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
            # Log pipeline completion
            if self.end_time:
                await self.metadata_logger.log_pipeline_end(
                    pipeline_logging_id=self.pipeline_logging_id,
                    pipeline_id=self.pipeline_id,
                    status=self.status,
                    start_time=self.start_time,
                    trigger_type=self.trigger_type,
                    trigger_by=self.trigger_by,
                    error_message=error_message,
                    parameters=self.config.get('parameters', {}) if self.config else None
                )

                # Flush all pending logs
                await self.metadata_logger.flush()

        return self._get_execution_summary()

    async def _execute_pipeline_internal(self) -> None:
        """
        Internal pipeline execution logic (wrapped by timeout in execute()).
        """
        # Log pipeline start
        await self.metadata_logger.log_pipeline_start(
            pipeline_logging_id=self.pipeline_logging_id,
            pipeline_id=self.pipeline_id,
            trigger_type=self.trigger_type,
            trigger_by=self.trigger_by,
            parameters=self.config.get('parameters', {})
        )

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
            await asyncio.gather(*step_tasks)

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
        step_type = step_config['type']

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
                metadata=step_config.get('metadata', {})
            )

            # Wrap step execution in timeout
            await asyncio.wait_for(
                self._execute_step_internal(step_config, step_id, step_type),
                timeout=step_timeout_seconds
            )

            # If we get here, step succeeded
            # Get result from the internal execution
            result = getattr(self, '_last_step_result', {})

            if step_type == "bigquery_to_bigquery":
                rows_processed = result.get('rows_written', 0)
                step_metadata = {
                    'destination_table': result.get('destination_table'),
                    'bytes_processed': result.get('bytes_processed')
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
            self.logger.error(f"Step {step_id} failed: {e}", exc_info=True)
            raise

        finally:
            step_end = datetime.utcnow()

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
                metadata=step_metadata
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

    async def _execute_step_internal(self, step_config: Dict[str, Any], step_id: str, step_type: str) -> None:
        """
        Internal step execution logic (wrapped by timeout in _execute_step_async()).

        Args:
            step_config: Step configuration from YAML
            step_id: Step identifier
            step_type: Step type (bigquery_to_bigquery, data_quality, etc.)
        """
        # Execute step based on type
        if step_type == "bigquery_to_bigquery":
            result = await self._execute_bq_to_bq_step_async(step_config)
            self._last_step_result = result

        elif step_type == "data_quality":
            result = await self._execute_dq_step_async(step_config)
            self._last_step_result = result

        else:
            raise ValueError(f"Unknown step type: {step_type}")

    async def _execute_bq_to_bq_step_async(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute BigQuery to BigQuery data transfer step asynchronously.

        Args:
            step_config: Step configuration

        Returns:
            Execution result with rows_written, destination_table, etc.
        """
        from src.core.pipeline.processors.async_bq_to_bq import AsyncBigQueryToBigQueryProcessor

        # Create async processor instance
        processor = AsyncBigQueryToBigQueryProcessor(
            step_config=step_config,
            tenant_id=self.tenant_id,
            bq_client=self.bq_client,
            parameters=self.config.get('parameters', {})
        )

        # Execute the processor asynchronously
        result = await processor.execute()

        self.logger.info(
            f"BigQuery to BigQuery step completed",
            extra={
                "step_id": step_config.get('step_id'),
                "rows_written": result['rows_written'],
                "destination": result['destination_table']
            }
        )

        return result

    async def _execute_dq_step_async(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute data quality validation step asynchronously.

        Args:
            step_config: Step configuration

        Returns:
            DQ validation results with passed/failed counts
        """
        source = step_config['source']
        dq_config_path = step_config['dq_config']
        fail_on_error = step_config.get('fail_on_error', True)

        # Build table reference
        dataset_type = source['dataset_type']
        table_name = source['table']
        dataset_id = self.bq_client.get_tenant_dataset_id(self.tenant_id, dataset_type)
        table_id = f"{dataset_id}.{table_name}"

        # Run data quality checks asynchronously
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            self.dq_validator.validate_table,
            table_id,
            dq_config_path,
            self.tenant_id,
            self.pipeline_logging_id
        )

        # Check if any expectations failed
        failed_count = sum(1 for r in results if not r['success'])
        passed_count = sum(1 for r in results if r['success'])

        if failed_count > 0:
            self.logger.warning(
                f"Data quality check found {failed_count} failed expectations",
                failed_count=failed_count,
                total_count=len(results)
            )

            if fail_on_error:
                raise ValueError(f"Data quality validation failed: {failed_count} expectations failed")
        else:
            self.logger.info("Data quality validation passed", total_checks=len(results))

        return {
            'total_checks': len(results),
            'passed_count': passed_count,
            'failed_count': failed_count,
            'table_id': table_id
        }

    def _get_execution_summary(self) -> Dict[str, Any]:
        """
        Get execution summary.

        Returns:
            Summary dict
        """
        duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000) if self.end_time and self.start_time else None

        return {
            'pipeline_logging_id': self.pipeline_logging_id,
            'pipeline_id': self.pipeline_id,
            'tenant_id': self.tenant_id,
            'status': self.status,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration_ms': duration_ms,
            'steps': self.step_results
        }
