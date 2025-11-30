"""
OpenAI Usage Processor

Fetches usage and billing data from OpenAI API.
Uses OpenAIAuthenticator for credential management.

Usage in pipeline:
    ps_type: openai.usage
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from google.cloud import bigquery

from src.core.processors.openai.authenticator import OpenAIAuthenticator
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class OpenAIUsageProcessor:
    """
    Processor for fetching OpenAI usage and billing data.

    Uses OpenAIAuthenticator utility class for credential decryption.
    Stores usage data in organization's BigQuery dataset.
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
        Fetch OpenAI usage data.

        Args:
            step_config: Step configuration containing:
                - config.start_date: Start date (YYYY-MM-DD), default: yesterday
                - config.end_date: End date (YYYY-MM-DD), default: today
                - config.store_to_bq: Store results in BigQuery (default: True)
                - config.destination_table: Table name (default: openai_usage_daily_raw)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - usage_data: List of usage records
                - total_tokens: Total tokens used
                - total_cost: Estimated total cost
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # Parse dates
        end_date = config.get("end_date") or datetime.utcnow().strftime("%Y-%m-%d")
        start_date = config.get("start_date") or (
            datetime.utcnow() - timedelta(days=1)
        ).strftime("%Y-%m-%d")
        store_to_bq = config.get("store_to_bq", True)
        destination_table = config.get("destination_table", "openai_usage_daily_raw")

        self.logger.info(
            f"Fetching OpenAI usage for {org_slug}",
            extra={"org_slug": org_slug, "start_date": start_date, "end_date": end_date}
        )

        try:
            import httpx

            # Use authenticator utility
            auth = OpenAIAuthenticator(org_slug)
            api_key = await auth.authenticate()

            # Fetch usage data from OpenAI
            # Note: OpenAI's usage API requires organization access
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get usage for date range
                # OpenAI usage endpoint: https://api.openai.com/v1/usage
                response = await client.get(
                    "https://api.openai.com/v1/usage",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={
                        "date": start_date,  # OpenAI uses single date param
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    usage_data = data.get("data", [])

                    # Calculate totals
                    total_tokens = sum(
                        u.get("n_context_tokens_total", 0) +
                        u.get("n_generated_tokens_total", 0)
                        for u in usage_data
                    )

                    # Estimate cost (simplified - actual pricing varies by model)
                    # GPT-4: ~$0.03/1K input, $0.06/1K output
                    # GPT-3.5: ~$0.0015/1K input, $0.002/1K output
                    estimated_cost = (total_tokens / 1000) * 0.002  # Simplified estimate

                    # Store to BigQuery if enabled
                    if store_to_bq and usage_data:
                        await self._store_usage_data(org_slug, usage_data, start_date, destination_table)

                    return {
                        "status": "SUCCESS",
                        "provider": "OPENAI",
                        "date_range": {"start": start_date, "end": end_date},
                        "usage_records": len(usage_data),
                        "total_tokens": total_tokens,
                        "estimated_cost_usd": round(estimated_cost, 4),
                        "message": f"Fetched {len(usage_data)} usage records"
                    }

                elif response.status_code == 401:
                    return {
                        "status": "FAILED",
                        "provider": "OPENAI",
                        "error": "Invalid API key or insufficient permissions"
                    }
                elif response.status_code == 403:
                    # Usage API may require organization-level access
                    return {
                        "status": "FAILED",
                        "provider": "OPENAI",
                        "error": "Usage API requires organization-level access. Check API key permissions."
                    }
                else:
                    return {
                        "status": "FAILED",
                        "provider": "OPENAI",
                        "error": f"API error: {response.status_code} - {response.text}"
                    }

        except ValueError as e:
            return {
                "status": "FAILED",
                "provider": "OPENAI",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"OpenAI usage fetch error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "OPENAI",
                "error": str(e)
            }

    async def _store_usage_data(
        self,
        org_slug: str,
        usage_data: List[Dict],
        date: str,
        destination_table: str
    ) -> None:
        """Store usage data in BigQuery."""
        # Use settings.get_org_dataset_name() for consistency with onboarding
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{destination_table}"

        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Transform data for storage
        rows = []
        for record in usage_data:
            rows.append({
                "org_slug": org_slug,
                "provider": "OPENAI",
                "usage_date": date,
                "model": record.get("snapshot_id", "unknown"),
                "context_tokens": record.get("n_context_tokens_total", 0),
                "generated_tokens": record.get("n_generated_tokens_total", 0),
                "requests": record.get("n_requests", 0),
                "raw_data": str(record),
                "fetched_at": datetime.utcnow().isoformat()
            })

        if rows:
            try:
                # Ensure table exists (would be better to use schema from config)
                errors = bq_client.client.insert_rows_json(table_id, rows)
                if errors:
                    self.logger.error(f"Failed to insert usage data: {errors}")
            except Exception as e:
                self.logger.warning(f"Could not store usage data: {e}")


def get_engine():
    """Factory function for pipeline executor."""
    return OpenAIUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = OpenAIUsageProcessor()
    return await processor.execute(step_config, context)
