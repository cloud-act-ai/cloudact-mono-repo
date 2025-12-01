"""
Anthropic Usage Processor

Fetches usage and billing data from Anthropic API.
Uses AnthropicAuthenticator for credential management.

Usage in pipeline:
    ps_type: anthropic.usage
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from google.cloud import bigquery

from src.core.processors.anthropic.authenticator import AnthropicAuthenticator
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class AnthropicUsageProcessor:
    """
    Processor for fetching Anthropic usage and billing data.

    Uses AnthropicAuthenticator utility class for credential decryption.
    Stores usage data in organization's BigQuery dataset.

    Note: Anthropic's usage API may have different access requirements.
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
        Fetch Anthropic usage data.

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
            f"Fetching Anthropic usage for {org_slug}",
            extra={"org_slug": org_slug, "start_date": start_date, "end_date": end_date}
        )

        try:
            import httpx
            import asyncio

            # Use authenticator utility
            auth = AnthropicAuthenticator(org_slug)
            api_key = await auth.authenticate()

            # Note: Anthropic may not have a public usage API like OpenAI
            # This is a placeholder for when/if they provide one
            # For now, return a message indicating the limitation

            max_retries = 3
            retry_count = 0
            backoff_seconds = 1

            async with httpx.AsyncClient(timeout=30.0) as client:
                # Anthropic doesn't have a public usage API yet
                # When available, implement with rate limiting:
                # while retry_count < max_retries:
                #     try:
                #         response = await client.get(...)
                #         if response.status_code == 429:
                #             retry_count += 1
                #             if retry_count >= max_retries:
                #                 return {"status": "FAILED", "error": "Rate limit exceeded"}
                #             retry_after = int(response.headers.get("retry-after", backoff_seconds))
                #             await asyncio.sleep(min(retry_after, backoff_seconds))
                #             backoff_seconds *= 2
                #             continue
                #         break
                #     except httpx.TimeoutException:
                #         retry_count += 1
                #         if retry_count >= max_retries:
                #             raise
                #         await asyncio.sleep(backoff_seconds)
                #         backoff_seconds *= 2
                #         continue

                # For now, return placeholder
                return {
                    "status": "SUCCESS",
                    "provider": "ANTHROPIC",
                    "date_range": {"start": start_date, "end": end_date},
                    "usage_records": 0,
                    "total_tokens": 0,
                    "estimated_cost_usd": 0,
                    "message": "Anthropic usage API not publicly available. Usage tracking requires Console access.",
                    "note": "Check https://console.anthropic.com for usage data"
                }

        except ValueError as e:
            return {
                "status": "FAILED",
                "provider": "ANTHROPIC",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"Anthropic usage fetch error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "ANTHROPIC",
                "error": str(e)
            }

    async def _store_usage_data(
        self,
        org_slug: str,
        usage_data: List[Dict],
        date: str
    ) -> None:
        """Store usage data in BigQuery."""
        # Null check - ensure usage_data exists and is not empty
        if not usage_data:
            self.logger.info(f"No usage data to store for {org_slug}")
            return

        # Use settings.get_org_dataset_name() for consistency with onboarding
        # Maps: development -> local, staging -> stage, production -> prod
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        table_id = f"{self.settings.gcp_project_id}.{dataset_id}.llm_usage_anthropic"

        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Transform data for storage
        rows = []
        for record in usage_data:
            # Null check for each record
            if not record:
                continue

            rows.append({
                "org_slug": org_slug,
                "provider": "ANTHROPIC",
                "usage_date": date,
                "model": record.get("model", "unknown"),
                "input_tokens": record.get("input_tokens", 0),
                "output_tokens": record.get("output_tokens", 0),
                "requests": record.get("requests", 0),
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
    return AnthropicUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = AnthropicUsageProcessor()
    return await processor.execute(step_config, context)
