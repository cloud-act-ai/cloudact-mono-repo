"""
Pipeline Executor (DEPRECATED - Use AsyncPipelineExecutor)
Orchestrates multi-step pipelines with data quality validation.

DEPRECATION WARNING:
This synchronous executor is deprecated. Please use AsyncPipelineExecutor instead.
AsyncPipelineExecutor provides:
- True async/await architecture for non-blocking operations
- Parallel execution of independent pipeline steps
- DAG-based dependency resolution
- Better resource utilization and throughput
- Support for 100+ concurrent pipelines

Migration Guide:
    OLD: from src.core.pipeline.executor import PipelineExecutor
    NEW: from src.core.pipeline.async_executor import AsyncPipelineExecutor

    OR: from src.core.pipeline import AsyncPipelineExecutor  # Recommended
"""

import yaml
import uuid
import asyncio
import importlib
import warnings
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
from src.core.metadata import MetadataLogger
from src.app.config import settings
from src.core.abstractor.config_loader import get_config_loader
from src.core.abstractor.models import PipelineConfig
from pydantic import ValidationError


class PipelineExecutor:
    """
    Execute multi-step data pipelines with orchestration and DQ validation.
    """

    def __init__(
        self,
        org_slug: str,
        pipeline_id: str,
        trigger_type: str = "api",
        trigger_by: str = "api_user",
        user_id: Optional[str] = None,
        org_api_key_id: Optional[str] = None
    ):
        """
        Initialize pipeline executor.

        DEPRECATED: Use AsyncPipelineExecutor instead for better performance and scalability.

        Args:
            org_slug: Organization identifier
            pipeline_id: Pipeline identifier (matches YAML filename)
            trigger_type: How pipeline was triggered (api, scheduler, manual)
            trigger_by: Who triggered the pipeline
            user_id: User UUID from frontend (X-User-ID header)
            org_api_key_id: API key ID used for authentication (for audit trail)
        """
        # Issue deprecation warning
        warnings.warn(
            "PipelineExecutor is deprecated. Use AsyncPipelineExecutor instead for better "
            "performance, parallel execution, and support for 100+ concurrent pipelines. "
            "See migration guide in module docstring.",
            DeprecationWarning,
            stacklevel=2
        )
        self.org_slug = org_slug
        self.pipeline_id = pipeline_id
        self.trigger_type = trigger_type
        self.trigger_by = trigger_by
        self.user_id = user_id
        self.org_api_key_id = org_api_key_id
        self.pipeline_logging_id = str(uuid.uuid4())

        self.bq_client = get_bigquery_client()
        self.dq_validator = DataQualityValidator()
        self.logger = create_structured_logger(
            __name__,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            pipeline_logging_id=self.pipeline_logging_id
        )

        # Initialize metadata logger
        self.metadata_logger = MetadataLogger(
            bq_client=self.bq_client.client,
            org_slug=org_slug
        )

        self.config: Optional[Dict[str, Any]] = None
        self.pipeline_dir: Optional[Path] = None
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status: str = "PENDING"
        self.step_results: List[Dict[str, Any]] = []

    def _run_async(self, coro):
        """
        Helper method to run async coroutines in sync context.

        Args:
            coro: Coroutine to execute

        Returns:
            Result of the coroutine
        """
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(coro)

    def _load_engine(self, ps_type: str):
        """
        Dynamically load engine for given ps_type.

        Args:
            ps_type: Pipeline step type with provider prefix (e.g., "gcp.bq_etl", "notify_systems.email_notification")

        Returns:
            Engine instance with execute() method

        Raises:
            ImportError: If engine module cannot be loaded
            AttributeError: If engine doesn't have get_engine() function
        """
        # Convert ps_type to module path
        # "gcp.bq_etl" -> "src.core.processors.gcp.bq_etl"
        # "notify_systems.email_notification" -> "src.core.processors.notify_systems.email_notification"
        module_name = f"src.core.processors.{ps_type}"

        try:
            # Dynamically import engine module
            engine_module = importlib.import_module(module_name)

            # Get engine instance from get_engine() factory function
            if not hasattr(engine_module, 'get_engine'):
                raise AttributeError(f"Engine module {module_name} must have get_engine() function")

            engine = engine_module.get_engine()
            self.logger.info(f"Loaded engine for ps_type: {ps_type}", module=module_name)

            return engine

        except ImportError as e:
            self.logger.error(f"Failed to import engine for ps_type: {ps_type}", error=str(e))
            raise ImportError(f"No engine found for ps_type '{ps_type}'. "
                              f"Expected module at {module_name}") from e

    def load_config(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load pipeline configuration from YAML file with Pydantic validation.

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
            config_loader = get_config_loader()

            # Load and validate config
            validated_config: PipelineConfig = config_loader.load_pipeline_config(
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

    def execute(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute the complete pipeline.

        Args:
            parameters: Runtime parameters (e.g., date, filters)

        Returns:
            Execution summary
        """
        self.start_time = datetime.utcnow()
        self.status = "RUNNING"
        error_message = None

        try:
            # Start metadata logger background workers
            self._run_async(self.metadata_logger.start())

            # Load configuration
            self.load_config(parameters)

            # Log pipeline start using metadata logger (async)
            self._run_async(
                self.metadata_logger.log_pipeline_start(
                    pipeline_logging_id=self.pipeline_logging_id,
                    pipeline_id=self.pipeline_id,
                    trigger_type=self.trigger_type,
                    trigger_by=self.trigger_by,
                    parameters=self.config.get('parameters', {}),
                    org_api_key_id=self.org_api_key_id,
                    user_id=self.user_id
                )
            )

            # Execute steps sequentially
            for step_index, step in enumerate(self.config.get('steps', [])):
                self._execute_step(step, step_index)

            # All steps completed
            self.status = "COMPLETED"
            self.end_time = datetime.utcnow()

            self.logger.info("Pipeline completed successfully")

        except Exception as e:
            self.status = "FAILED"
            self.end_time = datetime.utcnow()
            error_message = str(e)
            self.logger.error(f"Pipeline failed: {e}", exc_info=True)
            raise

        finally:
            try:
                # Log pipeline completion using metadata logger (async)
                if self.end_time:
                    self._run_async(
                        self.metadata_logger.log_pipeline_end(
                            pipeline_logging_id=self.pipeline_logging_id,
                            pipeline_id=self.pipeline_id,
                            status=self.status,
                            start_time=self.start_time,
                            trigger_type=self.trigger_type,
                            trigger_by=self.trigger_by,
                            error_message=error_message,
                            parameters=self.config.get('parameters', {}) if self.config else None
                        )
                    )

                # Stop metadata logger and flush all pending logs (async)
                self._run_async(self.metadata_logger.stop())
            except Exception as cleanup_error:
                self.logger.error(f"Error during metadata logger cleanup: {cleanup_error}", exc_info=True)

            # Clean up BigQuery client resources
            try:
                if hasattr(self, 'bq_client') and self.bq_client:
                    if hasattr(self.bq_client, 'client') and self.bq_client.client:
                        self.bq_client.client.close()
                        self.logger.debug("BigQuery client closed successfully")
            except Exception as cleanup_error:
                self.logger.error(f"Error closing BigQuery client: {cleanup_error}", exc_info=True)

        return self._get_execution_summary()

    def _execute_step(self, step_config: Dict[str, Any], step_index: int) -> None:
        """
        Execute a single pipeline step with metadata logging using dynamic engine loading.

        Args:
            step_config: Step configuration from YAML
            step_index: Step position in pipeline (0-indexed)
        """
        step_id = step_config['step_id']
        # Use ps_type instead of type (backward compatible - falls back to type if ps_type not found)
        ps_type = step_config.get('ps_type', step_config.get('type'))

        if not ps_type:
            raise ValueError(f"Step {step_id} must have 'ps_type' field defined")

        # Create unique step logging ID
        step_logging_id = str(uuid.uuid4())

        self.logger.info(f"Starting step: {step_id}", ps_type=ps_type)

        step_start = datetime.utcnow()
        step_status = "RUNNING"
        rows_processed = None
        error_message = None
        step_metadata = {}

        try:
            # Log step start (async)
            self._run_async(
                self.metadata_logger.log_step_start(
                    step_logging_id=step_logging_id,
                    pipeline_logging_id=self.pipeline_logging_id,
                    step_name=step_id,
                    step_type=ps_type,
                    step_index=step_index,
                    metadata=step_config.get('metadata', {})
                )
            )

            # Build execution context
            # Include both pipeline-level variables and runtime parameters
            context = {
                'org_slug': self.org_slug,
                'pipeline_id': self.pipeline_id,
                'pipeline_logging_id': self.pipeline_logging_id,
                'step_logging_id': step_logging_id,
                'step_index': step_index,
                'pipeline_status': self.status,
                'parameters': self.config.get('parameters', {}),
                # Add pipeline-level variables for variable substitution in queries
                **self.config.get('variables', {})
            }

            # Load engine dynamically based on ps_type
            engine = self._load_engine(ps_type)

            # Execute step using engine
            self.logger.info(f"Executing step with engine: {ps_type}")
            result = self._run_async(engine.execute(step_config, context))

            # Extract metrics from result
            rows_processed = result.get('rows_processed', result.get('rows_written', 0))
            step_metadata = result

            step_status = "COMPLETED"
            self.logger.info(f"Completed step: {step_id}", result=result)

        except Exception as e:
            step_status = "FAILED"
            error_message = str(e)
            self.logger.error(f"Step {step_id} failed: {e}", exc_info=True)

            # Update context with error for notification steps
            if hasattr(self, '_error_context'):
                self._error_context = {
                    'error_message': error_message,
                    'failed_step': step_id,
                    'pipeline_status': 'FAILED'
                }

            raise

        finally:
            step_end = datetime.utcnow()

            # Log step completion (async)
            self._run_async(
                self.metadata_logger.log_step_end(
                    step_logging_id=step_logging_id,
                    pipeline_logging_id=self.pipeline_logging_id,
                    step_name=step_id,
                    step_type=ps_type,
                    step_index=step_index,
                    status=step_status,
                    start_time=step_start,
                    rows_processed=rows_processed,
                    error_message=error_message,
                    metadata=step_metadata
                )
            )

            # Track step results for summary
            self.step_results.append({
                'step_logging_id': step_logging_id,
                'step_id': step_id,
                'ps_type': ps_type,
                'status': step_status,
                'start_time': step_start,
                'end_time': step_end,
                'duration_ms': int((step_end - step_start).total_seconds() * 1000),
                'rows_processed': rows_processed
            })

    def _render_query(self, query_template: str) -> str:
        """
        Render query template with runtime parameters.

        Args:
            query_template: SQL query with placeholders

        Returns:
            Rendered query
        """
        parameters = self.config.get('parameters', {})

        # Replace template variables
        query = query_template

        # Replace @parameter with actual values for BigQuery parameters
        for key, value in parameters.items():
            query = query.replace(f"@{key}", f"'{value}'")

        # Replace {project_id}, {dataset} for table references
        query = query.replace("{project_id}", settings.gcp_project_id)

        # Replace dataset references dynamically for all configured dataset types
        for dataset_type in settings.get_dataset_type_names():
            dataset_name = settings.get_org_dataset_name(self.org_slug, dataset_type)
            query = query.replace(f"{{dataset_{dataset_type}}}", dataset_name)

        # Generic replacement for {dataset} placeholder (use first match if any)
        if "{dataset}" in query and settings.get_dataset_type_names():
            first_dataset = settings.get_dataset_type_names()[0]
            dataset_name = settings.get_org_dataset_name(self.org_slug, first_dataset)
            query = query.replace(f"{{dataset}}", dataset_name)

        return query


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
            'org_slug': self.org_slug,
            'status': self.status,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration_ms': duration_ms,
            'steps': self.step_results
        }
