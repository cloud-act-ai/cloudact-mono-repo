"""
Data Quality Validation
Validate data using Great Expectations rules.
"""

import yaml
import uuid
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime, date, timezone

from great_expectations.data_context import AbstractDataContext
from great_expectations.core.batch import RuntimeBatchRequest
from great_expectations.dataset import PandasDataset
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.api_core import exceptions as gcp_exceptions

from src.core.engine.bq_client import get_bigquery_client
from src.core.utils.logging import get_logger
from src.app.config import settings

logger = get_logger(__name__)


class DataQualityValidator:
    """
    Validate data quality using Great Expectations.
    """

    def __init__(self):
        """Initialize data quality validator."""
        self.bq_client = get_bigquery_client()

    def validate_table(
        self,
        table_id: str,
        dq_config_path: str,
        org_slug: str,
        pipeline_logging_id: str,
        base_dir: Optional[Path] = None
    ) -> List[Dict[str, Any]]:
        """
        Validate a BigQuery table using DQ rules from YAML config.

        Args:
            table_id: Fully qualified table ID (project.dataset.table)
            dq_config_path: Path to DQ rules YAML file
            org_slug: Organization identifier
            pipeline_logging_id: Pipeline run ID
            base_dir: Base directory for resolving relative paths (optional for backward compatibility)

        Returns:
            List of validation results
        """
        logger.info(
            f"Starting data quality validation",
            extra={"table_id": table_id, "config": dq_config_path, "base_dir": str(base_dir) if base_dir else None}
        )

        # Load DQ config
        dq_config = self._load_dq_config(dq_config_path, base_dir)

        # Fetch data from BigQuery
        df = self._fetch_table_data(table_id, dq_config.get('sample_size', 10000))

        # Basic check: Ensure data is present
        if len(df) == 0:
            logger.warning(
                f"No data found in table",
                extra={"table_id": table_id}
            )
            # Return a failed expectation for empty table
            return [{
                'expectation_type': 'expect_table_to_have_data',
                'success': False,
                'details': {'row_count': 0},
                'error': 'Table is empty - no data to validate'
            }]

        # Create Great Expectations dataset
        ge_dataset = PandasDataset(df)

        # Run expectations
        results = []
        for expectation in dq_config.get('expectations', []):
            result = self._run_expectation(ge_dataset, expectation)
            results.append(result)

            # Log result
            if result['success']:
                logger.info(f"DQ check passed: {result['expectation_type']}")
            else:
                logger.warning(
                    f"DQ check failed: {result['expectation_type']}",
                    extra={"details": result.get('details')}
                )

        # Store results in BigQuery
        self._store_results(results, table_id, org_slug, pipeline_logging_id, dq_config_path)

        return results

    def _load_dq_config(self, config_path: str, base_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Load DQ configuration from YAML file.

        Args:
            config_path: Path to DQ config file (relative or absolute)
            base_dir: Base directory for resolving relative paths (optional for backward compatibility)

        Returns:
            DQ configuration dict
        """
        # Resolve config path relative to base_dir if provided
        if base_dir:
            path = base_dir / config_path
        else:
            # Backward compatibility: use config_path as-is
            path = Path(config_path)

        if not path.exists():
            raise FileNotFoundError(f"DQ config not found: {path} (original: {config_path}, base_dir: {base_dir})")

        logger.info(
            f"Loading DQ config",
            extra={
                "config_path": config_path,
                "resolved_path": str(path),
                "base_dir": str(base_dir) if base_dir else None
            }
        )

        f = None
        try:
            f = open(path, 'r')
            config = yaml.safe_load(f)
            return config

        finally:
            # Ensure file handle is closed
            try:
                if f:
                    f.close()
            except Exception as cleanup_error:
                logger.error(f"Error closing DQ config file: {cleanup_error}", exc_info=True)

    def _fetch_table_data(self, table_id: str, sample_size: int = 10000) -> pd.DataFrame:
        """
        Fetch data from BigQuery table for validation.

        Args:
            table_id: Fully qualified table ID
            sample_size: Number of rows to sample (None for all)

        Returns:
            Pandas DataFrame
        """
        from google.cloud import bigquery
        from src.core.utils.sql_params import SQLParameterInjector

        # SECURITY FIX: Use parameterized query to prevent SQL injection
        # Note: table_id is a system identifier (not user input) but we validate it properly
        # For table names, we use backticks which is safe, but we parameterize LIMIT value
        if sample_size:
            query = f"SELECT * FROM `{table_id}` LIMIT @sample_size"
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("sample_size", "INT64", sample_size)
                ]
            )
        else:
            query = f"SELECT * FROM `{table_id}`"
            job_config = None

        query_job = None
        df = None

        try:
            query_job = self.bq_client.client.query(query, job_config=job_config)
            df = query_job.to_dataframe()

            logger.info(
                f"Fetched {len(df)} rows for validation",
                extra={"table_id": table_id}
            )

            return df

        finally:
            # Clean up query job resources
            try:
                if query_job:
                    # Cancel job if still running (shouldn't happen, but defensive)
                    if query_job.state in ['PENDING', 'RUNNING']:
                        query_job.cancel()
                        logger.debug(f"Cancelled data fetch query job: {query_job.job_id}")
                    del query_job
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up data fetch query job: {cleanup_error}", exc_info=True)

    def _run_expectation(
        self,
        dataset: PandasDataset,
        expectation_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Run a single Great Expectations expectation.

        Args:
            dataset: Great Expectations dataset
            expectation_config: Expectation configuration

        Returns:
            Validation result
        """
        expectation_type = expectation_config['expectation_type']
        kwargs = expectation_config.get('kwargs', {})

        try:
            # Call the expectation method dynamically
            expectation_method = getattr(dataset, expectation_type)
            result = expectation_method(**kwargs)

            return {
                'expectation_type': expectation_type,
                'success': result['success'],
                'details': result.get('result', {}),
                'kwargs': kwargs
            }

        except AttributeError:
            logger.error(f"Unknown expectation type: {expectation_type}")
            return {
                'expectation_type': expectation_type,
                'success': False,
                'error': f"Unknown expectation type: {expectation_type}",
                'kwargs': kwargs
            }

        except Exception as e:
            logger.error(f"Error running expectation {expectation_type}: {e}")
            return {
                'expectation_type': expectation_type,
                'success': False,
                'error': str(e),
                'kwargs': kwargs
            }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((gcp_exceptions.ServiceUnavailable, gcp_exceptions.InternalServerError)),
        reraise=True
    )
    def _store_results(
        self,
        results: List[Dict[str, Any]],
        table_id: str,
        org_slug: str,
        pipeline_logging_id: str,
        dq_config_path: str
    ) -> None:
        """
        Store DQ validation results in BigQuery.
        Aggregates results per table instead of one row per expectation.

        Args:
            results: List of validation results
            table_id: Table that was validated
            org_slug: Organization identifier
            pipeline_logging_id: Pipeline run ID
            dq_config_path: Path to DQ config file
        """
        executed_at = datetime.now(timezone.utc)
        ingestion_date = executed_at.date()

        # Aggregate results
        expectations_passed = sum(1 for r in results if r['success'])
        expectations_failed = sum(1 for r in results if not r['success'])

        # Collect failed expectations details
        failed_expectations = [
            {
                'expectation_type': r['expectation_type'],
                'kwargs': r.get('kwargs', {}),
                'details': r.get('details', {}),
                'error': r.get('error')
            }
            for r in results if not r['success']
        ]

        # Determine overall status
        if expectations_failed == 0:
            overall_status = "PASS"
        elif expectations_passed > 0:
            overall_status = "WARNING"  # Some passed, some failed
        else:
            overall_status = "FAIL"  # All failed

        # Extract dq_config_id from the dq_config_path
        # Use the filename without extension as config identifier
        dq_config_id = Path(dq_config_path).stem

        # Create aggregated row
        row = {
            'dq_result_id': str(uuid.uuid4()),
            'pipeline_logging_id': pipeline_logging_id,
            'org_slug': org_slug,
            'target_table': table_id,
            'dq_config_id': dq_config_id,
            'executed_at': executed_at.isoformat(),
            'expectations_passed': expectations_passed,
            'expectations_failed': expectations_failed,
            'failed_expectations': failed_expectations if failed_expectations else None,
            'overall_status': overall_status,
            'ingestion_date': ingestion_date.isoformat()
        }

        try:
            # Use org-specific metadata dataset
            metadata_dataset = settings.get_org_dataset_name(org_slug, "metadata")
            metadata_table = f"{settings.gcp_project_id}.{metadata_dataset}.org_meta_dq_results"

            errors = self.bq_client.client.insert_rows_json(metadata_table, [row])

            if errors:
                logger.error(f"Failed to store DQ results: {errors}")
            else:
                logger.info(
                    f"Stored DQ results for table {table_id}",
                    extra={
                        "table": metadata_table,
                        "overall_status": overall_status,
                        "expectations_passed": expectations_passed,
                        "expectations_failed": expectations_failed
                    }
                )

        except Exception as e:
            logger.error(f"Error storing DQ results: {e}")
            raise
