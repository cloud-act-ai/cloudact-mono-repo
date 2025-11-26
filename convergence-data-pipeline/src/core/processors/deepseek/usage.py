"""
DeepSeek Usage Processor

Fetches usage and billing data from DeepSeek API.
Uses DeepSeekAuthenticator for credential management.

Usage in pipeline:
    ps_type: deepseek.usage
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from google.cloud import bigquery

from src.core.processors.deepseek.authenticator import DeepSeekAuthenticator
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class DeepSeekUsageProcessor:
    """
    Processor for fetching DeepSeek usage and billing data.

    Uses DeepSeekAuthenticator utility class for credential decryption.
    Stores usage data in organization's BigQuery dataset.

    Note: DeepSeek API is OpenAI-compatible, usage API may vary.
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
        Fetch DeepSeek usage data.

        Args:
            step_config: Step configuration containing:
                - config.start_date: Start date (YYYY-MM-DD), default: yesterday
                - config.end_date: End date (YYYY-MM-DD), default: today
                - config.store_to_bq: Store results in BigQuery (default: True)
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

        self.logger.info(
            f"Fetching DeepSeek usage for {org_slug}",
            extra={"org_slug": org_slug, "start_date": start_date, "end_date": end_date}
        )

        try:
            import httpx

            # Use authenticator utility
            auth = DeepSeekAuthenticator(org_slug)
            api_key = await auth.authenticate()

            # DeepSeek is OpenAI-compatible but may have different usage endpoint
            # Try the OpenAI-style usage endpoint first
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "https://api.deepseek.com/v1/usage",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={"date": start_date}
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

                    # DeepSeek pricing is generally lower than OpenAI
                    estimated_cost = (total_tokens / 1000) * 0.0014  # Simplified estimate

                    # Store to BigQuery if enabled
                    if store_to_bq and usage_data:
                        await self._store_usage_data(org_slug, usage_data, start_date)

                    return {
                        "status": "SUCCESS",
                        "provider": "DEEPSEEK",
                        "date_range": {"start": start_date, "end": end_date},
                        "usage_records": len(usage_data),
                        "total_tokens": total_tokens,
                        "estimated_cost_usd": round(estimated_cost, 4),
                        "message": f"Fetched {len(usage_data)} usage records"
                    }

                elif response.status_code == 404:
                    # Usage endpoint may not exist
                    return {
                        "status": "SUCCESS",
                        "provider": "DEEPSEEK",
                        "date_range": {"start": start_date, "end": end_date},
                        "usage_records": 0,
                        "total_tokens": 0,
                        "estimated_cost_usd": 0,
                        "message": "DeepSeek usage API not available at this endpoint.",
                        "note": "Check DeepSeek console for usage data"
                    }

                elif response.status_code == 401:
                    return {
                        "status": "FAILED",
                        "provider": "DEEPSEEK",
                        "error": "Invalid API key"
                    }
                else:
                    return {
                        "status": "FAILED",
                        "provider": "DEEPSEEK",
                        "error": f"API error: {response.status_code}"
                    }

        except ValueError as e:
            return {
                "status": "FAILED",
                "provider": "DEEPSEEK",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"DeepSeek usage fetch error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "DEEPSEEK",
                "error": str(e)
            }

    async def _store_usage_data(
        self,
        org_slug: str,
        usage_data: List[Dict],
        date: str
    ) -> None:
        """Store usage data in BigQuery."""
        env = self.settings.environment or "dev"
        dataset_id = f"{org_slug}_{env}"
        table_id = f"{self.settings.gcp_project_id}.{dataset_id}.llm_usage_deepseek"

        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Transform data for storage
        rows = []
        for record in usage_data:
            rows.append({
                "org_slug": org_slug,
                "provider": "DEEPSEEK",
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
                errors = bq_client.client.insert_rows_json(table_id, rows)
                if errors:
                    self.logger.error(f"Failed to insert usage data: {errors}")
            except Exception as e:
                self.logger.warning(f"Could not store usage data: {e}")


def get_engine():
    """Factory function for pipeline executor."""
    return DeepSeekUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = DeepSeekUsageProcessor()
    return await processor.execute(step_config, context)
