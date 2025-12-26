"""
OpenAI Subscriptions Processor

Fetches organization data from OpenAI API using the /v1/me endpoint.
Stores in BigQuery for tracking OpenAI account metadata.

Usage in pipeline:
    ps_type: openai.subscriptions

Note: OpenAI's public API provides limited subscription data.
For billing/usage data, use the separate Cost API or Usage API.
"""

import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from src.core.processors.openai.authenticator import OpenAIAuthenticator
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class SubscriptionsProcessor:
    """
    Fetches OpenAI organization/user data via the /v1/me endpoint.

    Writes to: {org_slug}_{env}.openai_subscriptions_monthly

    Note: OpenAI's public API endpoints:
    - /v1/me - Returns user and org info for the API key (works with any key)
    - /v1/organization/usage/* - Requires Admin Key
    - /v1/organization/costs - Requires Admin Key
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
        Fetch OpenAI organization data.

        Args:
            step_config: Step configuration containing:
                - config.destination_table: Table name (default: openai_subscriptions_monthly)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - subscription_data: Organization details
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        destination_table = config.get("destination_table", "openai_subscriptions_monthly")

        self.logger.info(
            f"Fetching OpenAI organization data for {org_slug}",
            extra={"org_slug": org_slug}
        )

        try:
            import httpx

            # Authenticate
            auth = OpenAIAuthenticator(org_slug)
            api_key = await auth.authenticate()

            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {"Authorization": f"Bearer {api_key}"}

                # Use the public /v1/me endpoint (works with any API key)
                me_response = await client.get(
                    "https://api.openai.com/v1/me",
                    headers=headers
                )

                subscription_data = {
                    "org_slug": org_slug,
                    "provider": "OPENAI",
                    "fetched_at": datetime.now(timezone.utc).isoformat()
                }

                if me_response.status_code == 200:
                    try:
                        me_data = me_response.json()
                    except json.JSONDecodeError as e:
                        self.logger.error(f"Invalid JSON from OpenAI /v1/me API: {e}")
                        return {"status": "FAILED", "error": "Invalid response format from OpenAI"}

                    # Extract user info
                    subscription_data.update({
                        "openai_user_id": me_data.get("id"),
                        "openai_user_name": me_data.get("name"),
                        "openai_email": me_data.get("email"),
                    })

                    # Extract organization info from orgs array
                    orgs = me_data.get("orgs", {}).get("data", [])
                    if orgs:
                        # Use the first org (default org)
                        default_org = orgs[0]
                        subscription_data.update({
                            "openai_org_id": default_org.get("id"),
                            "openai_org_name": default_org.get("name"),
                            "openai_org_title": default_org.get("title"),
                            "openai_org_role": default_org.get("role"),
                            "is_default": default_org.get("is_default", False),
                        })

                        # Check settings if available
                        settings = default_org.get("settings", {})
                        if settings:
                            subscription_data.update({
                                "threads_ui_visibility": settings.get("threads_ui_visibility"),
                                "usage_dashboard_visibility": settings.get("usage_dashboard_visibility"),
                            })

                    self.logger.info(
                        f"Successfully fetched OpenAI org data",
                        extra={
                            "org_slug": org_slug,
                            "openai_org_id": subscription_data.get("openai_org_id")
                        }
                    )
                else:
                    self.logger.error(f"OpenAI /v1/me API error: {me_response.status_code}")
                    if me_response.status_code in (401, 403):
                        return {"status": "FAILED", "error": f"Authentication failed: {me_response.status_code}"}
                    elif me_response.status_code == 429:
                        return {"status": "FAILED", "error": "Rate limited by OpenAI API"}
                    else:
                        return {"status": "FAILED", "error": f"OpenAI API error: {me_response.status_code}"}

                # Store to BigQuery
                await self._store_subscription_data(
                    org_slug, destination_table, subscription_data
                )

                return {
                    "status": "SUCCESS",
                    "provider": "OPENAI",
                    "subscription": subscription_data,
                    "message": "Fetched organization data successfully"
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
        # Use settings.get_org_dataset_name() for consistency with onboarding
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id
        table_id = f"{project_id}.{dataset_id}.{table_name}"

        bq_client = BigQueryClient(project_id=project_id)

        try:
            errors = bq_client.client.insert_rows_json(table_id, [subscription_data])
            if errors:
                error_msg = f"Failed to insert subscription data: {errors}"
                self.logger.error(error_msg)
                raise RuntimeError(error_msg)
        except Exception as e:
            self.logger.warning(f"Could not store subscription data: {e}")
            raise


def get_engine():
    """Factory function for pipeline executor."""
    return SubscriptionsProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = SubscriptionsProcessor()
    return await processor.execute(step_config, context)
