"""
OpenAI Cost Processor

Transforms raw usage data to cost using model pricing from per-org openai_model_pricing table.
Reads from BigQuery (openai_usage_daily_raw), writes to BigQuery (openai_cost_daily).

Requires: openai_model_pricing table must be seeded first (via seed_data pipeline)

Usage in pipeline:
    ps_type: openai.cost
"""

import logging
from datetime import datetime
from typing import Dict, Any, List

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class CostProcessor:
    """
    Transforms OpenAI usage data to cost records.

    Reads from: {org_slug}_{env}.openai_usage_daily_raw
    Writes to:  {org_slug}_{env}.openai_cost_daily
    Pricing:    {org_slug}_{env}.openai_model_pricing (REQUIRED)
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
                - config.source_table: Source table name (default: openai_usage_daily_raw)
                - config.destination_table: Destination table name (default: openai_cost_daily)
                - config.pricing_table: Pricing table name (default: openai_model_pricing)
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

        source_table = config.get("source_table", "openai_usage_daily_raw")
        destination_table = config.get("destination_table", "openai_cost_daily")
        pricing_table = config.get("pricing_table", "openai_model_pricing")
        process_date = config.get("date") or context.get("start_date")

        # Use settings.get_org_dataset_name() for consistency with onboarding
        # Maps: development -> local, staging -> stage, production -> prod
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(
            f"Transforming OpenAI usage to cost for {org_slug}",
            extra={
                "org_slug": org_slug,
                "source_table": source_table,
                "destination_table": destination_table,
                "pricing_table": pricing_table
            }
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Load pricing from per-org table (REQUIRED - no fallback)
            pricing = await self._load_pricing(
                bq_client, project_id, dataset_id, pricing_table
            )

            if not pricing:
                return {
                    "status": "FAILED",
                    "provider": "OPENAI",
                    "error": f"No pricing data found in {dataset_id}.{pricing_table}. "
                             f"Run the seed_data pipeline first."
                }

            # Read usage data from source table
            usage_data = await self._read_usage_data(
                bq_client, project_id, dataset_id, source_table, process_date
            )

            if not usage_data:
                return {
                    "status": "SUCCESS",
                    "provider": "OPENAI",
                    "rows_processed": 0,
                    "total_cost_usd": 0,
                    "message": "No usage data found to transform"
                }

            # Transform to cost records using loaded pricing
            cost_records, unknown_models = self._calculate_costs(usage_data, org_slug, pricing)

            if unknown_models:
                self.logger.warning(
                    f"Unknown models found (no pricing): {unknown_models}. "
                    f"Add them to {pricing_table} table."
                )

            # Write to destination table
            await self._write_cost_data(
                bq_client, project_id, dataset_id, destination_table, cost_records
            )

            total_cost = sum(r.get("total_cost_usd", 0) for r in cost_records)

            result = {
                "status": "SUCCESS",
                "provider": "OPENAI",
                "rows_processed": len(cost_records),
                "total_cost_usd": round(total_cost, 6),
                "destination": f"{project_id}.{dataset_id}.{destination_table}",
                "pricing_source": f"{dataset_id}.{pricing_table}",
                "models_priced": len(pricing),
                "message": f"Transformed {len(cost_records)} usage records to cost"
            }

            if unknown_models:
                result["unknown_models"] = list(unknown_models)
                result["warning"] = f"Models without pricing skipped: {len(unknown_models)}"

            return result

        except Exception as e:
            self.logger.error(f"OpenAI cost transform error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "OPENAI",
                "error": str(e)
            }

    async def _load_pricing(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        pricing_table: str
    ) -> Dict[str, Dict]:
        """Load pricing from per-org openai_model_pricing table."""
        table_id = f"{project_id}.{dataset_id}.{pricing_table}"

        query = f"""
            SELECT
                model_id,
                input_price_per_1k,
                output_price_per_1k
            FROM `{table_id}`
            WHERE effective_date <= CURRENT_DATE()
            ORDER BY model_id, effective_date DESC
        """

        try:
            result = bq_client.client.query(query).result()
            pricing = {}
            for row in result:
                # Only keep the most recent pricing per model
                if row.model_id not in pricing:
                    pricing[row.model_id] = {
                        "input": float(row.input_price_per_1k),
                        "output": float(row.output_price_per_1k)
                    }

            if pricing:
                self.logger.info(
                    f"Loaded pricing for {len(pricing)} OpenAI models from {table_id}"
                )

            return pricing

        except Exception as e:
            self.logger.error(f"Failed to load pricing from {table_id}: {e}")
            return {}

    async def _read_usage_data(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        table_name: str,
        process_date: str = None
    ) -> List[Dict]:
        """Read usage data from BigQuery."""
        table_id = f"{project_id}.{dataset_id}.{table_name}"

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

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params) if query_params else None
            result = bq_client.client.query(query, job_config=job_config).result()
            return [dict(row) for row in result]
        except Exception as e:
            self.logger.warning(f"Could not read usage data: {e}")
            return []

    def _calculate_costs(
        self,
        usage_data: List[Dict],
        org_slug: str,
        pricing: Dict[str, Dict]
    ) -> tuple[List[Dict], set]:
        """
        Calculate cost for each usage record using provided pricing.

        Returns:
            tuple: (cost_records, unknown_models)
        """
        cost_records = []
        unknown_models = set()

        for usage in usage_data:
            model = usage.get("model", "unknown")
            context_tokens = usage.get("context_tokens", 0) or usage.get("input_tokens", 0)
            generated_tokens = usage.get("generated_tokens", 0) or usage.get("output_tokens", 0)

            # Get pricing for model
            model_pricing = pricing.get(model)

            if not model_pricing:
                unknown_models.add(model)
                # Skip records with unknown models - user must add pricing
                continue

            # Calculate cost (pricing is per 1K tokens)
            input_cost = (context_tokens / 1000) * model_pricing["input"]
            output_cost = (generated_tokens / 1000) * model_pricing["output"]
            total_cost = input_cost + output_cost

            cost_records.append({
                "org_slug": org_slug,
                "provider": "OPENAI",
                "usage_date": usage.get("usage_date"),
                "model": model,
                "input_tokens": context_tokens,
                "output_tokens": generated_tokens,
                "total_tokens": context_tokens + generated_tokens,
                "input_cost_usd": round(input_cost, 6),
                "output_cost_usd": round(output_cost, 6),
                "total_cost_usd": round(total_cost, 6),
                "requests": usage.get("requests", 0),
                "pricing_source": "openai_model_pricing",
                "calculated_at": datetime.utcnow().isoformat()
            })

        return cost_records, unknown_models

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
