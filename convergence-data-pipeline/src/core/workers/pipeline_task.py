"""
Pipeline Orchestration Worker
Coordinates execution of multi-step pipelines.
"""

import uuid
from typing import Dict, Any, List
from datetime import datetime
import logging
import json

from celery import Task, group, chain

from src.core.workers.celery_app import celery_app
from src.core.abstractor.config_loader import get_config_loader
from src.core.abstractor.models import PipelineConfig, StepType, OnFailure
from src.core.engine.bq_client import get_bigquery_client
from src.core.utils.logging import create_structured_logger

logger = logging.getLogger(__name__)


class PipelineTask(Task):
    """Base pipeline task with error handling."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log pipeline failure."""
        logger.error(
            f"Pipeline task failed",
            task_id=task_id,
            exception=str(exc),
            exc_info=einfo
        )


@celery_app.task(
    bind=True,
    base=PipelineTask,
    name="src.core.workers.pipeline_task.run_pipeline",
    max_retries=0  # Don't retry entire pipelines
)
def run_pipeline(
    self,
    tenant_id: str,
    pipeline_id: str,
    trigger_type: str = "api",
    trigger_by: str = "unknown"
) -> Dict[str, Any]:
    """
    Execute a complete pipeline.

    Args:
        tenant_id: Tenant identifier
        pipeline_id: Pipeline identifier
        trigger_type: How pipeline was triggered (api, scheduler, manual)
        trigger_by: Who/what triggered the pipeline

    Returns:
        Pipeline execution summary
    """
    # Generate unique run ID
    pipeline_logging_id = str(uuid.uuid4())

    # Create structured logger
    task_logger = create_structured_logger(
        __name__,
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        pipeline_logging_id=pipeline_logging_id
    )

    task_logger.info(
        "Starting pipeline",
        trigger_type=trigger_type,
        trigger_by=trigger_by
    )

    start_time = datetime.utcnow()

    try:
        # Load pipeline configuration
        config_loader = get_config_loader()
        pipeline_config = config_loader.load_pipeline_config(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id
        )

        task_logger.info(
            f"Loaded pipeline config",
            num_steps=len(pipeline_config.steps),
            timeout_seconds=pipeline_config.timeout_seconds
        )

        # Create pipeline run record in BigQuery
        bq_client = get_bigquery_client()
        _create_pipeline_run_record(
            bq_client=bq_client,
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            trigger_type=trigger_type,
            trigger_by=trigger_by,
            status="RUNNING"
        )

        # Execute pipeline steps
        step_results = []
        current_status = "RUNNING"

        for step_idx, step in enumerate(pipeline_config.steps):
            task_logger.info(
                f"Executing step {step_idx + 1}/{len(pipeline_config.steps)}",
                step_name=step.name,
                step_type=step.type
            )

            step_start = datetime.utcnow()

            try:
                # Execute step based on type
                if step.type == StepType.INGEST:
                    from src.core.workers.ingest_task import run_ingest
                    result = run_ingest.delay(
                        tenant_id=tenant_id,
                        source_config_file=step.source_config,
                        pipeline_logging_id=pipeline_logging_id
                    ).get(timeout=pipeline_config.timeout_seconds)

                elif step.type == StepType.DQ_CHECK:
                    from src.core.workers.dq_task import run_dq_check
                    result = run_dq_check.delay(
                        tenant_id=tenant_id,
                        target_table=step.target_table,
                        rules_config_file=step.rules_config,
                        pipeline_logging_id=pipeline_logging_id
                    ).get(timeout=pipeline_config.timeout_seconds)

                elif step.type == StepType.TRANSFORM:
                    from src.core.workers.transform_task import run_transform
                    result = run_transform.delay(
                        tenant_id=tenant_id,
                        sql_file=step.sql_file,
                        destination=step.destination,
                        pipeline_logging_id=pipeline_logging_id
                    ).get(timeout=pipeline_config.timeout_seconds)

                else:
                    raise ValueError(f"Unknown step type: {step.type}")

                # Calculate step duration
                step_duration = int((datetime.utcnow() - step_start).total_seconds() * 1000)

                step_result = {
                    "name": step.name,
                    "type": step.type,
                    "status": "COMPLETE",
                    "start_time": step_start.isoformat(),
                    "duration_ms": step_duration,
                    "metadata": result
                }

                step_results.append(step_result)

                task_logger.info(
                    f"Step completed",
                    step_name=step.name,
                    duration_ms=step_duration
                )

            except Exception as step_error:
                step_duration = int((datetime.utcnow() - step_start).total_seconds() * 1000)

                step_result = {
                    "name": step.name,
                    "type": step.type,
                    "status": "FAILED",
                    "start_time": step_start.isoformat(),
                    "duration_ms": step_duration,
                    "error": str(step_error)
                }

                step_results.append(step_result)

                task_logger.error(
                    f"Step failed",
                    step_name=step.name,
                    error=str(step_error),
                    on_failure=step.on_failure
                )

                # Handle failure based on strategy
                if step.on_failure == OnFailure.STOP:
                    current_status = "FAILED"
                    break
                elif step.on_failure == OnFailure.ALERT:
                    task_logger.warning(f"Step failed but continuing", step_name=step.name)
                    # TODO: Send alert notification
                elif step.on_failure == OnFailure.CONTINUE:
                    task_logger.info(f"Step failed, continuing", step_name=step.name)

        # Calculate total duration
        end_time = datetime.utcnow()
        total_duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Determine final status
        if current_status != "FAILED":
            current_status = "COMPLETE"

        # Update pipeline run record
        run_metadata = {
            "steps": step_results,
            "config_version": "main",  # TODO: Get git commit SHA
            "worker_instance": self.request.hostname
        }

        _update_pipeline_run_record(
            bq_client=bq_client,
            tenant_id=tenant_id,
            pipeline_logging_id=pipeline_logging_id,
            status=current_status,
            end_time=end_time,
            duration_ms=total_duration_ms,
            run_metadata=run_metadata
        )

        task_logger.info(
            "Pipeline completed",
            status=current_status,
            duration_ms=total_duration_ms,
            steps_executed=len(step_results)
        )

        return {
            "pipeline_logging_id": pipeline_logging_id,
            "pipeline_id": pipeline_id,
            "status": current_status,
            "duration_ms": total_duration_ms,
            "steps_executed": len(step_results),
            "steps_succeeded": sum(1 for s in step_results if s["status"] == "COMPLETE"),
            "steps_failed": sum(1 for s in step_results if s["status"] == "FAILED")
        }

    except Exception as e:
        # Update record as failed
        end_time = datetime.utcnow()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        _update_pipeline_run_record(
            bq_client=bq_client,
            tenant_id=tenant_id,
            pipeline_logging_id=pipeline_logging_id,
            status="FAILED",
            end_time=end_time,
            duration_ms=duration_ms,
            error_message=str(e)
        )

        task_logger.error(
            "Pipeline failed",
            error=str(e),
            exc_info=True
        )

        raise


