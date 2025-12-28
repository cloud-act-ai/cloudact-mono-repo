"""
GenAI Unified Consolidator

Consolidates all 3 flows (PAYG, Commitment, Infrastructure) into unified tables.
Reads from: genai_*_costs_daily, genai_*_usage_raw
Writes to: genai_usage_daily_unified, genai_costs_daily_unified

Usage in pipeline:
    ps_type: genai.unified_consolidator

Idempotency Fixes:
    HIGH #9: Use atomic MERGE instead of DELETE+INSERT to prevent race conditions
"""

import logging
from datetime import datetime, date
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.utils.validators import is_valid_org_slug


class UnifiedConsolidatorProcessor:
    """
    Consolidates GenAI usage and costs from all flows into unified tables.

    This enables:
    - Single query for all GenAI usage/costs
    - Cross-flow analytics and comparisons
    - Simplified dashboard queries
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
        Consolidate GenAI data into unified tables.

        Args:
            step_config: Step configuration containing:
                - config.target: 'usage' or 'costs' or 'both' (default: both)
                - config.date: Date to consolidate
            context: Execution context with org_slug

        Returns:
            Dict with status and row counts
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        if not is_valid_org_slug(org_slug):
            return {
                "status": "FAILED",
                "error": "Invalid org_slug format. Must be alphanumeric with underscores, 3-50 characters (^[a-zA-Z0-9_]{3,50}$)"
            }

        target = config.get("target", "both")
        process_date = self._parse_date(config.get("date") or context.get("start_date"))

        if not process_date:
            return {"status": "FAILED", "error": "date is required"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(f"Consolidating GenAI data for {org_slug}, date={process_date}")

        try:
            bq_client = BigQueryClient(project_id=project_id)
            results = {}

            if target in ["usage", "both"]:
                usage_result = await self._consolidate_usage(
                    bq_client, project_id, dataset_id, org_slug, process_date
                )
                results["usage"] = usage_result

            if target in ["costs", "both"]:
                costs_result = await self._consolidate_costs(
                    bq_client, project_id, dataset_id, org_slug, process_date
                )
                results["costs"] = costs_result

            total_rows = sum(r.get("rows_inserted", 0) for r in results.values())

            self.logger.info(f"Consolidated {total_rows} records into unified tables")
            return {
                "status": "SUCCESS",
                "date": str(process_date),
                "results": results,
                "total_rows": total_rows
            }

        except Exception as e:
            self.logger.error(f"Consolidation failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _consolidate_usage(
        self, bq_client, project_id, dataset_id, org_slug, process_date
    ) -> Dict[str, Any]:
        """
        Consolidate usage from all flows into unified table.

        HIGH #9: Uses atomic MERGE instead of DELETE+INSERT for idempotency.
        """

        # HIGH #9: Atomic MERGE for usage consolidation
        merge_query = f"""
            MERGE `{project_id}.{dataset_id}.genai_usage_daily_unified` T
            USING (
                -- PAYG usage
                SELECT
                    usage_date, org_slug, 'payg' as cost_type, provider, model,
                    CAST(NULL AS STRING) as instance_type, CAST(NULL AS STRING) as gpu_type, region,
                    input_tokens, output_tokens, cached_input_tokens as cached_tokens,
                    total_tokens, CAST(NULL AS INT64) as ptu_units, CAST(NULL AS INT64) as used_units,
                    CAST(NULL AS FLOAT64) as utilization_pct, CAST(NULL AS FLOAT64) as gpu_hours,
                    CAST(NULL AS FLOAT64) as instance_hours,
                    request_count, hierarchy_dept_id, hierarchy_dept_name,
                    hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                    hierarchy_team_name, 'genai_payg_usage_raw' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_payg_usage_raw`
                WHERE usage_date = @process_date AND org_slug = @org_slug

                UNION ALL

                -- Commitment usage
                SELECT
                    usage_date, org_slug, 'commitment' as cost_type, provider,
                    model, CAST(NULL AS STRING) as instance_type,
                    CAST(NULL AS STRING) as gpu_type, region,
                    CAST(NULL AS INT64) as input_tokens, CAST(NULL AS INT64) as output_tokens,
                    CAST(NULL AS INT64) as cached_tokens, CAST(NULL AS INT64) as total_tokens,
                    provisioned_units as ptu_units, used_units, utilization_pct,
                    CAST(NULL AS FLOAT64) as gpu_hours, CAST(NULL AS FLOAT64) as instance_hours,
                    CAST(NULL AS INT64) as request_count, hierarchy_dept_id, hierarchy_dept_name,
                    hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                    hierarchy_team_name, 'genai_commitment_usage_raw' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_commitment_usage_raw`
                WHERE usage_date = @process_date AND org_slug = @org_slug

                UNION ALL

                -- Infrastructure usage
                SELECT
                    usage_date, org_slug, 'infrastructure' as cost_type, provider,
                    CAST(NULL AS STRING) as model, instance_type, gpu_type, region,
                    CAST(NULL AS INT64) as input_tokens, CAST(NULL AS INT64) as output_tokens,
                    CAST(NULL AS INT64) as cached_tokens, CAST(NULL AS INT64) as total_tokens,
                    CAST(NULL AS INT64) as ptu_units, CAST(NULL AS INT64) as used_units,
                    avg_gpu_utilization_pct as utilization_pct, gpu_hours, hours_used as instance_hours,
                    CAST(NULL AS INT64) as request_count, hierarchy_dept_id, hierarchy_dept_name,
                    hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                    hierarchy_team_name, 'genai_infrastructure_usage_raw' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw`
                WHERE usage_date = @process_date AND org_slug = @org_slug
            ) S
            -- MT-002 FIX: Add x_credential_id to MERGE key for multi-account isolation
            ON T.usage_date = S.usage_date
                AND T.org_slug = S.org_slug
                AND T.cost_type = S.cost_type
                AND T.provider = S.provider
                AND COALESCE(T.x_credential_id, 'default') = COALESCE(S.x_credential_id, 'default')
                AND COALESCE(T.model, '') = COALESCE(S.model, '')
                AND COALESCE(T.instance_type, '') = COALESCE(S.instance_type, '')
                AND COALESCE(T.region, 'global') = COALESCE(S.region, 'global')
            WHEN MATCHED THEN
                UPDATE SET
                    gpu_type = S.gpu_type,
                    input_tokens = S.input_tokens,
                    output_tokens = S.output_tokens,
                    cached_tokens = S.cached_tokens,
                    total_tokens = S.total_tokens,
                    ptu_units = S.ptu_units,
                    used_units = S.used_units,
                    utilization_pct = S.utilization_pct,
                    gpu_hours = S.gpu_hours,
                    instance_hours = S.instance_hours,
                    request_count = S.request_count,
                    hierarchy_dept_id = S.hierarchy_dept_id,
                    hierarchy_dept_name = S.hierarchy_dept_name,
                    hierarchy_project_id = S.hierarchy_project_id,
                    hierarchy_project_name = S.hierarchy_project_name,
                    hierarchy_team_id = S.hierarchy_team_id,
                    hierarchy_team_name = S.hierarchy_team_name,
                    source_table = S.source_table,
                    consolidated_at = CURRENT_TIMESTAMP(),
                    x_pipeline_id = S.x_pipeline_id,
                    x_credential_id = S.x_credential_id,
                    x_pipeline_run_date = S.x_pipeline_run_date,
                    x_run_id = S.x_run_id,
                    x_ingested_at = S.x_ingested_at
            WHEN NOT MATCHED THEN
                INSERT (usage_date, org_slug, cost_type, provider, model, instance_type, gpu_type,
                        region, input_tokens, output_tokens, cached_tokens, total_tokens,
                        ptu_units, used_units, utilization_pct, gpu_hours, instance_hours,
                        request_count, hierarchy_dept_id, hierarchy_dept_name,
                        hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                        hierarchy_team_name, source_table, consolidated_at,
                        x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                VALUES (S.usage_date, S.org_slug, S.cost_type, S.provider, S.model, S.instance_type, S.gpu_type,
                        S.region, S.input_tokens, S.output_tokens, S.cached_tokens, S.total_tokens,
                        S.ptu_units, S.used_units, S.utilization_pct, S.gpu_hours, S.instance_hours,
                        S.request_count, S.hierarchy_dept_id, S.hierarchy_dept_name,
                        S.hierarchy_project_id, S.hierarchy_project_name, S.hierarchy_team_id,
                        S.hierarchy_team_name, S.source_table, CURRENT_TIMESTAMP(),
                        S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date, S.x_run_id, S.x_ingested_at)
        """

        job = bq_client.client.query(merge_query, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]
        ))
        job.result()

        return {"rows_inserted": job.num_dml_affected_rows or 0}

    async def _consolidate_costs(
        self, bq_client, project_id, dataset_id, org_slug, process_date
    ) -> Dict[str, Any]:
        """
        Consolidate costs from all flows into unified table.

        HIGH #9: Uses atomic MERGE instead of DELETE+INSERT for idempotency.
        """

        # HIGH #9: Atomic MERGE for cost consolidation
        merge_query = f"""
            MERGE `{project_id}.{dataset_id}.genai_costs_daily_unified` T
            USING (
                -- PAYG costs
                SELECT
                    cost_date, org_slug, 'payg' as cost_type, provider, model,
                    CAST(NULL AS STRING) as instance_type, CAST(NULL AS STRING) as gpu_type, region,
                    input_cost_usd, output_cost_usd, CAST(NULL AS FLOAT64) as commitment_cost_usd,
                    CAST(NULL AS FLOAT64) as overage_cost_usd, CAST(NULL AS FLOAT64) as infrastructure_cost_usd,
                    total_cost_usd, discount_applied_pct,
                    CAST(total_tokens AS FLOAT64) as usage_quantity, 'tokens' as usage_unit,
                    hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                    hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                    'genai_payg_costs_daily' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_payg_costs_daily`
                WHERE cost_date = @process_date AND org_slug = @org_slug

                UNION ALL

                -- Commitment costs
                SELECT
                    cost_date, org_slug, 'commitment' as cost_type, provider,
                    model, CAST(NULL AS STRING) as instance_type,
                    CAST(NULL AS STRING) as gpu_type, region,
                    CAST(NULL AS FLOAT64) as input_cost_usd, CAST(NULL AS FLOAT64) as output_cost_usd,
                    commitment_cost_usd, overage_cost_usd, CAST(NULL AS FLOAT64) as infrastructure_cost_usd,
                    total_cost_usd, CAST(NULL AS FLOAT64) as discount_applied_pct,
                    CAST(provisioned_units AS FLOAT64) as usage_quantity, 'ptu_hours' as usage_unit,
                    hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                    hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                    'genai_commitment_costs_daily' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_commitment_costs_daily`
                WHERE cost_date = @process_date AND org_slug = @org_slug

                UNION ALL

                -- Infrastructure costs
                SELECT
                    cost_date, org_slug, 'infrastructure' as cost_type, provider,
                    CAST(NULL AS STRING) as model, instance_type, gpu_type, region,
                    CAST(NULL AS FLOAT64) as input_cost_usd, CAST(NULL AS FLOAT64) as output_cost_usd,
                    CAST(NULL AS FLOAT64) as commitment_cost_usd, CAST(NULL AS FLOAT64) as overage_cost_usd,
                    total_cost_usd as infrastructure_cost_usd, total_cost_usd,
                    ROUND((discount_applied_usd / NULLIF(base_cost_usd, 0)) * 100, 2) as discount_applied_pct,
                    gpu_hours as usage_quantity, 'gpu_hours' as usage_unit,
                    hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                    hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                    'genai_infrastructure_costs_daily' as source_table,
                    -- Standardized lineage columns (x_ prefix)
                    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at
                FROM `{project_id}.{dataset_id}.genai_infrastructure_costs_daily`
                WHERE cost_date = @process_date AND org_slug = @org_slug
            ) S
            -- MT-003 FIX: Add x_credential_id to MERGE key for multi-account isolation
            ON T.cost_date = S.cost_date
                AND T.org_slug = S.org_slug
                AND T.cost_type = S.cost_type
                AND T.provider = S.provider
                AND COALESCE(T.x_credential_id, 'default') = COALESCE(S.x_credential_id, 'default')
                AND COALESCE(T.model, '') = COALESCE(S.model, '')
                AND COALESCE(T.instance_type, '') = COALESCE(S.instance_type, '')
                AND COALESCE(T.region, 'global') = COALESCE(S.region, 'global')
            WHEN MATCHED THEN
                UPDATE SET
                    gpu_type = S.gpu_type,
                    input_cost_usd = S.input_cost_usd,
                    output_cost_usd = S.output_cost_usd,
                    commitment_cost_usd = S.commitment_cost_usd,
                    overage_cost_usd = S.overage_cost_usd,
                    infrastructure_cost_usd = S.infrastructure_cost_usd,
                    total_cost_usd = S.total_cost_usd,
                    discount_applied_pct = S.discount_applied_pct,
                    usage_quantity = S.usage_quantity,
                    usage_unit = S.usage_unit,
                    hierarchy_dept_id = S.hierarchy_dept_id,
                    hierarchy_dept_name = S.hierarchy_dept_name,
                    hierarchy_project_id = S.hierarchy_project_id,
                    hierarchy_project_name = S.hierarchy_project_name,
                    hierarchy_team_id = S.hierarchy_team_id,
                    hierarchy_team_name = S.hierarchy_team_name,
                    source_table = S.source_table,
                    consolidated_at = CURRENT_TIMESTAMP(),
                    x_pipeline_id = S.x_pipeline_id,
                    x_credential_id = S.x_credential_id,
                    x_pipeline_run_date = S.x_pipeline_run_date,
                    x_run_id = S.x_run_id,
                    x_ingested_at = S.x_ingested_at
            WHEN NOT MATCHED THEN
                INSERT (cost_date, org_slug, cost_type, provider, model, instance_type, gpu_type,
                        region, input_cost_usd, output_cost_usd, commitment_cost_usd, overage_cost_usd,
                        infrastructure_cost_usd, total_cost_usd, discount_applied_pct,
                        usage_quantity, usage_unit, hierarchy_dept_id, hierarchy_dept_name,
                        hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                        hierarchy_team_name, source_table, consolidated_at,
                        x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                VALUES (S.cost_date, S.org_slug, S.cost_type, S.provider, S.model, S.instance_type, S.gpu_type,
                        S.region, S.input_cost_usd, S.output_cost_usd, S.commitment_cost_usd, S.overage_cost_usd,
                        S.infrastructure_cost_usd, S.total_cost_usd, S.discount_applied_pct,
                        S.usage_quantity, S.usage_unit, S.hierarchy_dept_id, S.hierarchy_dept_name,
                        S.hierarchy_project_id, S.hierarchy_project_name, S.hierarchy_team_id,
                        S.hierarchy_team_name, S.source_table, CURRENT_TIMESTAMP(),
                        S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date, S.x_run_id, S.x_ingested_at)
        """

        job = bq_client.client.query(merge_query, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]
        ))
        job.result()

        return {"rows_inserted": job.num_dml_affected_rows or 0}

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
    return UnifiedConsolidatorProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = UnifiedConsolidatorProcessor()
    return await processor.execute(step_config, context)
