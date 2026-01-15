"""
Organization Onboarding Processor
Creates organization dataset and all required metadata tables
"""
import csv
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound, Conflict

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.services.hierarchy_crud.level_service import HierarchyLevelService


class OrgOnboardingProcessor:
    """
    Processor for organization onboarding
    Creates dataset and all metadata tables from configuration
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Path to configs/setup/organizations/onboarding/
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding"
        self.schema_dir = self.template_dir / "schemas"
        self.views_dir = self.template_dir / "views"

    def _load_schema_file(self, schema_filename: str) -> List[bigquery.SchemaField]:
        """Load schema from JSON file and convert to BigQuery SchemaField list"""
        schema_file = self.schema_dir / schema_filename

        if not schema_file.exists():
            self.logger.warning(f"Schema file not found: {schema_file}")
            return []

        try:
            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            # Convert JSON schema to SchemaField objects
            schema = []
            for field in schema_json:
                schema.append(bigquery.SchemaField.from_api_repr(field))

            return schema
        except Exception as e:
            self.logger.error(f"Error loading schema from {schema_file}: {e}")
            return []

    async def _create_dataset(self, bq_client: BigQueryClient, dataset_id: str, location: str) -> bool:
        """Create dataset if it doesn't exist"""
        full_dataset_id = f"{self.settings.gcp_project_id}.{dataset_id}"

        try:
            # Try to get the dataset first
            dataset = await bq_client.get_dataset(full_dataset_id)
            self.logger.info(f"Dataset already exists: {full_dataset_id}")
            return True
        except NotFound:
            # Dataset doesn't exist, create it
            dataset = bigquery.Dataset(full_dataset_id)
            dataset.location = location
            dataset.description = f"Dataset for organization {dataset_id}"

            try:
                await bq_client.create_dataset_raw(dataset)
                self.logger.info(f"Created dataset: {full_dataset_id}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to create dataset {full_dataset_id}: {e}")
                return False

    async def _create_table(
        self,
        bq_client: BigQueryClient,
        dataset_id: str,
        table_name: str,
        schema: List[bigquery.SchemaField],
        description: str = None,
        partition_field: str = None,
        clustering_fields: List[str] = None
    ) -> bool:
        """Create a single table with schema, optional partitioning and clustering"""
        full_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{table_name}"

        try:
            # Check if table already exists
            table = await bq_client.get_table(full_table_id)
            self.logger.info(f"Table already exists: {full_table_id}")
            return True
        except NotFound:
            # Table doesn't exist, create it
            table = bigquery.Table(full_table_id, schema=schema)
            if description:
                table.description = description

            # Add partitioning if specified in table config
            # Note: Partitioning must be configured in pipeline.yml, not hardcoded
            if partition_field:
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field=partition_field
                )

            # Add clustering if specified
            if clustering_fields:
                table.clustering_fields = clustering_fields

            try:
                await bq_client.create_table_raw(table)
                self.logger.info(f"Created table: {full_table_id}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to create table {full_table_id}: {e}")
                return False

    def _load_csv_file(self, csv_path: str) -> List[Dict[str, Any]]:
        """Load CSV file and return list of row dictionaries"""
        # Resolve path relative to project root (api-service/)
        base_dir = Path(__file__).parent.parent.parent.parent.parent.parent
        full_path = base_dir / csv_path

        if not full_path.exists():
            self.logger.error(f"CSV file not found: {full_path}")
            return []

        try:
            rows = []
            with open(full_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Convert empty strings to None for nullable fields
                    cleaned_row = {}
                    for key, value in row.items():
                        if value == '' or value is None:
                            cleaned_row[key] = None
                        elif key in ('is_custom', 'is_enabled', 'auto_renew'):
                            # Convert boolean strings
                            cleaned_row[key] = value.lower() == 'true'
                        elif key in ('quantity', 'seats', 'discount_value'):
                            # Convert integer fields
                            cleaned_row[key] = int(value) if value else 0
                        elif key in ('input_price_per_1k', 'output_price_per_1k', 'unit_price',
                                     'yearly_price', 'x_openai_batch_input_price',
                                     'x_openai_batch_output_price', 'base_input_price_per_1k',
                                     'base_output_price_per_1k', 'discount_percentage'):
                            # Convert float fields
                            cleaned_row[key] = float(value) if value else 0.0
                        elif key in ('free_tier_input_tokens', 'free_tier_output_tokens',
                                     'volume_threshold_tokens'):
                            # Convert large integer fields
                            cleaned_row[key] = int(value) if value else None
                        else:
                            # All other fields are strings (pricing_type, free_tier_reset_frequency, etc.)
                            cleaned_row[key] = value
                    rows.append(cleaned_row)
            self.logger.info(f"Loaded {len(rows)} rows from {csv_path}")
            return rows
        except Exception as e:
            self.logger.error(f"Error loading CSV {csv_path}: {e}")
            return []

    async def _seed_default_hierarchy(
        self,
        bq_client: BigQueryClient,
        dataset_id: str,
        org_slug: str,
        csv_path: str = "configs/hierarchy/seed/data/default_hierarchy.csv"
    ) -> Dict[str, Any]:
        """
        Seed default organizational hierarchy from CSV file.

        CSV-based seeding allows easy customization of the default hierarchy structure.
        The CSV should contain: entity_id, entity_name, level, level_code, parent_id,
        owner_name, owner_email, description, metadata, sort_order

        Computed fields (path, path_ids, path_names, depth) are built automatically
        from the parent_id relationships.

        Default CSV provides FinOps Foundation enterprise structure:
        - Level 1 (c_suite): Group CFO, Group CIO, Group COO, Business Lines
        - Level 2 (business_unit): BU CIOs, CTO, IT COO, Business COOs, Procurement, Group Ops
        - Level 3 (function): Platforms, Architecture, Infrastructure, Tech Centres, Data, FinOps

        Edit the CSV file to customize the default hierarchy for your organization.
        CSV location: configs/hierarchy/seed/data/default_hierarchy.csv

        Args:
            bq_client: BigQuery client
            dataset_id: Organization dataset ID (not used for hierarchy - kept for signature)
            org_slug: Organization slug
            csv_path: Path to CSV file with hierarchy data (relative to api-service root)

        Returns:
            Dict with seeding results by level_code
        """
        result = {
            "entities_seeded": 0,
            "by_level": {},
            "errors": []
        }

        # Load hierarchy from CSV
        csv_rows = self._load_csv_file(csv_path)
        if not csv_rows:
            self.logger.warning(f"No hierarchy data found in {csv_path}, skipping seeding")
            return result

        now = datetime.utcnow().isoformat() + "Z"
        # org_hierarchy is in central dataset for consistency with other org_* tables
        table_id = f"{self.settings.gcp_project_id}.organizations.org_hierarchy"

        # Build entity lookup for path computation
        entity_lookup = {row["entity_id"]: row for row in csv_rows}

        def compute_path_info(entity_id: str) -> tuple:
            """Compute path, path_ids, path_names, and depth for an entity.
            FIX EDGE-002: Added cycle detection to prevent infinite loops.
            """
            path_ids = []
            path_names = []
            current_id = entity_id
            visited = set()  # FIX EDGE-002: Track visited entities to detect cycles

            while current_id:
                # FIX EDGE-002: Detect circular references
                if current_id in visited:
                    self.logger.warning(f"Circular reference detected in hierarchy: {current_id}")
                    break
                visited.add(current_id)

                entity = entity_lookup.get(current_id)
                if not entity:
                    break
                path_ids.insert(0, current_id)
                path_names.insert(0, entity["entity_name"])
                current_id = entity.get("parent_id")

            path = "/" + "/".join(path_ids)
            depth = len(path_ids) - 1  # 0 for root
            return path, path_ids, path_names, depth

        # Build hierarchy rows with computed paths from CSV data
        default_hierarchy = []
        for row in csv_rows:
            entity_id = row["entity_id"]
            path, path_ids, path_names, depth = compute_path_info(entity_id)

            # Parse metadata - it's already a string from CSV, but might be JSON
            metadata = row.get("metadata")
            if metadata and isinstance(metadata, str):
                try:
                    # Validate it's valid JSON, keep as string for BQ
                    json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = json.dumps({"raw": metadata})
            elif metadata and isinstance(metadata, dict):
                metadata = json.dumps(metadata)
            else:
                metadata = None

            entity = {
                "id": str(uuid.uuid4()),
                "org_slug": org_slug,
                "entity_id": entity_id,
                "entity_name": row["entity_name"],
                "level": int(row["level"]),
                "level_code": row["level_code"],
                "parent_id": row.get("parent_id") or None,
                "path": path,
                "path_ids": path_ids,
                "path_names": path_names,
                "depth": depth,
                "owner_id": None,
                "owner_name": row.get("owner_name"),
                "owner_email": row.get("owner_email"),
                "description": row.get("description"),
                "metadata": metadata,
                "sort_order": int(row.get("sort_order") or 0),
                "is_active": True,
                "created_at": now,
                "created_by": "system",
                "updated_at": now,
                "updated_by": "system",
                "version": 1,
                "end_date": None
            }
            default_hierarchy.append(entity)

        if not default_hierarchy:
            self.logger.warning("No hierarchy entities built from CSV")
            return result

        try:
            client = bigquery.Client(project=self.settings.gcp_project_id)

            # FIX IDEM-001: Check for existing entities before inserting (idempotency)
            existing_query = f"""
                SELECT entity_id FROM `{table_id}`
                WHERE org_slug = @org_slug
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
            existing_result = client.query(existing_query, job_config=job_config).result()
            existing_entity_ids = {row.entity_id for row in existing_result}

            # Filter out entities that already exist
            new_entities = [
                entity for entity in default_hierarchy
                if entity["entity_id"] not in existing_entity_ids
            ]

            if not new_entities:
                self.logger.info(f"All hierarchy entities already exist for {org_slug}, skipping insert")
                # Count existing entities in result
                for entity in default_hierarchy:
                    level_code = entity["level_code"]
                    result["by_level"][level_code] = result["by_level"].get(level_code, 0) + 1
                    result["entities_seeded"] += 1
                return result

            if len(new_entities) < len(default_hierarchy):
                self.logger.info(
                    f"Skipping {len(default_hierarchy) - len(new_entities)} existing entities, "
                    f"inserting {len(new_entities)} new entities"
                )

            # Use BigQuery streaming insert for new entities only
            errors = client.insert_rows_json(table_id, new_entities)

            if errors:
                self.logger.error(f"Errors inserting default hierarchy: {errors}")
                result["errors"].extend([str(e) for e in errors])
            else:
                # Count by level_code (all entities, including pre-existing)
                for entity in default_hierarchy:
                    level_code = entity["level_code"]
                    result["by_level"][level_code] = result["by_level"].get(level_code, 0) + 1
                    result["entities_seeded"] += 1

                self.logger.info(
                    f"Seeded hierarchy from CSV for {org_slug}: "
                    f"{len(new_entities)} new entities, {len(existing_entity_ids)} existing ({result['by_level']})"
                )

        except Exception as e:
            self.logger.error(f"Failed to seed default hierarchy: {e}")
            result["errors"].append(str(e))

        return result

    async def _seed_genai_data(
        self,
        bq_client: BigQueryClient,
        dataset_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Seed GenAI subscription and pricing data from CSV files.

        Args:
            bq_client: BigQuery client
            dataset_id: Organization dataset ID
            config: Configuration containing CSV file paths

        Returns:
            Dict with seeding results
        """
        result = {
            "subscriptions_seeded": 0,
            "pricing_seeded": 0,
            "errors": []
        }

        subscriptions_csv = config.get("subscriptions_csv")
        pricing_csv = config.get("genai_pricing_csv")
        now = datetime.utcnow().isoformat() + "Z"

        # Seed subscriptions
        if subscriptions_csv:
            subscriptions = self._load_csv_file(subscriptions_csv)
            if subscriptions:
                table_id = f"{self.settings.gcp_project_id}.{dataset_id}.subscriptions"
                try:
                    client = bigquery.Client(project=self.settings.gcp_project_id)

                    # FIX IDEM-002: Check for existing subscriptions (idempotency)
                    existing_query = f"SELECT subscription_id FROM `{table_id}`"
                    try:
                        existing_result = client.query(existing_query).result()
                        existing_ids = {row.subscription_id for row in existing_result}
                    except NotFound:
                        existing_ids = set()

                    rows_to_insert = []
                    for sub in subscriptions:
                        sub_id = sub.get("subscription_id") or str(uuid.uuid4())
                        # FIX IDEM-002: Skip if already exists
                        if sub_id in existing_ids:
                            continue
                        row = {
                            "subscription_id": sub_id,
                            "provider": sub.get("provider"),
                            "plan_name": sub.get("plan_name"),
                            "is_custom": sub.get("is_custom", False),
                            "quantity": sub.get("quantity", 0),
                            "unit_price": sub.get("unit_price", 0.0),
                            "effective_date": sub.get("effective_date"),
                            "end_date": sub.get("end_date"),
                            "is_enabled": sub.get("is_enabled", True),
                            "auth_type": sub.get("auth_type"),
                            "notes": sub.get("notes"),
                            "x_gemini_project_id": sub.get("x_gemini_project_id"),
                            "x_gemini_region": sub.get("x_gemini_region"),
                            "x_anthropic_workspace_id": sub.get("x_anthropic_workspace_id"),
                            "x_openai_org_id": sub.get("x_openai_org_id"),
                            "created_at": now,
                            "updated_at": now
                        }
                        rows_to_insert.append(row)

                    if not rows_to_insert:
                        self.logger.info(f"All subscriptions already exist in {table_id}, skipping insert")
                        result["subscriptions_seeded"] = len(existing_ids)
                    else:
                        # Use BigQuery streaming insert
                        errors = client.insert_rows_json(table_id, rows_to_insert)

                        if errors:
                            self.logger.error(f"Errors inserting subscriptions: {errors}")
                            result["errors"].extend([str(e) for e in errors])
                        else:
                            result["subscriptions_seeded"] = len(rows_to_insert)
                            self.logger.info(f"Seeded {len(rows_to_insert)} new subscriptions to {table_id} ({len(existing_ids)} existing)")

                except Exception as e:
                    self.logger.error(f"Failed to seed subscriptions: {e}")
                    result["errors"].append(str(e))

        # Seed pricing
        if pricing_csv:
            pricing_rows = self._load_csv_file(pricing_csv)
            if pricing_rows:
                table_id = f"{self.settings.gcp_project_id}.{dataset_id}.genai_model_pricing"
                try:
                    client = bigquery.Client(project=self.settings.gcp_project_id)

                    # FIX IDEM-002: Check for existing pricing records (idempotency)
                    existing_query = f"SELECT pricing_id FROM `{table_id}`"
                    try:
                        existing_result = client.query(existing_query).result()
                        existing_ids = {row.pricing_id for row in existing_result}
                    except NotFound:
                        existing_ids = set()

                    rows_to_insert = []
                    for price in pricing_rows:
                        price_id = price.get("pricing_id") or str(uuid.uuid4())
                        # FIX IDEM-002: Skip if already exists
                        if price_id in existing_ids:
                            continue
                        row = {
                            "pricing_id": price_id,
                            "provider": price.get("provider"),
                            "model_id": price.get("model_id"),
                            "model_name": price.get("model_name"),
                            "is_custom": price.get("is_custom", False),
                            "input_price_per_1k": price.get("input_price_per_1k", 0.0),
                            "output_price_per_1k": price.get("output_price_per_1k", 0.0),
                            "effective_date": price.get("effective_date"),
                            "end_date": price.get("end_date"),
                            "is_enabled": price.get("is_enabled", True),
                            "notes": price.get("notes"),
                            "x_gemini_context_window": price.get("x_gemini_context_window"),
                            "x_gemini_region": price.get("x_gemini_region"),
                            "x_anthropic_tier": price.get("x_anthropic_tier"),
                            "x_openai_batch_input_price": price.get("x_openai_batch_input_price"),
                            "x_openai_batch_output_price": price.get("x_openai_batch_output_price"),
                            "created_at": now,
                            "updated_at": now
                        }
                        rows_to_insert.append(row)

                    if not rows_to_insert:
                        self.logger.info(f"All pricing records already exist in {table_id}, skipping insert")
                        result["pricing_seeded"] = len(existing_ids)
                    else:
                        # Use BigQuery streaming insert
                        errors = client.insert_rows_json(table_id, rows_to_insert)

                        if errors:
                            self.logger.error(f"Errors inserting pricing: {errors}")
                            result["errors"].extend([str(e) for e in errors])
                        else:
                            result["pricing_seeded"] = len(rows_to_insert)
                            self.logger.info(f"Seeded {len(rows_to_insert)} new pricing records to {table_id} ({len(existing_ids)} existing)")

                except Exception as e:
                    self.logger.error(f"Failed to seed pricing: {e}")
                    result["errors"].append(str(e))

        return result

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute organization onboarding - create dataset and all metadata tables

        Args:
            step_config: Step configuration from pipeline YAML (contains metadata_tables list)
            context: Execution context (org_slug, etc.)

        Returns:
            Execution result with tables created
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        # Get configuration values
        # IMPORTANT: Use get_org_dataset_name to append environment suffix
        # Format: {org_slug}_{environment} (e.g., acme_corp_local, acme_corp_prod)
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        location = config.get("location", "US")
        metadata_tables = config.get("metadata_tables", [])

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        self.logger.info(
            f"Starting organization onboarding for {org_slug}",
            extra={
                "org_slug": org_slug,
                "dataset_id": dataset_id,
                "tables_to_create": len(metadata_tables)
            }
        )

        # Step 1: Create dataset
        dataset_created = await self._create_dataset(bq_client, dataset_id, location)
        if not dataset_created:
            return {
                "status": "FAILED",
                "error": f"Failed to create dataset {dataset_id}",
                "org_slug": org_slug
            }

        # Step 2: Create all metadata tables from configuration
        tables_created = []
        tables_failed = []

        for table_config in metadata_tables:
            table_name = table_config.get("table_name")
            schema_file = table_config.get("schema_file")
            description = table_config.get("description")
            partition_field = table_config.get("partition_field")
            clustering_fields = table_config.get("clustering_fields")

            self.logger.info(f"Creating table {table_name} from schema {schema_file}")

            # Load schema from file
            schema = self._load_schema_file(schema_file)
            if not schema:
                self.logger.error(f"Failed to load schema for {table_name}")
                tables_failed.append(table_name)
                continue

            # Create the table with optional partitioning and clustering
            success = await self._create_table(
                bq_client=bq_client,
                dataset_id=dataset_id,
                table_name=table_name,
                schema=schema,
                description=description,
                partition_field=partition_field,
                clustering_fields=clustering_fields
            )

            if success:
                tables_created.append(table_name)
            else:
                tables_failed.append(table_name)

        # Step 3: Initial quota record (SKIPPED - handled by API endpoint)
        # NOTE: When called from /api/v1/organizations/onboard, quota record is already created
        # This step is only for standalone processor execution (testing)
        # FIX ERR-002: Track quota creation status in result
        create_quota = config.get("create_quota_record", False)
        quota_created = False  # FIX ERR-002: Track creation status
        if create_quota:
            self.logger.info(f"Creating initial quota record for organization {org_slug}")
            try:
                import uuid
                from datetime import datetime

                quota_table = f"{self.settings.gcp_project_id}.organizations.org_usage_quotas"
                usage_id = str(uuid.uuid4())

                # Default quotas for new organizations
                default_daily_limit = config.get("default_daily_limit", 50)
                default_monthly_limit = config.get("default_monthly_limit", 1000)
                default_concurrent_limit = config.get("default_concurrent_limit", 5)

                quota_insert_query = f"""
                INSERT INTO `{quota_table}` (
                    usage_id,
                    org_slug,
                    usage_date,
                    pipelines_run_today,
                    pipelines_succeeded_today,
                    pipelines_failed_today,
                    pipelines_run_month,
                    concurrent_pipelines_running,
                    daily_limit,
                    monthly_limit,
                    concurrent_limit,
                    last_updated,
                    created_at
                )
                VALUES (
                    @usage_id,
                    @org_slug,
                    CURRENT_DATE(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    @default_daily_limit,
                    @default_monthly_limit,
                    @default_concurrent_limit,
                    CURRENT_TIMESTAMP(),
                    CURRENT_TIMESTAMP()
                )
                """

                # Execute query with parameterized values (prevents SQL injection)
                query_params = [
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("default_daily_limit", "INT64", default_daily_limit),
                    bigquery.ScalarQueryParameter("default_monthly_limit", "INT64", default_monthly_limit),
                    bigquery.ScalarQueryParameter("default_concurrent_limit", "INT64", default_concurrent_limit),
                ]
                job_config = bigquery.QueryJobConfig(
                    query_parameters=query_params,
                    job_timeout_ms=300000  # 5 minutes for onboarding ops
                )
                bq_client.client.query(quota_insert_query, job_config=job_config).result()
                quota_created = True  # FIX ERR-002: Mark as successfully created
                self.logger.info(
                    f"Created initial quota record for organization {org_slug}",
                    extra={
                        "org_slug": org_slug,
                        "daily_limit": default_daily_limit,
                        "monthly_limit": default_monthly_limit,
                        "concurrent_limit": default_concurrent_limit
                    }
                )
            except Exception as e:
                self.logger.error(f"Failed to create initial quota record: {e}", exc_info=True)
                # FIX ERR-002: quota_created stays False, will be reflected in result
                # Don't fail onboarding if quota record creation fails
                # Admin can manually add it later
        else:
            self.logger.info(f"Skipping quota creation (handled by API endpoint)")
            quota_created = None  # FIX ERR-002: None indicates skipped (handled elsewhere)

        # Step 4a: Seed default hierarchy LEVELS (required before seeding entities)
        # Creates the level configuration (c_suite, business_unit, function)
        try:
            level_service = HierarchyLevelService(bq_client)
            await level_service.seed_default_levels(org_slug, "system")
            self.logger.info(f"Seeded default hierarchy levels for {org_slug}")
        except Exception as e:
            self.logger.warning(f"Failed to seed hierarchy levels (may already exist): {e}")

        # Step 4b: Seed default hierarchy ENTITIES from CSV (always enabled for new orgs)
        # CSV file: configs/hierarchy/seed/data/default_hierarchy.csv
        # Default: FinOps Foundation enterprise structure (17 entities across 3 levels)
        hierarchy_result = await self._seed_default_hierarchy(bq_client, dataset_id, org_slug)
        if hierarchy_result.get("errors"):
            self.logger.warning(f"Default hierarchy seeding had errors: {hierarchy_result['errors']}")

        # Step 5: Create organization-specific materialized view (x_pipeline_exec_logs)
        # This MV queries central organizations tables filtered by org_slug
        views_created, views_failed = self._create_org_materialized_views(org_slug, dataset_id)

        # Step 5: Seed GenAI subscription and pricing data if configured
        genai_seed_result = {"subscriptions_seeded": 0, "pricing_seeded": 0, "errors": []}
        if config.get("seed_genai_data", False):
            self.logger.info(f"Seeding GenAI data for organization {org_slug}")
            genai_seed_result = await self._seed_genai_data(bq_client, dataset_id, config)
            if genai_seed_result.get("errors"):
                self.logger.warning(
                    f"GenAI seeding completed with errors: {genai_seed_result['errors']}"
                )
            else:
                self.logger.info(
                    f"GenAI seeding complete: {genai_seed_result['subscriptions_seeded']} subscriptions, "
                    f"{genai_seed_result['pricing_seeded']} pricing records"
                )

        # Prepare result
        all_tables_failed = tables_failed + views_failed
        hierarchy_total = hierarchy_result.get("entities_seeded", 0)
        hierarchy_by_level = hierarchy_result.get("by_level", {})
        result = {
            "status": "SUCCESS" if not all_tables_failed else "PARTIAL",
            "org_slug": org_slug,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created": tables_created,
            "views_created": views_created,
            "tables_failed": tables_failed,
            "views_failed": views_failed,
            # FIX ERR-002: Include quota creation status in result
            "quota_created": quota_created,  # True=created, False=failed, None=skipped
            "hierarchy_seeded": {
                "total": hierarchy_total,
                "by_level": hierarchy_by_level
            },
            "subscriptions_seeded": genai_seed_result.get("subscriptions_seeded", 0),
            "genai_pricing_seeded": genai_seed_result.get("pricing_seeded", 0),
            "message": f"Created {len(tables_created)} tables, {len(views_created)} views, and {hierarchy_total} hierarchy entities for organization {org_slug}"
        }

        if all_tables_failed:
            result["error"] = f"Failed to create: {', '.join(all_tables_failed)}"

        # Log onboarding completion without using 'message' in extra dict
        # 'message' is a reserved field in Python's LogRecord
        log_context = {
            "org_slug": org_slug,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created_count": len(tables_created),
            "views_created_count": len(views_created),
            "tables_failed_count": len(tables_failed),
            "views_failed_count": len(views_failed),
            "status": result["status"]
        }
        self.logger.info(
            f"Onboarding completed for {org_slug}: Created {len(tables_created)} tables, {len(views_created)} views",
            extra=log_context
        )

        return result

    def _create_org_materialized_views(self, org_slug: str, dataset_id: str):
        """Create organization-specific materialized views in organization's dataset.

        Creates a single materialized view that queries CENTRAL organizations tables:
        - x_pipeline_exec_logs: MV filtering org_meta_pipeline_runs + org_meta_step_logs by org_slug

        Architecture:
            organizations.org_meta_pipeline_runs + organizations.org_meta_step_logs
            -> {org_dataset}.x_pipeline_exec_logs (filtered by org_slug)

        Data Flow:
            1. Pipeline service writes logs to CENTRAL organizations dataset
            2. This MV filters central data for THIS org only
            3. Frontend queries this MV for fast, pre-filtered results

        Benefits:
            - Single materialized view per org
            - Queries central tables (no data duplication)
            - Auto-refreshed every 30 minutes
            - Denormalized for fast dashboard queries
        """
        client = bigquery.Client(project=self.settings.gcp_project_id)

        # Materialized views querying central tables
        mv_files = [
            ("x_pipeline_exec_logs_mv.sql", "x_pipeline_exec_logs"),
            ("x_all_notifications_mv.sql", "x_all_notifications"),
            ("x_notification_stats_mv.sql", "x_notification_stats"),
            ("x_org_hierarchy_mv.sql", "x_org_hierarchy"),
        ]

        views_created = []
        views_failed = []

        for mv_filename, mv_name in mv_files:
            mv_file = self.views_dir / mv_filename

            if not mv_file.exists():
                self.logger.warning(f"Materialized view SQL file not found: {mv_file}")
                views_failed.append(mv_name)
                continue

            try:
                with open(mv_file, 'r') as f:
                    mv_sql = f.read()

                # Replace placeholders
                mv_sql = mv_sql.replace('{project_id}', self.settings.gcp_project_id)
                mv_sql = mv_sql.replace('{dataset_id}', dataset_id)
                mv_sql = mv_sql.replace('{org_slug}', org_slug)

                # Execute materialized view creation
                job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minutes for onboarding ops
                query_job = client.query(mv_sql, job_config=job_config)
                query_job.result()  # Wait for completion

                views_created.append(mv_name)
                self.logger.info(
                    f"Created materialized view: {self.settings.gcp_project_id}.{dataset_id}.{mv_name}"
                )

            except Exception as e:
                views_failed.append(mv_name)
                self.logger.error(f"Failed to create materialized view {mv_name}: {e}", exc_info=True)

        return views_created, views_failed


# Function for pipeline executor to call
async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = OrgOnboardingProcessor()
    return await processor.execute(step_config, context)
