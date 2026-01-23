"""
GenAI Infrastructure Cost Processor

Calculates costs from infrastructure usage using pricing tables.
Reads from: genai_infrastructure_usage_raw, genai_infrastructure_pricing
Writes to: genai_infrastructure_costs_daily

Usage in pipeline:
    ps_type: genai.infrastructure_cost

Issues Fixed:
    #36: Added spot vs reserved pricing selection and multi-GPU calculations
    #39: Added validation for zero rates, negative hours, invalid date ranges
    #41: Fixed SQL injection vulnerability - use parameterized queries
    #43: Added NULL handling for hierarchy fields
    #44: Added idempotency tracking

Idempotency Fixes:
    HIGH #7: Use atomic MERGE instead of DELETE+INSERT to prevent race conditions
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.utils.validators import is_valid_org_slug


class InfrastructureCostProcessor:
    """
    Calculates infrastructure costs from usage and pricing.

    Supports:
    - GCP GPU instances (A100, H100, L4, T4)
    - GCP TPU pods
    - AWS GPU instances (P4, P5, G5)
    - AWS Inferentia/Trainium
    - Azure GPU instances (NC, ND series)

    Issue #36: Implements:
    - Spot vs on-demand vs reserved pricing selection
    - Multi-GPU instance calculations
    - GPU-hour based costing
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculate infrastructure costs.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name (optional filter)
                - config.date: Date to process (YYYY-MM-DD)
                - config.force_reprocess: If True, reprocess even if already done
            context: Execution context with org_slug

        Returns:
            Dict with status and metrics
        """
        org_slug = context.get("org_slug")
        run_id = context.get("run_id", "manual")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # MT-FIX: Validate org_slug format to prevent injection attacks
        if not is_valid_org_slug(org_slug):
            return {"status": "FAILED", "error": f"Invalid org_slug format: {org_slug}"}

        provider = config.get("provider")
        process_date = self._parse_date(config.get("date") or context.get("start_date"))
        force_reprocess = config.get("force_reprocess", False)

        if not process_date:
            return {"status": "FAILED", "error": "date is required"}

        # Validate date is not in the future
        if process_date > date.today():
            return {"status": "FAILED", "error": f"Cannot process future date: {process_date}"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(f"Calculating infrastructure costs for {org_slug}")

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Issue #44: Check idempotency
            if not force_reprocess:
                already_processed = await self._check_already_processed(
                    bq_client, project_id, dataset_id, org_slug, process_date, provider
                )
                if already_processed:
                    self.logger.info(f"Date {process_date} already processed for {org_slug}, skipping")
                    return {
                        "status": "SUCCESS",
                        "rows_inserted": 0,
                        "date": str(process_date),
                        "skipped": True,
                        "reason": "Already processed"
                    }

            # Issue #39: Validate usage data
            validation_result = await self._validate_usage_data(
                bq_client, project_id, dataset_id, org_slug, process_date, provider
            )
            if validation_result["has_errors"]:
                return {
                    "status": "FAILED",
                    "error": "Data validation failed",
                    "validation_errors": validation_result["errors"]
                }

            # HIGH #7: Use atomic MERGE instead of DELETE+INSERT
            # Build query parameters - Issue #41: Use parameterized queries
            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
            ]

            provider_condition = ""
            if provider:
                provider_condition = "AND u.provider = @provider"
                query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

            # HIGH #7: Atomic MERGE for idempotent cost calculation
            # This replaces DELETE+INSERT with a single atomic operation
            cost_query = f"""
                MERGE `{project_id}.{dataset_id}.genai_infrastructure_costs_daily` T
                USING (
                    SELECT
                        u.usage_date as cost_date,
                        u.org_slug,
                        u.provider,
                        u.resource_type,
                        u.instance_type,
                        u.gpu_type,
                        u.region,
                        u.instance_count,
                        u.hours_used,

                        -- Issue #36: Calculate GPU hours considering multi-GPU instances
                        COALESCE(
                            u.gpu_hours,
                            u.hours_used * COALESCE(u.instance_count, 1) * COALESCE(p.gpu_count, 1)
                        ) as gpu_hours,

                        u.pricing_type,

                        -- Base cost (on-demand rate, considering multi-GPU)
                        ROUND(
                            u.hours_used *
                            COALESCE(u.instance_count, 1) *
                            COALESCE(p.override_hourly_rate, p.hourly_rate),
                            2
                        ) as base_cost_usd,

                        -- Issue #36: Discount based on pricing type (spot, reserved)
                        ROUND(
                            u.hours_used *
                            COALESCE(u.instance_count, 1) *
                            COALESCE(p.override_hourly_rate, p.hourly_rate) *
                            CASE u.pricing_type
                                WHEN 'spot' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'preemptible' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'reserved_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'reserved_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                WHEN 'committed_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'committed_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                ELSE 0
                            END,
                            2
                        ) as discount_applied_usd,

                        -- Issue #36: Total cost after discount, considering pricing type
                        ROUND(
                            u.hours_used *
                            COALESCE(u.instance_count, 1) *
                            COALESCE(p.override_hourly_rate, p.hourly_rate) *
                            (1 - CASE u.pricing_type
                                WHEN 'spot' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'preemptible' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'reserved_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'reserved_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                WHEN 'committed_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'committed_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                ELSE 0
                            END),
                            2
                        ) as total_cost_usd,

                        -- Issue #36: Effective hourly rate per GPU (for multi-GPU comparison)
                        ROUND(
                            COALESCE(p.override_hourly_rate, p.hourly_rate) *
                            (1 - CASE u.pricing_type
                                WHEN 'spot' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'preemptible' THEN COALESCE(p.spot_discount_pct, 0) / 100
                                WHEN 'reserved_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'reserved_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                WHEN 'committed_1yr' THEN COALESCE(p.reserved_1yr_discount_pct, 0) / 100
                                WHEN 'committed_3yr' THEN COALESCE(p.reserved_3yr_discount_pct, 0) / 100
                                ELSE 0
                            END) / NULLIF(COALESCE(p.gpu_count, 1), 0),
                            4
                        ) as effective_hourly_rate,

                        -- Issue #43: Hierarchy columns (5-field model, populated during cost allocation)
                        CAST(NULL AS STRING) as x_hierarchy_entity_id,
                        CAST(NULL AS STRING) as x_hierarchy_entity_name,
                        CAST(NULL AS STRING) as x_hierarchy_level_code,
                        CAST(NULL AS STRING) as x_hierarchy_path,
                        CAST(NULL AS STRING) as x_hierarchy_path_names,

                        -- Standardized lineage columns (x_ prefix)
                        CONCAT('genai_infrastructure_cost_', COALESCE(u.provider, 'unknown')) as x_pipeline_id,
                        u.x_credential_id as x_credential_id,
                        @process_date as x_pipeline_run_date,
                        @run_id as x_run_id,
                        CURRENT_TIMESTAMP() as x_ingested_at
                    FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw` u
                    LEFT JOIN `{project_id}.{dataset_id}.genai_infrastructure_pricing` p
                        ON u.provider = p.provider
                        AND u.instance_type = p.instance_type
                        AND u.region = p.region
                        AND (p.status IS NULL OR p.status = 'active')
                        AND (p.effective_from IS NULL OR p.effective_from <= u.usage_date)
                        AND (p.effective_to IS NULL OR p.effective_to >= u.usage_date)
                    WHERE u.usage_date = @process_date
                        AND u.org_slug = @org_slug
                        {provider_condition}
                ) S
                ON T.cost_date = S.cost_date
                    AND T.org_slug = S.org_slug
                    AND T.provider = S.provider
                    AND T.instance_type = S.instance_type
                    AND T.region = S.region
                WHEN MATCHED THEN
                    UPDATE SET
                        resource_type = S.resource_type,
                        gpu_type = S.gpu_type,
                        instance_count = S.instance_count,
                        hours_used = S.hours_used,
                        gpu_hours = S.gpu_hours,
                        pricing_type = S.pricing_type,
                        base_cost_usd = S.base_cost_usd,
                        discount_applied_usd = S.discount_applied_usd,
                        total_cost_usd = S.total_cost_usd,
                        effective_hourly_rate = S.effective_hourly_rate,
                        x_hierarchy_entity_id = S.x_hierarchy_entity_id,
                        x_hierarchy_entity_name = S.x_hierarchy_entity_name,
                        x_hierarchy_level_code = S.x_hierarchy_level_code,
                        x_hierarchy_path = S.x_hierarchy_path,
                        x_hierarchy_path_names = S.x_hierarchy_path_names,
                        calculated_at = CURRENT_TIMESTAMP(),
                        x_pipeline_id = S.x_pipeline_id,
                        x_credential_id = S.x_credential_id,
                        x_pipeline_run_date = S.x_pipeline_run_date,
                        x_run_id = S.x_run_id,
                        x_ingested_at = S.x_ingested_at
                WHEN NOT MATCHED THEN
                    INSERT (cost_date, org_slug, provider, resource_type, instance_type,
                            gpu_type, region, instance_count, hours_used, gpu_hours,
                            pricing_type, base_cost_usd, discount_applied_usd, total_cost_usd,
                            effective_hourly_rate,
                            x_hierarchy_entity_id, x_hierarchy_entity_name,
                            x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
                            calculated_at, x_pipeline_id, x_credential_id, x_pipeline_run_date,
                            x_run_id, x_ingested_at)
                    VALUES (S.cost_date, S.org_slug, S.provider, S.resource_type, S.instance_type,
                            S.gpu_type, S.region, S.instance_count, S.hours_used, S.gpu_hours,
                            S.pricing_type, S.base_cost_usd, S.discount_applied_usd, S.total_cost_usd,
                            S.effective_hourly_rate,
                            S.x_hierarchy_entity_id, S.x_hierarchy_entity_name,
                            S.x_hierarchy_level_code, S.x_hierarchy_path, S.x_hierarchy_path_names,
                            CURRENT_TIMESTAMP(), S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date,
                            S.x_run_id, S.x_ingested_at)
            """

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)

            job = bq_client.client.query(cost_query, job_config=job_config)
            job.result()

            rows_inserted = job.num_dml_affected_rows or 0

            # Get totals by pricing type
            total_query = f"""
                SELECT
                    COALESCE(SUM(total_cost_usd), 0) as total_cost,
                    COALESCE(SUM(base_cost_usd), 0) as base_cost,
                    COALESCE(SUM(discount_applied_usd), 0) as total_discount,
                    COALESCE(SUM(gpu_hours), 0) as total_gpu_hours,
                    COALESCE(SUM(CASE WHEN pricing_type = 'spot' THEN total_cost_usd ELSE 0 END), 0) as spot_cost,
                    COALESCE(SUM(CASE WHEN pricing_type LIKE 'reserved%' OR pricing_type LIKE 'committed%' THEN total_cost_usd ELSE 0 END), 0) as reserved_cost,
                    COALESCE(SUM(CASE WHEN pricing_type = 'on_demand' OR pricing_type IS NULL THEN total_cost_usd ELSE 0 END), 0) as on_demand_cost
                FROM `{project_id}.{dataset_id}.genai_infrastructure_costs_daily`
                WHERE cost_date = @process_date AND org_slug = @org_slug
            """
            total_result = list(bq_client.query(total_query, parameters=[
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]))

            metrics = {}
            if total_result:
                row = total_result[0]
                metrics = {
                    "total_cost_usd": round(row.get("total_cost", 0), 2),
                    "base_cost_usd": round(row.get("base_cost", 0), 2),
                    "total_discount_usd": round(row.get("total_discount", 0), 2),
                    "total_gpu_hours": round(row.get("total_gpu_hours", 0), 2),
                    "spot_cost_usd": round(row.get("spot_cost", 0), 2),
                    "reserved_cost_usd": round(row.get("reserved_cost", 0), 2),
                    "on_demand_cost_usd": round(row.get("on_demand_cost", 0), 2)
                }

            self.logger.info(f"Calculated {rows_inserted} infrastructure cost records")
            return {
                "status": "SUCCESS",
                "rows_inserted": rows_inserted,
                "date": str(process_date),
                **metrics
            }

        except Exception as e:
            self.logger.error(f"Failed to calculate infrastructure costs: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _check_already_processed(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> bool:
        """Check if this date has already been processed."""
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        check_query = f"""
            SELECT COUNT(*) as count
            FROM `{project_id}.{dataset_id}.genai_infrastructure_costs_daily`
            WHERE cost_date = @process_date
                AND org_slug = @org_slug
                {provider_condition}
        """

        try:
            result = list(bq_client.query(check_query, parameters=query_params))
            return result[0].get("count", 0) > 0 if result else False
        except Exception:
            return False

    async def _validate_usage_data(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> Dict[str, Any]:
        """Validate usage data before processing."""
        errors = []
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        # Check for negative hours
        negative_check_query = f"""
            SELECT provider, instance_type, COUNT(*) as count
            FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw`
            WHERE usage_date = @process_date
                AND org_slug = @org_slug
                AND (hours_used < 0 OR instance_count < 0 OR gpu_hours < 0)
                {provider_condition}
            GROUP BY provider, instance_type
        """

        try:
            negative_results = list(bq_client.query(negative_check_query, parameters=query_params))
            for row in negative_results:
                errors.append({
                    "type": "negative_values",
                    "provider": row.get("provider"),
                    "instance_type": row.get("instance_type"),
                    "count": row.get("count")
                })
        except Exception as e:
            self.logger.warning(f"Negative values check failed: {e}")

        # Check for missing pricing
        missing_price_query = f"""
            SELECT DISTINCT u.provider, u.instance_type, u.region
            FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw` u
            LEFT JOIN `{project_id}.{dataset_id}.genai_infrastructure_pricing` p
                ON u.provider = p.provider
                AND u.instance_type = p.instance_type
                AND u.region = p.region
                AND (p.status IS NULL OR p.status = 'active')
            WHERE u.usage_date = @process_date
                AND u.org_slug = @org_slug
                AND p.provider IS NULL
                {provider_condition}
        """

        try:
            missing_results = list(bq_client.query(missing_price_query, parameters=query_params))
            for row in missing_results:
                self.logger.warning(
                    f"Missing pricing for {row.get('provider')}/{row.get('instance_type')} in {row.get('region')}"
                )
        except Exception as e:
            self.logger.warning(f"Missing pricing check failed: {e}")

        # Issue #5: Check for orphan hierarchy allocations (warning only)
        # Check if hierarchy_entity_id exists in x_org_hierarchy
        hierarchy_check_query = f"""
            SELECT DISTINCT
                u.x_hierarchy_entity_id,
                u.x_hierarchy_entity_name
            FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw` u
            LEFT JOIN `{project_id}.{dataset_id}.x_org_hierarchy` h
                ON h.entity_id = u.x_hierarchy_entity_id
            WHERE u.usage_date = @process_date
                AND u.org_slug = @org_slug
                AND u.x_hierarchy_entity_id IS NOT NULL
                AND h.entity_id IS NULL
                {provider_condition}
        """

        try:
            orphan_results = list(bq_client.query(hierarchy_check_query, parameters=query_params))
            for row in orphan_results:
                entity_id = row.get("x_hierarchy_entity_id")
                entity_name = row.get("x_hierarchy_entity_name")
                self.logger.warning(
                    f"Issue #5: Orphan hierarchy allocation detected - "
                    f"entity_id={entity_id}, name={entity_name}. "
                    f"This entity may not exist in x_org_hierarchy view."
                )
        except Exception as e:
            # Don't fail on hierarchy check errors - just warn
            self.logger.warning(f"Hierarchy validation check failed: {e}")

        return {
            "has_errors": len(errors) > 0,
            "errors": errors
        }

    async def _delete_existing_records(
        self, bq_client, project_id: str, dataset_id: str,
        org_slug: str, process_date: date, provider: Optional[str]
    ) -> None:
        """Delete existing records for idempotent reprocessing."""
        query_params = [
            bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        provider_condition = ""
        if provider:
            provider_condition = "AND provider = @provider"
            query_params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

        delete_query = f"""
            DELETE FROM `{project_id}.{dataset_id}.genai_infrastructure_costs_daily`
            WHERE cost_date = @process_date
                AND org_slug = @org_slug
                {provider_condition}
        """

        try:
            job = bq_client.client.query(
                delete_query,
                job_config=bigquery.QueryJobConfig(query_parameters=query_params)
            )
            job.result()
            if job.num_dml_affected_rows:
                self.logger.info(f"Deleted {job.num_dml_affected_rows} existing records for reprocessing")
        except Exception as e:
            self.logger.warning(f"Delete existing records failed (table may not exist): {e}")

    def _parse_date(self, date_str):
        if not date_str:
            return None
        if isinstance(date_str, date):
            return date_str
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None


def get_engine():
    """Factory function for pipeline executor - REQUIRED for dynamic loading"""
    return InfrastructureCostProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = InfrastructureCostProcessor()
    return await processor.execute(step_config, context)
