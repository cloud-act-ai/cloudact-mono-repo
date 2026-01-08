"""
One-Time Bootstrap Processor
Creates central organizations dataset and management tables from config.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.api_core import exceptions

from src.app.config import get_settings

logger = logging.getLogger(__name__)


class OnetimeBootstrapProcessor:
    """
    Bootstrap processor - creates dataset and tables from config/schema files.
    No hardcoded schemas or table definitions.
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

        # Path to configs/setup/bootstrap/
        self.template_dir = (
            Path(__file__).parent.parent.parent.parent.parent.parent
            / "configs" / "setup" / "bootstrap"
        )

        self.config = self._load_config()
        self.project_id = self.settings.gcp_project_id
        self.location = self.settings.bigquery_location
        self.client = bigquery.Client(project=self.project_id)

    def _load_config(self) -> Dict[str, Any]:
        """Load config from config.yml"""
        config_file = self.template_dir / "config.yml"
        if config_file.exists():
            import yaml
            with open(config_file, 'r') as f:
                return yaml.safe_load(f)
        return {}

    def _load_table_schema(self, table_name: str) -> List[bigquery.SchemaField]:
        """Load schema from schemas/{table_name}.json"""
        schema_file = self.template_dir / "schemas" / f"{table_name}.json"

        if not schema_file.exists():
            raise FileNotFoundError(f"Schema file not found: {schema_file}")

        with open(schema_file, 'r', encoding='utf-8') as f:
            schema_json = json.load(f)

        return [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute bootstrap from config."""
        force_recreate_dataset = context.get('force_recreate_dataset', False)
        force_recreate_tables = context.get('force_recreate_tables', False)

        self.logger.info("Starting bootstrap setup")

        # Create dataset
        dataset_created = self._ensure_dataset(force_recreate=force_recreate_dataset)

        # Create tables from config in order (BUG-004 FIX: dependency-safe ordering)
        tables_config = self.config.get('tables', {})
        table_names = list(tables_config.keys())
        total_tables = len(table_names)

        tables_created = []
        tables_existed = []

        for idx, table_name in enumerate(table_names, 1):
            table_cfg = tables_config[table_name]

            # BUG-009 FIX: Log table creation order
            self.logger.info(f"Bootstrap [{idx}/{total_tables}]: Processing table '{table_name}'")

            existed = self._ensure_table(
                table_name=table_name,
                table_config=table_cfg or {},
                force_recreate=force_recreate_tables
            )
            if existed:
                tables_existed.append(table_name)
            else:
                tables_created.append(table_name)

        self.logger.info(f"Bootstrap complete: {len(tables_created)} created, {len(tables_existed)} existed")

        return {
            "status": "SUCCESS",
            "dataset_created": dataset_created,
            "tables_created": tables_created,
            "tables_existed": tables_existed,
            "total_tables": len(tables_config),
            "message": "Bootstrap setup completed successfully"
        }

    def _ensure_dataset(self, force_recreate: bool = False) -> bool:
        """Create dataset if not exists."""
        dataset_cfg = self.config.get('dataset', {})
        dataset_name = dataset_cfg.get('name', 'organizations')
        dataset_id = f"{self.project_id}.{dataset_name}"

        if force_recreate:
            self.client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)
            self.logger.info(f"Deleted dataset: {dataset_id}")

        try:
            self.client.get_dataset(dataset_id)
            self.logger.info(f"Dataset exists: {dataset_id}")
            return False
        except exceptions.NotFound:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = dataset_cfg.get('location', self.location)
            dataset.description = dataset_cfg.get('description', '')
            self.client.create_dataset(dataset)
            self.logger.info(f"Created dataset: {dataset_id}")
            return True

    def _ensure_table(
        self,
        table_name: str,
        table_config: Dict[str, Any],
        force_recreate: bool = False
    ) -> bool:
        """Create table from schema JSON and config.yml settings."""
        # BUG-014 FIX: Validate table name convention
        if not table_name.startswith('org_') and table_name != 'hierarchy_levels':
            raise ValueError(
                f"Invalid table name '{table_name}': Bootstrap tables must start with 'org_' "
                f"(exception: 'hierarchy_levels')"
            )

        dataset_name = self.config.get('dataset', {}).get('name', 'organizations')
        table_id = f"{self.project_id}.{dataset_name}.{table_name}"

        schema = self._load_table_schema(table_name)

        # BUG-005 FIX: Validate partition field type if partitioning is configured
        partition_cfg = table_config.get('partition')
        if partition_cfg:
            partition_field = partition_cfg.get('field')
            if partition_field:
                # Find field in schema
                schema_dict = {field.name: field for field in schema}
                if partition_field not in schema_dict:
                    raise ValueError(
                        f"Partition field '{partition_field}' not found in schema for table '{table_name}'"
                    )

                # Validate field type is suitable for partitioning
                field_type = schema_dict[partition_field].field_type
                valid_partition_types = {'TIMESTAMP', 'DATE', 'DATETIME'}
                if field_type not in valid_partition_types:
                    raise ValueError(
                        f"Invalid partition field type for '{table_name}.{partition_field}': "
                        f"'{field_type}'. Must be one of {valid_partition_types}"
                    )

        # BUG-012 FIX: Validate clustering fields exist in schema
        clustering = table_config.get('clustering', [])
        if clustering:
            schema_dict = {field.name: field for field in schema}
            for cluster_field in clustering:
                if cluster_field not in schema_dict:
                    raise ValueError(
                        f"Clustering field '{cluster_field}' not found in schema for table '{table_name}'"
                    )

        if force_recreate:
            self.client.delete_table(table_id, not_found_ok=True)

        try:
            self.client.get_table(table_id)
            self.logger.info(f"Table exists: {table_id}")
            return True
        except exceptions.NotFound:
            table = bigquery.Table(table_id, schema=schema)
            table.description = table_config.get('description', f"Table: {table_name}")

            # Apply partitioning from config
            partition_cfg = table_config.get('partition')
            if partition_cfg:
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field=partition_cfg.get('field')
                )

            # Apply clustering from config
            clustering = table_config.get('clustering')
            if clustering:
                table.clustering_fields = clustering

            self.client.create_table(table)
            self.logger.info(f"Created table: {table_id}")
            return False


def get_engine():
    """Get processor instance."""
    return OnetimeBootstrapProcessor()
