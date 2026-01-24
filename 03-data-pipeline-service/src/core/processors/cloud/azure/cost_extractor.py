"""
Azure Cost Management Extractor

Extracts cost data from Azure Cost Management API.
Uses AzureAuthenticator for OAuth2 authentication.

ps_type: cloud.azure.cost_extractor
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid

import httpx

from src.core.processors.cloud.azure.authenticator import AzureAuthenticator
from src.app.config import get_settings
from src.core.utils.validators import (
    is_valid_org_slug,
    is_valid_date_format,
    is_valid_azure_subscription_id,
)

logger = logging.getLogger(__name__)


class AzureCostExtractor:
    """
    Extracts cost data from Azure Cost Management API.

    Uses the Cost Management Query API to retrieve cost and usage data.
    """

    def __init__(self, org_slug: Optional[str] = None):
        self.org_slug = org_slug
        self.settings = get_settings()
        self._auth: Optional[AzureAuthenticator] = None

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract Azure cost data.

        Args:
            step_config: Configuration with date_filter, granularity
            context: Pipeline context with org_slug

        Returns:
            Dict with extracted cost rows and metadata
        """
        # ERR-002 FIX: Get org_slug from context if not set in constructor
        if not self.org_slug:
            self.org_slug = context.get("org_slug")
        if not self.org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # MT-FIX: Validate org_slug format to prevent injection attacks
        if not is_valid_org_slug(self.org_slug):
            return {"status": "FAILED", "error": f"Invalid org_slug format: {self.org_slug}"}

        config = step_config.get("config", {})
        date_filter = config.get("date_filter") or context.get("date")
        granularity = config.get("granularity", "Daily")

        # MT-FIX: Validate date format to prevent injection
        if date_filter and not is_valid_date_format(date_filter):
            return {"status": "FAILED", "error": f"Invalid date format: {date_filter}. Expected YYYY-MM-DD"}

        logger.info(
            f"Extracting Azure cost data",
            extra={
                "org_slug": self.org_slug,
                "date": date_filter,
                "granularity": granularity
            }
        )

        try:
            # Authenticate with Azure
            self._auth = AzureAuthenticator(self.org_slug)
            client_config = await self._auth.get_cost_management_client()

            # MT-FIX: Validate subscription ID format from retrieved credentials
            subscription_id = client_config.get("subscription_id")
            if not is_valid_azure_subscription_id(subscription_id):
                return {"status": "FAILED", "error": f"Invalid Azure subscription ID format: {subscription_id}"}

            # Parse date range
            if date_filter:
                start_date = datetime.strptime(date_filter, "%Y-%m-%d")
            else:
                start_date = datetime.now() - timedelta(days=1)
            end_date = start_date + timedelta(days=1)

            # Generate lineage metadata
            run_id = str(uuid.uuid4())
            pipeline_id = context.get("pipeline_id", "cloud_cost_azure")
            credential_id = context.get("credential_id", "")
            pipeline_run_date = date_filter or start_date.strftime("%Y-%m-%d")
            ingested_at = datetime.utcnow().isoformat()

            # Query Cost Management API
            rows = await self._query_costs(
                client_config,
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                granularity
            )

            # Add standardized lineage columns to each row
            for row in rows:
                row["x_pipeline_id"] = pipeline_id
                row["x_credential_id"] = credential_id
                row["x_pipeline_run_date"] = pipeline_run_date
                row["x_run_id"] = run_id
                row["x_ingested_at"] = ingested_at

            # Store in context for downstream steps
            context["extracted_data"] = rows

            logger.info(
                f"Azure cost extraction complete",
                extra={
                    "org_slug": self.org_slug,
                    "row_count": len(rows),
                    "date_range": f"{start_date.date()} to {end_date.date()}"
                }
            )

            return {
                "status": "SUCCESS",
                "rows": rows,
                "row_count": len(rows),
                "subscription_id": client_config["subscription_id"],
                "date_range": f"{start_date.date()} to {end_date.date()}"
            }

        except Exception as e:
            logger.error(f"Azure cost extraction failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _query_costs(
        self,
        client_config: Dict[str, Any],
        start_date: str,
        end_date: str,
        granularity: str
    ) -> List[Dict[str, Any]]:
        """Query Azure Cost Management API and map to schema columns."""
        subscription_id = client_config["subscription_id"]
        api_version = client_config["api_version"]

        url = (
            f"{client_config['base_url']}/subscriptions/{subscription_id}"
            f"/providers/Microsoft.CostManagement/query"
        )

        # Cost Management Query payload - request all needed dimensions
        query_body = {
            "type": "Usage",
            "timeframe": "Custom",
            "timePeriod": {
                "from": f"{start_date}T00:00:00Z",
                "to": f"{end_date}T00:00:00Z"
            },
            "dataset": {
                "granularity": granularity,
                "aggregation": {
                    "totalCost": {"name": "Cost", "function": "Sum"},
                    "totalCostUSD": {"name": "CostUSD", "function": "Sum"},
                    "UsageQuantity": {"name": "UsageQuantity", "function": "Sum"}
                },
                "grouping": [
                    {"type": "Dimension", "name": "ServiceName"},
                    {"type": "Dimension", "name": "ResourceGroup"},
                    {"type": "Dimension", "name": "ResourceLocation"},
                    {"type": "Dimension", "name": "MeterCategory"},
                    {"type": "Dimension", "name": "MeterSubCategory"},
                    {"type": "Dimension", "name": "MeterName"},
                    {"type": "Dimension", "name": "Meter"},
                    {"type": "Dimension", "name": "ResourceId"},
                    {"type": "Dimension", "name": "ResourceType"},
                    {"type": "Dimension", "name": "ChargeType"},
                    {"type": "Dimension", "name": "PricingModel"},
                    {"type": "Dimension", "name": "BillingCurrency"},
                    {"type": "Dimension", "name": "ServiceTier"},
                    {"type": "Dimension", "name": "ServiceFamily"}
                ]
            }
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=client_config["headers"],
                params={"api-version": api_version},
                json=query_body,
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()

        # Get column names from response
        columns = [col["name"] for col in data.get("properties", {}).get("columns", [])]
        ingestion_ts = datetime.utcnow().isoformat()

        # Transform response to rows with proper schema mapping
        rows = []
        for row_data in data.get("properties", {}).get("rows", []):
            api_row = dict(zip(columns, row_data))

            # Map Azure API columns to schema columns (snake_case)
            row = {
                # Required fields
                "usage_date": start_date,
                "x_org_slug": self.org_slug,
                "provider": "azure",
                "subscription_id": subscription_id,
                "cost_in_billing_currency": float(api_row.get("Cost", 0) or 0),
                "ingestion_timestamp": ingestion_ts,

                # Map Azure API response to schema fields
                "subscription_name": None,  # Not available in query API
                "resource_group": api_row.get("ResourceGroup"),
                "resource_id": api_row.get("ResourceId"),
                "resource_name": self._extract_resource_name(api_row.get("ResourceId")),
                "resource_type": api_row.get("ResourceType"),
                "resource_location": api_row.get("ResourceLocation"),
                "service_name": api_row.get("ServiceName"),
                "service_tier": api_row.get("ServiceTier"),
                "service_family": api_row.get("ServiceFamily"),
                "meter_id": api_row.get("Meter"),
                "meter_name": api_row.get("MeterName"),
                "meter_category": api_row.get("MeterCategory"),
                "meter_subcategory": api_row.get("MeterSubCategory"),
                "meter_region": api_row.get("ResourceLocation"),
                "charge_type": api_row.get("ChargeType", "Usage"),
                "usage_quantity": float(api_row.get("UsageQuantity", 0) or 0),
                "unit_of_measure": "Units",  # Default, API doesn't always provide
                "cost_in_usd": float(api_row.get("CostUSD", 0) or 0),
                "billing_currency": api_row.get("BillingCurrency", "USD"),
                "pricing_model": api_row.get("PricingModel", "OnDemand"),

                # Optional fields - set to None if not available
                "product_name": api_row.get("ServiceName"),
                "product_order_id": None,
                "product_order_name": None,
                "consumed_service": api_row.get("ServiceName"),
                "billing_period_start": None,
                "billing_period_end": None,
                "usage_start_time": None,
                "usage_end_time": None,
                "exchange_rate": None,
                "effective_price": None,
                "unit_price": None,
                "reservation_id": None,
                "reservation_name": None,
                "frequency": None,
                "publisher_type": "Azure",
                "publisher_name": None,
                "invoice_id": None,
                "invoice_section_id": None,
                "invoice_section_name": None,
                "billing_account_id": None,
                "billing_account_name": None,
                "billing_profile_id": None,
                "billing_profile_name": None,
                "cost_center": None,
                "benefit_id": None,
                "benefit_name": None,
                "is_azure_credit_eligible": None,
                "resource_tags_json": None,
            }
            rows.append(row)

        return rows

    def _extract_resource_name(self, resource_id: str) -> str:
        """Extract resource name from Azure resource ID."""
        if not resource_id:
            return None
        # Azure resource IDs: /subscriptions/.../resourceGroups/.../providers/.../resourceName
        parts = resource_id.split("/")
        return parts[-1] if parts else None


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    extractor = AzureCostExtractor(org_slug)
    return await extractor.execute(step_config, context)


def get_engine():
    """Factory function for pipeline executor."""
    return AzureCostExtractor()
