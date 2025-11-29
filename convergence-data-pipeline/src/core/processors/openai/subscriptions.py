"""
OpenAI Subscriptions Processor

Fetches subscription and organization data from OpenAI API.
Stores in BigQuery for billing/quota tracking.

Usage in pipeline:
    ps_type: openai.subscriptions
"""

import logging
from datetime import datetime
from typing import Dict, Any, List

from src.core.processors.openai.authenticator import OpenAIAuthenticator
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class SubscriptionsProcessor:
    """
    Fetches OpenAI subscription and organization data.

    Writes to: {org_slug}_{env}.openai_subscriptions
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
        Fetch OpenAI subscription data.

        Args:
            step_config: Step configuration containing:
                - config.destination_table: Table name (default: openai_subscriptions)
                - config.include_limits: Include rate limits (default: True)
                - config.include_usage_limits: Include usage limits (default: True)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - subscription_data: Subscription details
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        destination_table = config.get("destination_table", "openai_subscriptions_monthly")
        include_limits = config.get("include_limits", True)
        include_usage_limits = config.get("include_usage_limits", True)

        self.logger.info(
            f"Fetching OpenAI subscription for {org_slug}",
            extra={"org_slug": org_slug}
        )

        try:
            import httpx

            # Authenticate
            auth = OpenAIAuthenticator(org_slug)
            api_key = await auth.authenticate()

            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {"Authorization": f"Bearer {api_key}"}

                # Fetch organization info
                org_response = await client.get(
                    "https://api.openai.com/v1/organization",
                    headers=headers
                )

                subscription_data = {
                    "org_slug": org_slug,
                    "provider": "OPENAI",
                    "fetched_at": datetime.utcnow().isoformat()
                }

                if org_response.status_code == 200:
                    org_data = org_response.json()
                    subscription_data.update({
                        "openai_org_id": org_data.get("id"),
                        "openai_org_name": org_data.get("name"),
                        "is_default": org_data.get("is_default", False),
                        "tier": org_data.get("tier", "unknown"),
                    })

                # Fetch billing/subscription info if available
                if include_limits:
                    limits_response = await client.get(
                        "https://api.openai.com/v1/dashboard/billing/subscription",
                        headers=headers
                    )
                    if limits_response.status_code == 200:
                        limits_data = limits_response.json()
                        subscription_data.update({
                            "plan_id": limits_data.get("plan", {}).get("id"),
                            "plan_name": limits_data.get("plan", {}).get("name"),
                            "hard_limit_usd": limits_data.get("hard_limit_usd"),
                            "soft_limit_usd": limits_data.get("soft_limit_usd"),
                            "system_hard_limit_usd": limits_data.get("system_hard_limit_usd"),
                        })

                # Store to BigQuery
                await self._store_subscription_data(
                    org_slug, destination_table, subscription_data
                )

                return {
                    "status": "SUCCESS",
                    "provider": "OPENAI",
                    "subscription": subscription_data,
                    "message": "Fetched subscription data successfully"
                }

        except ValueError as e:
            return {
                "status": "FAILED",
                "provider": "OPENAI",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"OpenAI subscription fetch error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "provider": "OPENAI",
                "error": str(e)
            }

    async def _store_subscription_data(
        self,
        org_slug: str,
        table_name: str,
        subscription_data: Dict
    ) -> None:
        """Store subscription data in BigQuery."""
        env = self.settings.environment or "dev"
        dataset_id = f"{org_slug}_{env}"
        project_id = self.settings.gcp_project_id
        table_id = f"{project_id}.{dataset_id}.{table_name}"

        bq_client = BigQueryClient(project_id=project_id)

        try:
            errors = bq_client.client.insert_rows_json(table_id, [subscription_data])
            if errors:
                self.logger.error(f"Failed to insert subscription data: {errors}")
        except Exception as e:
            self.logger.warning(f"Could not store subscription data: {e}")


def get_engine():
    """Factory function for pipeline executor."""
    return SubscriptionsProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = SubscriptionsProcessor()
    return await processor.execute(step_config, context)
