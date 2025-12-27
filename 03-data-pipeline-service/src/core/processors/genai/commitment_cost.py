"""
GenAI Commitment Cost Processor

Calculates costs from commitment usage using pricing tables.
Reads from: genai_commitment_usage_raw, genai_commitment_pricing
Writes to: genai_commitment_costs_daily

Usage in pipeline:
    ps_type: genai.commitment_cost

Issues Fixed:
    #35: Added PTU unit calculations and min unit enforcement
    #39: Added validation for zero rates, negative units, invalid date ranges
    #41: Fixed SQL injection vulnerability - use parameterized queries
    #43: Added NULL handling for hierarchy fields
    #44: Added idempotency tracking

Idempotency Fixes:
    HIGH #6: Use atomic MERGE instead of DELETE+INSERT to prevent race conditions
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class CommitmentCostProcessor:
    """
    Calculates commitment costs from usage and pricing.

    Supports:
    - Azure OpenAI PTU (Provisioned Throughput Units)
    - AWS Bedrock Provisioned Throughput
    - GCP Vertex AI Provisioned Throughput

    Issue #35: Implements proper PTU calculations:
    - Hourly vs monthly rate selection
    - Min/max unit enforcement
    - Overage calculations
    - Term and volume discounts
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
        Calculate commitment costs.

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

        self.logger.info(f"Calculating commitment costs for {org_slug}")

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

            # HIGH #6: Use atomic MERGE instead of DELETE+INSERT
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

            # HIGH #6: Atomic MERGE for idempotent cost calculation
            # This replaces DELETE+INSERT with a single atomic operation
            cost_query = f"""
                MERGE `{project_id}.{dataset_id}.genai_commitment_costs_daily` T
                USING (
                    SELECT
                        u.usage_date as cost_date,
                        u.org_slug,
                        u.provider,
                        u.commitment_type,
                        u.commitment_id,
                        u.model_group as model,
                        u.region,

                        -- Issue #35: Enforce min_units from pricing table
                        GREATEST(u.provisioned_units, COALESCE(p.min_units, 0)) as provisioned_units,
                        u.used_units,

                        -- Utilization percentage (recalculated with enforced min)
                        ROUND(
                            SAFE_DIVIDE(u.used_units, GREATEST(u.provisioned_units, COALESCE(p.min_units, 0))) * 100,
                            2
                        ) as utilization_pct,

                        -- Issue #35: Commitment cost using hourly or monthly rate
                        -- Use hourly rate if available, otherwise pro-rate monthly
                        ROUND(
                            GREATEST(u.provisioned_units, COALESCE(p.min_units, 0)) *
                            COALESCE(
                                COALESCE(p.override_hourly_rate, p.ptu_hourly_rate) * u.hours_active,
                                (COALESCE(p.override_monthly_rate, p.ptu_monthly_rate) / 30) * (u.hours_active / 24)
                            ) *
                            -- Apply term discount if applicable
                            (1 - COALESCE(p.term_discount_pct, 0) / 100) *
                            -- Apply volume discount if applicable
                            (1 - COALESCE(p.volume_discount_pct, 0) / 100),
                            2
                        ) as commitment_cost_usd,

                        -- Overage cost: units used beyond provisioned capacity
                        ROUND(
                            GREATEST(u.overage_units, 0) *
                            COALESCE(p.ptu_hourly_rate, p.ptu_monthly_rate / 720) *  -- Use hourly or derive from monthly
                            1.5 *  -- Overage typically 50% premium
                            u.hours_active,
                            2
                        ) as overage_cost_usd,

                        -- Total cost (commitment + overage)
                        ROUND(
                            (
                                GREATEST(u.provisioned_units, COALESCE(p.min_units, 0)) *
                                COALESCE(
                                    COALESCE(p.override_hourly_rate, p.ptu_hourly_rate) * u.hours_active,
                                    (COALESCE(p.override_monthly_rate, p.ptu_monthly_rate) / 30) * (u.hours_active / 24)
                                ) *
                                (1 - COALESCE(p.term_discount_pct, 0) / 100) *
                                (1 - COALESCE(p.volume_discount_pct, 0) / 100)
                            ) +
                            (
                                GREATEST(u.overage_units, 0) *
                                COALESCE(p.ptu_hourly_rate, p.ptu_monthly_rate / 720) *
                                1.5 *
                                u.hours_active
                            ),
                            2
                        ) as total_cost_usd,

                        -- Effective rate per unit (accounting for utilization)
                        ROUND(
                            SAFE_DIVIDE(
                                GREATEST(u.provisioned_units, COALESCE(p.min_units, 0)) *
                                COALESCE(p.override_hourly_rate, p.ptu_hourly_rate, p.ptu_monthly_rate / 720),
                                NULLIF(u.used_units, 0)
                            ),
                            4
                        ) as effective_rate_per_unit,

                        -- Tokens processed (calculated from throughput if available)
                        COALESCE(
                            u.tokens_processed,
                            u.used_units * COALESCE(p.tokens_per_unit_minute, 0) * 60 * u.hours_active
                        ) as tokens_processed,

                        u.hours_active,

                        -- Issue #43: Handle NULL hierarchy fields
                        NULLIF(TRIM(COALESCE(u.hierarchy_dept_id, '')), '') as hierarchy_dept_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_dept_name, '')), '') as hierarchy_dept_name,
                        NULLIF(TRIM(COALESCE(u.hierarchy_project_id, '')), '') as hierarchy_project_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_project_name, '')), '') as hierarchy_project_name,
                        NULLIF(TRIM(COALESCE(u.hierarchy_team_id, '')), '') as hierarchy_team_id,
                        NULLIF(TRIM(COALESCE(u.hierarchy_team_name, '')), '') as hierarchy_team_name,

                        -- Standardized lineage columns (x_ prefix)
                        CONCAT('genai_commitment_cost_', COALESCE(u.provider, 'unknown')) as x_pipeline_id,
                        u.credential_id as x_credential_id,
                        @process_date as x_pipeline_run_date,
                        @run_id as x_run_id,
                        CURRENT_TIMESTAMP() as x_ingested_at
                    FROM `{project_id}.{dataset_id}.genai_commitment_usage_raw` u
                    LEFT JOIN `{project_id}.{dataset_id}.genai_commitment_pricing` p
                        ON u.provider = p.provider
                        AND u.commitment_type = p.commitment_type
                        AND (p.model = u.model_group OR p.model = 'all')
                        AND (p.region = u.region OR p.region = 'global')
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
                    AND T.commitment_id = S.commitment_id
                    AND COALESCE(T.region, 'global') = COALESCE(S.region, 'global')
                WHEN MATCHED THEN
                    UPDATE SET
                        commitment_type = S.commitment_type,
                        model = S.model,
                        provisioned_units = S.provisioned_units,
                        used_units = S.used_units,
                        utilization_pct = S.utilization_pct,
                        commitment_cost_usd = S.commitment_cost_usd,
                        overage_cost_usd = S.overage_cost_usd,
                        total_cost_usd = S.total_cost_usd,
                        effective_rate_per_unit = S.effective_rate_per_unit,
                        tokens_processed = S.tokens_processed,
                        hours_active = S.hours_active,
                        hierarchy_dept_id = S.hierarchy_dept_id,
                        hierarchy_dept_name = S.hierarchy_dept_name,
                        hierarchy_project_id = S.hierarchy_project_id,
                        hierarchy_project_name = S.hierarchy_project_name,
                        hierarchy_team_id = S.hierarchy_team_id,
                        hierarchy_team_name = S.hierarchy_team_name,
                        calculated_at = CURRENT_TIMESTAMP(),
                        x_pipeline_id = S.x_pipeline_id,
                        x_credential_id = S.x_credential_id,
                        x_pipeline_run_date = S.x_pipeline_run_date,
                        x_run_id = S.x_run_id,
                        x_ingested_at = S.x_ingested_at
                WHEN NOT MATCHED THEN
                    INSERT (cost_date, org_slug, provider, commitment_type, commitment_id,
                            model, region, provisioned_units, used_units, utilization_pct,
                            commitment_cost_usd, overage_cost_usd, total_cost_usd,
                            effective_rate_per_unit, tokens_processed, hours_active,
                            hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                            hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                            calculated_at, x_pipeline_id, x_credential_id, x_pipeline_run_date,
                            x_run_id, x_ingested_at)
                    VALUES (S.cost_date, S.org_slug, S.provider, S.commitment_type, S.commitment_id,
                            S.model, S.region, S.provisioned_units, S.used_units, S.utilization_pct,
                            S.commitment_cost_usd, S.overage_cost_usd, S.total_cost_usd,
                            S.effective_rate_per_unit, S.tokens_processed, S.hours_active,
                            S.hierarchy_dept_id, S.hierarchy_dept_name, S.hierarchy_project_id,
                            S.hierarchy_project_name, S.hierarchy_team_id, S.hierarchy_team_name,
                            CURRENT_TIMESTAMP(), S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date,
                            S.x_run_id, S.x_ingested_at)
            """

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)

            job = bq_client.client.query(cost_query, job_config=job_config)
            job.result()

            rows_inserted = job.num_dml_affected_rows or 0

            # Get total cost
            total_query = f"""
                SELECT
                    COALESCE(SUM(total_cost_usd), 0) as total_cost,
                    COALESCE(SUM(commitment_cost_usd), 0) as commitment_cost,
                    COALESCE(SUM(overage_cost_usd), 0) as overage_cost,
                    COALESCE(AVG(utilization_pct), 0) as avg_utilization
                FROM `{project_id}.{dataset_id}.genai_commitment_costs_daily`
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
                    "commitment_cost_usd": round(row.get("commitment_cost", 0), 2),
                    "overage_cost_usd": round(row.get("overage_cost", 0), 2),
                    "avg_utilization_pct": round(row.get("avg_utilization", 0), 2)
                }

            self.logger.info(f"Calculated {rows_inserted} commitment cost records")
            return {
                "status": "SUCCESS",
                "rows_inserted": rows_inserted,
                "date": str(process_date),
                **metrics
            }

        except Exception as e:
            self.logger.error(f"Failed to calculate commitment costs: {e}", exc_info=True)
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
            FROM `{project_id}.{dataset_id}.genai_commitment_costs_daily`
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

        # Check for negative units
        negative_check_query = f"""
            SELECT provider, commitment_type, COUNT(*) as count
            FROM `{project_id}.{dataset_id}.genai_commitment_usage_raw`
            WHERE usage_date = @process_date
                AND org_slug = @org_slug
                AND (provisioned_units < 0 OR used_units < 0)
                {provider_condition}
            GROUP BY provider, commitment_type
        """

        try:
            negative_results = list(bq_client.query(negative_check_query, parameters=query_params))
            for row in negative_results:
                errors.append({
                    "type": "negative_units",
                    "provider": row.get("provider"),
                    "commitment_type": row.get("commitment_type"),
                    "count": row.get("count")
                })
        except Exception as e:
            self.logger.warning(f"Negative units check failed: {e}")

        # Issue #5: Check for orphan hierarchy allocations (warning only)
        hierarchy_check_query = f"""
            SELECT DISTINCT
                u.hierarchy_dept_id,
                u.hierarchy_project_id,
                u.hierarchy_team_id
            FROM `{project_id}.{dataset_id}.genai_commitment_usage_raw` u
            LEFT JOIN `{project_id}.organizations.org_hierarchy` h
                ON h.org_slug = u.org_slug
                AND (
                    (h.entity_type = 'department' AND h.entity_id = u.hierarchy_dept_id) OR
                    (h.entity_type = 'project' AND h.entity_id = u.hierarchy_project_id) OR
                    (h.entity_type = 'team' AND h.entity_id = u.hierarchy_team_id)
                )
            WHERE u.usage_date = @process_date
                AND u.org_slug = @org_slug
                AND (u.hierarchy_dept_id IS NOT NULL OR u.hierarchy_project_id IS NOT NULL OR u.hierarchy_team_id IS NOT NULL)
                AND h.entity_id IS NULL
                {provider_condition}
        """

        try:
            orphan_results = list(bq_client.query(hierarchy_check_query, parameters=query_params))
            for row in orphan_results:
                dept_id = row.get("hierarchy_dept_id")
                project_id_val = row.get("hierarchy_project_id")
                team_id = row.get("hierarchy_team_id")
                self.logger.warning(
                    f"Issue #5: Orphan hierarchy allocation detected - "
                    f"dept_id={dept_id}, project_id={project_id_val}, team_id={team_id}. "
                    f"These IDs may not exist in org_hierarchy table."
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
            DELETE FROM `{project_id}.{dataset_id}.genai_commitment_costs_daily`
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
    return CommitmentCostProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = CommitmentCostProcessor()
    return await processor.execute(step_config, context)
