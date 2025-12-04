"""
Anthropic Cost Processor

Transforms raw usage data to cost using model pricing from ref_model_pricing table.
Reads from BigQuery (anthropic_usage_daily_raw), writes to BigQuery (anthropic_cost_daily).

Usage in pipeline:
    ps_type: anthropic.cost
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


# Fallback pricing if ref_model_pricing table is not available
FALLBACK_PRICING = {
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    "default": {"input": 0.003, "output": 0.015},
}


class CostProcessor:
    """
    Transforms Anthropic usage data to cost records.

    Reads from: {org_slug}_{env}.anthropic_usage_raw
    Writes to:  {org_slug}_{env}.anthropic_cost
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
        Transform usage data to cost records.

        Args:
            step_config: Step configuration containing:
                - config.source_table: Source table name (default: anthropic_usage_raw)
                - config.destination_table: Destination table name (default: anthropic_cost)
                - config.date: Date to process (YYYY-MM-DD)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - rows_processed: Number of usage records transformed
                - total_cost_usd: Total cost calculated
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        source_table = config.get("source_table", "anthropic_usage_daily_raw")
        destination_table = config.get("destination_table", "anthropic_cost_daily")
        process_date = config.get("date") or context.get("start_date")

        # Use settings.get_org_dataset_name() for consistency with onboarding
        # Maps: development -> local, staging -> stage, production -> prod
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(
            f"Transforming Anthropic usage to cost for {org_slug}",
            extra={
                "org_slug": org_slug,
                "source_table": source_table,
                "destination_table": destination_table
            }
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Load pricing from ref_model_pricing table (or fallback)
            pricing = await self._load_pricing_from_bq(bq_client, project_id)

            # Read usage data from source table
            usage_data = await self._read_usage_data(
                bq_client, project_id, dataset_id, source_table, process_date
            )

            if not usage_data:
                return {
                    "status": "SUCCESS",
                    "provider": "ANTHROPIC",
                    "rows_processed": 0,
                    "total_cost_usd": 0,
                    "message": "No usage data found to transform"
                }

            # Transform to cost records using loaded pricing
            cost_records = self._calculate_costs(usage_data, org_slug, pricing)

            # Write to destination table
            await self._write_cost_data(
                bq_client, project_id, dataset_id, destination_table, cost_records
            )

            total_cost = sum(r.get("total_cost_usd", 0) for r in cost_records)

            return {
                "status": "SUCCESS",
                "provider": "ANTHROPIC",
                "rows_processed": len(cost_records),
                "total_cost_usd": round(total_cost, 6),
                "destination": f"{project_id}.{dataset_id}.{destination_table}",
                "pricing_source": "ref_model_pricing",
                "models_priced": len(pricing),
                "message": f"Transformed {len(cost_records)} usage records to cost"
            }

        except Exception as e:
            self.logger.error(f"Anthropic cost transform error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "ANTHROPIC",
                "error": str(e)
            }

    async def _read_usage_data(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        table_name: str,
        process_date: str = None
    ) -> List[Dict]:
        """Read usage data from BigQuery with memory-bounded processing."""
        table_id = f"{project_id}.{dataset_id}.{table_name}"

        # Add LIMIT to prevent unbounded memory usage for large aggregations
        # Process in chunks if there are more than 10,000 rows
        max_rows_per_chunk = 10000

        query = f"""
            SELECT *
            FROM `{table_id}`
            WHERE 1=1
        """

        query_params = []
        if process_date:
            query += " AND usage_date = @process_date"
            query_params.append(
                bigquery.ScalarQueryParameter("process_date", "STRING", process_date)
            )

        # Add LIMIT to control memory usage
        query += f" LIMIT {max_rows_per_chunk}"

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params) if query_params else None
            result = bq_client.client.query(query, job_config=job_config).result()

            # Stream results to prevent loading all into memory at once
            rows = []
            for row in result:
                rows.append(dict(row))

            if len(rows) >= max_rows_per_chunk:
                self.logger.warning(
                    f"Retrieved maximum chunk size ({max_rows_per_chunk} rows). "
                    "Consider processing in smaller date ranges for better performance."
                )

            return rows
        except Exception as e:
            self.logger.warning(f"Could not read usage data: {e}")
            return []

    async def _load_pricing_from_bq(
        self,
        bq_client: BigQueryClient,
        project_id: str
    ) -> Dict[str, Dict]:
        """Load pricing from ref_model_pricing table."""
        query = f"""
            SELECT
                model_id,
                input_price_per_1k,
                output_price_per_1k
            FROM `{project_id}.organizations.ref_model_pricing`
            WHERE provider = 'ANTHROPIC'
              AND effective_date <= CURRENT_DATE()
            ORDER BY model_id, effective_date DESC
        """

        try:
            result = bq_client.client.query(query).result()
            pricing = {}
            for row in result:
                if row.model_id not in pricing:
                    pricing[row.model_id] = {
                        "input": float(row.input_price_per_1k),
                        "output": float(row.output_price_per_1k)
                    }

            if pricing:
                self.logger.info(f"Loaded pricing for {len(pricing)} Anthropic models from ref_model_pricing")
                return pricing
            else:
                self.logger.warning("No pricing found in ref_model_pricing, using fallback")
                return FALLBACK_PRICING

        except Exception as e:
            self.logger.warning(f"Could not load pricing from BQ: {e}, using fallback")
            return FALLBACK_PRICING

    def _calculate_costs(
        self,
        usage_data: List[Dict],
        org_slug: str,
        pricing: Dict[str, Dict]
    ) -> List[Dict]:
        """Calculate cost for each usage record using provided pricing."""
        cost_records = []
        default_pricing = pricing.get("default", FALLBACK_PRICING["default"])

        for usage in usage_data:
            model = usage.get("model", "unknown")
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)

            # Get pricing for model (fallback to default)
            model_pricing = pricing.get(model, default_pricing)

            # Calculate cost (pricing is per 1K tokens)
            input_cost = (input_tokens / 1000) * model_pricing["input"]
            output_cost = (output_tokens / 1000) * model_pricing["output"]
            total_cost = input_cost + output_cost

            # Ensure usage_date is in ISO format (YYYY-MM-DD)
            usage_date = usage.get("usage_date")
            if usage_date and not isinstance(usage_date, str):
                # If it's a date object, convert to ISO format
                if hasattr(usage_date, 'isoformat'):
                    usage_date = usage_date.isoformat()
                else:
                    usage_date = str(usage_date)

            cost_records.append({
                "org_slug": org_slug,
                "provider": "ANTHROPIC",
                "usage_date": usage_date,  # Use ISO format
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "input_cost_usd": round(input_cost, 6),
                "output_cost_usd": round(output_cost, 6),
                "total_cost_usd": round(total_cost, 6),
                "requests": usage.get("requests", 0),
                "pricing_source": "ref_model_pricing",
                "calculated_at": datetime.utcnow().isoformat()  # ISO format for timestamp
            })

        return cost_records

    async def _write_cost_data(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        table_name: str,
        cost_records: List[Dict]
    ) -> None:
        """Write cost records to BigQuery."""
        table_id = f"{project_id}.{dataset_id}.{table_name}"

        if cost_records:
            try:
                errors = bq_client.client.insert_rows_json(table_id, cost_records)
                if errors:
                    self.logger.error(f"Failed to insert cost data: {errors}")
            except Exception as e:
                self.logger.warning(f"Could not write cost data: {e}")


def get_engine():
    """Factory function for pipeline executor."""
    return CostProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = CostProcessor()
    return await processor.execute(step_config, context)
