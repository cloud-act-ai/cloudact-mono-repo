"""
Data Quality Validation
Validate data using Great Expectations rules.
"""

import yaml
from typing import Dict, Any, List
from pathlib import Path
from datetime import datetime

from great_expectations.data_context import AbstractDataContext
from great_expectations.core.batch import RuntimeBatchRequest
from great_expectations.dataset import PandasDataset
import pandas as pd

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
        tenant_id: str,
        pipeline_logging_id: str
    ) -> List[Dict[str, Any]]:
        """
        Validate a BigQuery table using DQ rules from YAML config.

        Args:
            table_id: Fully qualified table ID (project.dataset.table)
            dq_config_path: Path to DQ rules YAML file
            tenant_id: Tenant identifier
            pipeline_logging_id: Pipeline run ID

        Returns:
            List of validation results
        """
        logger.info(
            f"Starting data quality validation",
            extra={"table_id": table_id, "config": dq_config_path}
        )

        # Load DQ config
        dq_config = self._load_dq_config(dq_config_path)

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

        # Store results in BigQuery if enabled
        if settings.dq_store_results_in_bq:
            self._store_results(results, table_id, tenant_id, pipeline_logging_id)

        return results

    def _load_dq_config(self, config_path: str) -> Dict[str, Any]:
        """
        Load DQ configuration from YAML file.

        Args:
            config_path: Path to DQ config file

        Returns:
            DQ configuration dict
        """
        path = Path(config_path)

        if not path.exists():
            raise FileNotFoundError(f"DQ config not found: {config_path}")

        with open(path, 'r') as f:
            config = yaml.safe_load(f)

        return config

    def _fetch_table_data(self, table_id: str, sample_size: int = 10000) -> pd.DataFrame:
        """
        Fetch data from BigQuery table for validation.

        Args:
            table_id: Fully qualified table ID
            sample_size: Number of rows to sample (None for all)

        Returns:
            Pandas DataFrame
        """
        if sample_size:
            query = f"SELECT * FROM `{table_id}` LIMIT {sample_size}"
        else:
            query = f"SELECT * FROM `{table_id}`"

        query_job = self.bq_client.client.query(query)
        df = query_job.to_dataframe()

        logger.info(
            f"Fetched {len(df)} rows for validation",
            extra={"table_id": table_id}
        )

        return df

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

    def _store_results(
        self,
        results: List[Dict[str, Any]],
        table_id: str,
        tenant_id: str,
        pipeline_logging_id: str
    ) -> None:
        """
        Store DQ validation results in BigQuery.

        Args:
            results: List of validation results
            table_id: Table that was validated
            tenant_id: Tenant identifier
            pipeline_logging_id: Pipeline run ID
        """
        rows = []
        validation_time = datetime.utcnow()

        for result in results:
            row = {
                'validation_id': f"{pipeline_logging_id}_{result['expectation_type']}",
                'pipeline_logging_id': pipeline_logging_id,
                'tenant_id': tenant_id,
                'table_id': table_id,
                'expectation_type': result['expectation_type'],
                'success': result['success'],
                'details': str(result.get('details', {})),
                'error': result.get('error'),
                'validation_time': validation_time.isoformat(),
                'ingestion_date': validation_time.date().isoformat()
            }
            rows.append(row)

        try:
            metadata_table = f"{settings.gcp_project_id}.metadata.dq_results"
            errors = self.bq_client.client.insert_rows_json(metadata_table, rows)

            if errors:
                logger.error(f"Failed to store DQ results: {errors}")
            else:
                logger.info(
                    f"Stored {len(rows)} DQ results",
                    extra={"table": metadata_table}
                )

        except Exception as e:
            logger.error(f"Error storing DQ results: {e}")