def _create_pipeline_run_record(
    bq_client,
    tenant_id: str,
    pipeline_id: str,
    pipeline_logging_id: str,
    trigger_type: str,
    trigger_by: str,
    status: str
):
    """Create initial pipeline run record in BigQuery."""
    query = f"""
    INSERT INTO `{bq_client.project_id}.metadata.pipeline_runs`
    (pipeline_logging_id, tenant_id, pipeline_id, status, trigger_type, trigger_by, start_time, ingestion_date)
    VALUES
    (@pipeline_logging_id, @tenant_id, @pipeline_id, @status, @trigger_type, @trigger_by, CURRENT_TIMESTAMP(), CURRENT_DATE())
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("status", "STRING", status),
            bigquery.ScalarQueryParameter("trigger_type", "STRING", trigger_type),
            bigquery.ScalarQueryParameter("trigger_by", "STRING", trigger_by),
        ]
    )

    bq_client.client.query(query, job_config=job_config).result()


def _update_pipeline_run_record(
    bq_client,
    tenant_id: str,
    pipeline_logging_id: str,
    status: str,
    end_time: datetime,
    duration_ms: int,
    run_metadata: Dict[str, Any] = None,
    error_message: str = None
):
    """Update pipeline run record with completion data."""
    query = f"""
    UPDATE `{bq_client.project_id}.metadata.pipeline_runs`
    SET
        status = @status,
        end_time = @end_time,
        duration_ms = @duration_ms,
        run_metadata = PARSE_JSON(@run_metadata),
        error_message = @error_message
    WHERE pipeline_logging_id = @pipeline_logging_id
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("status", "STRING", status),
            bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", end_time),
            bigquery.ScalarQueryParameter("duration_ms", "INT64", duration_ms),
            bigquery.ScalarQueryParameter("run_metadata", "STRING", json.dumps(run_metadata) if run_metadata else None),
            bigquery.ScalarQueryParameter("error_message", "STRING", error_message),
        ]
    )

    bq_client.client.query(query, job_config=job_config).result()
