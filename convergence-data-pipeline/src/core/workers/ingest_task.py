"""
Ingest Worker
Fetches data from sources and loads into BigQuery using Polars for processing.
"""

import asyncio
from typing import Dict, Any, List
from datetime import datetime
import uuid
import logging

from celery import Task

from src.core.workers.celery_app import celery_app
from src.core.abstractor.config_loader import get_config_loader
from src.core.abstractor.models import SourceConfig, ConnectorType, LoadingStrategy
from src.core.engine.api_connector import APIConnector
from src.core.engine.polars_processor import PolarsProcessor
from src.core.engine.bq_client import get_bigquery_client
from src.core.utils.logging import create_structured_logger
from src.app.config import settings

logger = logging.getLogger(__name__)


class IngestTask(Task):
    """Base ingest task with context management."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failure."""
        logger.error(
            f"Ingest task failed",
            task_id=task_id,
            exception=str(exc),
            exc_info=einfo
        )


@celery_app.task(
    bind=True,
    base=IngestTask,
    name="src.core.workers.ingest_task.run_ingest",
    max_retries=3,
    default_retry_delay=60
)
def run_ingest(
    self,
    tenant_id: str,
    source_config_file: str,
    pipeline_logging_id: str
) -> Dict[str, Any]:
    """
    Execute data ingestion for a source.

    Args:
        tenant_id: Tenant identifier
        source_config_file: Path to source config file
        pipeline_logging_id: Pipeline run ID for tracking

    Returns:
        Dict with ingestion metrics
    """
    # Create structured logger with context
    task_logger = create_structured_logger(
        __name__,
        tenant_id=tenant_id,
        pipeline_logging_id=pipeline_logging_id
    )

    task_logger.info(
        "Starting ingest task",
        source_config=source_config_file
    )

    start_time = datetime.utcnow()

    try:
        # Load source configuration
        config_loader = get_config_loader()
        source_config = config_loader.load_source_config(
            tenant_id=tenant_id,
            config_file=source_config_file
        )

        task_logger.info(
            f"Loaded source config",
            source_id=source_config.source_id,
            connector_type=source_config.connector.type,
            loading_strategy=source_config.loading.strategy
        )

        # Execute ingestion based on connector type
        if source_config.connector.type == ConnectorType.REST_API:
            result = _ingest_from_rest_api(
                tenant_id=tenant_id,
                source_config=source_config,
                pipeline_logging_id=pipeline_logging_id,
                logger=task_logger
            )

        elif source_config.connector.type == ConnectorType.BIGQUERY:
            result = _ingest_from_bigquery(
                tenant_id=tenant_id,
                source_config=source_config,
                pipeline_logging_id=pipeline_logging_id,
                logger=task_logger
            )

        else:
            raise NotImplementedError(
                f"Connector type {source_config.connector.type} not yet implemented"
            )

        # Calculate duration
        end_time = datetime.utcnow()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        result["duration_ms"] = duration_ms
        result["status"] = "SUCCESS"

        task_logger.info(
            "Ingest task completed",
            **result
        )

        return result

    except Exception as e:
        task_logger.error(
            "Ingest task failed",
            error=str(e),
            exc_info=True
        )

        # Retry with exponential backoff
        raise self.retry(exc=e)


def _ingest_from_rest_api(
    tenant_id: str,
    source_config: SourceConfig,
    pipeline_logging_id: str,
    logger
) -> Dict[str, Any]:
    """
    Ingest data from REST API.

    Args:
        tenant_id: Tenant identifier
        source_config: Source configuration
        pipeline_logging_id: Pipeline run ID
        logger: Structured logger

    Returns:
        Ingestion metrics
    """
    logger.info("Ingesting from REST API", source_id=source_config.source_id)

    # Initialize components
    connector = APIConnector(source_config.connector, tenant_id)
    processor = PolarsProcessor()
    bq_client = get_bigquery_client()

    try:
        # Fetch data from API (streaming)
        records = []
        api_calls = 0

        async def fetch_data():
            nonlocal records, api_calls
            async for record in connector.fetch_all():
                records.append(record)
                # Process in chunks to avoid memory issues
                if len(records) >= processor.chunk_size:
                    await _process_and_load_batch(
                        records=records,
                        source_config=source_config,
                        tenant_id=tenant_id,
                        pipeline_logging_id=pipeline_logging_id,
                        processor=processor,
                        bq_client=bq_client,
                        logger=logger
                    )
                    records = []
                api_calls += 1

        # Run async fetch
        asyncio.run(fetch_data())

        # Process remaining records
        if records:
            asyncio.run(_process_and_load_batch(
                records=records,
                source_config=source_config,
                tenant_id=tenant_id,
                pipeline_logging_id=pipeline_logging_id,
                processor=processor,
                bq_client=bq_client,
                logger=logger
            ))

        return {
            "source_id": source_config.source_id,
            "connector_type": "rest_api",
            "rows_ingested": len(records),
            "api_calls": api_calls
        }

    finally:
        asyncio.run(connector.close())


