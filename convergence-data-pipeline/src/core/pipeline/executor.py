"""
Pipeline Executor
Orchestrates multi-step pipelines with data quality validation.
"""

import yaml
import uuid
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
from src.core.metadata import MetadataLogger
from src.app.config import settings


class PipelineExecutor:
    """
    Execute multi-step data pipelines with orchestration and DQ validation.
    """

    def __init__(
        self,
        tenant_id: str,
        pipeline_id: str,
        trigger_type: str = "api",
        trigger_by: str = "api_user"
    ):
        """
        Initialize pipeline executor.

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

        # Initialize metadata logger
        self.metadata_logger = MetadataLogger(
            bq_client=self.bq_client.client,
            tenant_id=tenant_id
        )

        self.config: Optional[Dict[str, Any]] = None
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

    def load_config(self, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load pipeline configuration from YAML file.

        Args:
            parameters: Runtime parameters to inject into config

        Returns:
            Pipeline configuration dict
        """
        config_path = Path(settings.get_tenant_pipelines_path(self.tenant_id)) / f"{self.pipeline_id}.yml"

        if not config_path.exists():
            raise FileNotFoundError(f"Pipeline config not found: {config_path}")

        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)

        # Inject runtime parameters
        if parameters:
            config['parameters'] = {**(config.get('parameters', {})), **parameters}

        self.config = config
        self.logger.info(f"Loaded pipeline config", config_path=str(config_path))

        return config

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
            # Load configuration
            self.load_config(parameters)

            # Log pipeline start using metadata logger (async)
            self._run_async(
                self.metadata_logger.log_pipeline_start(
                    pipeline_logging_id=self.pipeline_logging_id,
                    pipeline_id=self.pipeline_id,
                    trigger_type=self.trigger_type,
                    trigger_by=self.trigger_by,
                    parameters=self.config.get('parameters', {})
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

                # Flush all pending logs (async)
                self._run_async(self.metadata_logger.flush())

        return self._get_execution_summary()

    def _execute_step(self, step_config: Dict[str, Any], step_index: int) -> None:
        """
        Execute a single pipeline step with metadata logging.

        Args:
            step_config: Step configuration from YAML
            step_index: Step position in pipeline (0-indexed)
        """
        step_id = step_config['step_id']
        step_type = step_config['type']

        # Create unique step logging ID
        step_logging_id = str(uuid.uuid4())

        self.logger.info(f"Starting step: {step_id}", step_type=step_type)

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
                    step_type=step_type,
                    step_index=step_index,
                    metadata=step_config.get('metadata', {})
                )
            )

            # Execute step based on type
            if step_type == "bigquery_to_bigquery":
                result = self._execute_bq_to_bq_step(step_config)
                rows_processed = result.get('rows_written', 0)
                step_metadata = {
                    'destination_table': result.get('destination_table'),
                    'bytes_processed': result.get('bytes_processed')
                }

            elif step_type == "data_quality":
                result = self._execute_dq_step(step_config)
                step_metadata = result

            else:
                raise ValueError(f"Unknown step type: {step_type}")

            step_status = "COMPLETED"
            self.logger.info(f"Completed step: {step_id}")

        except Exception as e:
            step_status = "FAILED"
            error_message = str(e)
            self.logger.error(f"Step {step_id} failed: {e}", exc_info=True)
            raise

        finally:
            step_end = datetime.utcnow()

            # Log step completion (async)
            self._run_async(
                self.metadata_logger.log_step_end(
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

    def _execute_bq_to_bq_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute BigQuery to BigQuery data transfer step using processor.

        Args:
            step_config: Step configuration

        Returns:
            Execution result with rows_written, destination_table, etc.
        """
        from src.core.pipeline.processors.bq_to_bq import BigQueryToBigQueryProcessor

        # Create processor instance
        processor = BigQueryToBigQueryProcessor(
            step_config=step_config,
            tenant_id=self.tenant_id,
            bq_client=self.bq_client,
            parameters=self.config.get('parameters', {})
        )

        # Execute the processor
        result = processor.execute()

        self.logger.info(
            f"BigQuery to BigQuery step completed",
            extra={
                "step_id": step_config.get('step_id'),
                "rows_written": result['rows_written'],
                "destination": result['destination_table']
            }
        )

        return result

    def _execute_dq_step(self, step_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute data quality validation step.

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

        # Run data quality checks
        results = self.dq_validator.validate_table(
            table_id=table_id,
            dq_config_path=dq_config_path,
            tenant_id=self.tenant_id,
            pipeline_logging_id=self.pipeline_logging_id
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

        # Replace dataset references
        for dataset_type in ['google', 'raw_google', 'silver_cost']:
            dataset_name = settings.get_tenant_dataset_name(self.tenant_id, dataset_type)
            query = query.replace(f"{{dataset_{dataset_type}}}", dataset_name)
            query = query.replace(f"{{dataset}}", dataset_name)  # Generic replacement

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
            'tenant_id': self.tenant_id,
            'status': self.status,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration_ms': duration_ms,
            'steps': self.step_results
        }
