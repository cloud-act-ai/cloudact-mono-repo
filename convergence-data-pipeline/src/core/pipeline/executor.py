"""
Pipeline Executor
Orchestrates multi-step pipelines with data quality validation.
"""

import yaml
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.pipeline.data_quality import DataQualityValidator
from src.core.utils.logging import create_structured_logger
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

        self.config: Optional[Dict[str, Any]] = None
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status: str = "PENDING"
        self.step_results: List[Dict[str, Any]] = []

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

        try:
            # Load configuration
            self.load_config(parameters)

            # Log pipeline start
            self._log_pipeline_start()

            # Execute steps sequentially
            for step in self.config.get('steps', []):
                self._execute_step(step)

            # All steps completed
            self.status = "COMPLETED"
            self.end_time = datetime.utcnow()

            self.logger.info("Pipeline completed successfully")

        except Exception as e:
            self.status = "FAILED"
            self.end_time = datetime.utcnow()
            self.logger.error(f"Pipeline failed: {e}", exc_info=True)
            raise

        finally:
            # Log pipeline completion
            self._log_pipeline_completion()

        return self._get_execution_summary()

    def _execute_step(self, step_config: Dict[str, Any]) -> None:
        """
        Execute a single pipeline step.

        Args:
            step_config: Step configuration from YAML
        """
        step_id = step_config['step_id']
        step_type = step_config['type']

        self.logger.info(f"Starting step: {step_id}", step_type=step_type)

        step_start = datetime.utcnow()
        step_status = "RUNNING"

        try:
            if step_type == "bigquery_to_bigquery":
                self._execute_bq_to_bq_step(step_config)

            elif step_type == "data_quality":
                self._execute_dq_step(step_config)

            else:
                raise ValueError(f"Unknown step type: {step_type}")

            step_status = "COMPLETED"
            self.logger.info(f"Completed step: {step_id}")

        except Exception as e:
            step_status = "FAILED"
            self.logger.error(f"Step {step_id} failed: {e}", exc_info=True)
            raise

        finally:
            step_end = datetime.utcnow()
            self.step_results.append({
                'step_id': step_id,
                'step_type': step_type,
                'status': step_status,
                'start_time': step_start,
                'end_time': step_end,
                'duration_ms': int((step_end - step_start).total_seconds() * 1000)
            })

    def _execute_bq_to_bq_step(self, step_config: Dict[str, Any]) -> None:
        """
        Execute BigQuery to BigQuery data transfer step using processor.

        Args:
            step_config: Step configuration
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

    def _execute_dq_step(self, step_config: Dict[str, Any]) -> None:
        """
        Execute data quality validation step.

        Args:
            step_config: Step configuration
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

    def _log_pipeline_start(self) -> None:
        """Log pipeline start to BigQuery metadata table."""
        from google.cloud import bigquery

        row = {
            'pipeline_logging_id': self.pipeline_logging_id,
            'pipeline_id': self.pipeline_id,
            'tenant_id': self.tenant_id,
            'status': self.status,
            'trigger_type': self.trigger_type,
            'trigger_by': self.trigger_by,
            'start_time': self.start_time.isoformat(),
            'run_metadata': {
                'config': self.config,
                'parameters': self.config.get('parameters', {})
            },
            'ingestion_date': self.start_time.date().isoformat()
        }

        try:
            table_id = f"{settings.gcp_project_id}.metadata.pipeline_runs"
            errors = self.bq_client.client.insert_rows_json(table_id, [row])

            if errors:
                self.logger.error(f"Failed to log pipeline start: {errors}")
        except Exception as e:
            self.logger.error(f"Error logging pipeline start: {e}")

    def _log_pipeline_completion(self) -> None:
        """Update pipeline status in BigQuery metadata table."""
        from google.cloud import bigquery

        duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000) if self.end_time else None

        # Update the existing row
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.metadata.pipeline_runs`
        SET
            status = @status,
            end_time = @end_time,
            duration_ms = @duration_ms,
            run_metadata = JSON_SET(run_metadata, '$.steps', @steps)
        WHERE pipeline_logging_id = @pipeline_logging_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("status", "STRING", self.status),
                bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", self.end_time),
                bigquery.ScalarQueryParameter("duration_ms", "INT64", duration_ms),
                bigquery.ScalarQueryParameter("steps", "STRING", str(self.step_results)),
                bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", self.pipeline_logging_id),
            ]
        )

        try:
            query_job = self.bq_client.client.query(update_query, job_config=job_config)
            query_job.result()
        except Exception as e:
            self.logger.error(f"Error logging pipeline completion: {e}")

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