async def _process_and_load_batch(
    records: List[Dict[str, Any]],
    source_config: SourceConfig,
    tenant_id: str,
    pipeline_logging_id: str,
    processor: PolarsProcessor,
    bq_client,
    logger
):
    """Process and load a batch of records."""
    if not records:
        return

    # Convert to Polars DataFrame
    df = processor.from_dicts(records)

    # Load schema if specified
    if source_config.loading.schema_file:
        schema = bq_client.load_schema_from_file(
            settings.get_tenant_schemas_path(tenant_id) + "/" + source_config.loading.schema_file
        )
        # Apply schema via Polars
        # (simplified - full implementation would map BQ schema to Polars)

    # Add metadata columns
    df = processor.add_metadata_columns(df, pipeline_logging_id)

    # Deduplicate if merge strategy
    if source_config.loading.strategy == LoadingStrategy.MERGE:
        if source_config.loading.merge_keys:
            df = processor.deduplicate(df, source_config.loading.merge_keys)

    # Parse dataset and table from destination
    dataset_type, table_name = source_config.loading.destination.split(".")

    # Ensure table exists
    if source_config.loading.schema_file:
        schema_path = (
            settings.get_tenant_schemas_path(tenant_id) +
            "/" + source_config.loading.schema_file
        )

        bq_client.create_table_from_schema_file(
            tenant_id=tenant_id,
            dataset_type=dataset_type,
            table_name=table_name,
            schema_file=schema_path,
            partition_field=source_config.loading.partition_field,
            cluster_fields=source_config.loading.cluster_fields
        )

    # Load to BigQuery
    table_id = bq_client.get_tenant_dataset_id(tenant_id, dataset_type) + f".{table_name}"

    processor.to_bigquery(
        df=df,
        bq_client=bq_client.client,
        table_id=table_id,
        write_disposition="WRITE_APPEND"  # Always append, merging handled separately
    )

    logger.info(
        f"Loaded batch to BigQuery",
        rows=df.height,
        table_id=table_id
    )


def _ingest_from_bigquery(
    tenant_id: str,
    source_config: SourceConfig,
    pipeline_logging_id: str,
    logger
) -> Dict[str, Any]:
    """
    Ingest data from BigQuery (cross-project/dataset copy).

    Args:
        tenant_id: Tenant identifier
        source_config: Source configuration
        pipeline_logging_id: Pipeline run ID
        logger: Structured logger

    Returns:
        Ingestion metrics
    """
    logger.info("Ingesting from BigQuery", source_id=source_config.source_id)

    bq_client = get_bigquery_client()
    processor = PolarsProcessor()

    # Execute source query
    df = processor.from_bigquery(
        bq_client=bq_client.client,
        query=source_config.connector.query,
        use_streaming=True
    )

    # Add metadata
    df = processor.add_metadata_columns(df, pipeline_logging_id)

    # Parse destination
    dataset_type, table_name = source_config.loading.destination.split(".")
    table_id = bq_client.get_tenant_dataset_id(tenant_id, dataset_type) + f".{table_name}"

    # Load to BigQuery
    rows_written = processor.to_bigquery(
        df=df,
        bq_client=bq_client.client,
        table_id=table_id,
        write_disposition="WRITE_APPEND"
    )

    return {
        "source_id": source_config.source_id,
        "connector_type": "bigquery",
        "rows_ingested": rows_written,
        "source_query": source_config.connector.query[:100] + "..."
    }
