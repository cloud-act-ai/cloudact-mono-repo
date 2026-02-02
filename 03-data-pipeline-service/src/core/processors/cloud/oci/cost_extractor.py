"""
OCI Cost Analysis Extractor

Extracts cost data from Oracle Cloud Infrastructure Cost Analysis API.
Uses OCIAuthenticator for API key signature authentication.

ps_type: cloud.oci.cost_extractor
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
import uuid

from src.core.processors.cloud.oci.authenticator import OCIAuthenticator
from src.app.config import get_settings
from src.core.utils.validators import (
    is_valid_org_slug,
    is_valid_date_format,
    is_valid_oci_ocid,
)

logger = logging.getLogger(__name__)


class OCICostExtractor:
    """
    Extracts cost data from OCI Cost Analysis API.

    Uses the Usage API to retrieve cost and usage reports.
    """

    def __init__(self, org_slug: Optional[str] = None):
        self.org_slug = org_slug
        self.settings = get_settings()
        self._auth: Optional[OCIAuthenticator] = None

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract OCI cost data.

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
        granularity = config.get("granularity", "DAILY")

        # MT-FIX: Validate date format to prevent injection
        if date_filter and not is_valid_date_format(date_filter):
            return {"status": "FAILED", "error": f"Invalid date format: {date_filter}. Expected YYYY-MM-DD"}

        logger.info(
            f"Extracting OCI cost data",
            extra={
                "org_slug": self.org_slug,
                "date": date_filter,
                "granularity": granularity
            }
        )

        try:
            # Authenticate with OCI
            self._auth = OCIAuthenticator(self.org_slug)
            await self._auth.authenticate()

            # MT-FIX: Validate tenancy OCID format from retrieved credentials
            if self._auth.tenancy_ocid and not is_valid_oci_ocid(self._auth.tenancy_ocid, "tenancy"):
                return {"status": "FAILED", "error": f"Invalid OCI tenancy OCID format: {self._auth.tenancy_ocid}"}

            # Parse date range
            if date_filter:
                start_date = datetime.strptime(date_filter, "%Y-%m-%d")
            else:
                start_date = datetime.now() - timedelta(days=1)
            end_date = start_date + timedelta(days=1)

            # Generate lineage metadata
            run_id = str(uuid.uuid4())
            pipeline_id = context.get("pipeline_id", "cloud_cost_oci")
            credential_id = context.get("credential_id", "")
            pipeline_run_date = date_filter or start_date.strftime("%Y-%m-%d")
            ingested_at = datetime.now(timezone.utc).isoformat()

            # Query Usage API
            rows = await self._query_costs(
                start_date.strftime("%Y-%m-%dT00:00:00Z"),
                end_date.strftime("%Y-%m-%dT00:00:00Z"),
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
                f"OCI cost extraction complete",
                extra={
                    "org_slug": self.org_slug,
                    "row_count": len(rows),
                    "tenancy": self._auth.tenancy_ocid
                }
            )

            return {
                "status": "SUCCESS",
                "rows": rows,
                "row_count": len(rows),
                "tenancy_ocid": self._auth.tenancy_ocid,
                "region": self._auth.region,
                "date_range": f"{start_date.date()} to {end_date.date()}"
            }

        except Exception as e:
            logger.error(f"OCI cost extraction failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _query_costs(
        self,
        start_time: str,
        end_time: str,
        granularity: str
    ) -> List[Dict[str, Any]]:
        """Query OCI Usage API for cost data."""
        try:
            import oci

            config = await self._auth.get_oci_config()
            usage_client = oci.usage_api.UsageapiClient(config)

            # Create usage request
            request_summarized_usages_details = oci.usage_api.models.RequestSummarizedUsagesDetails(
                tenant_id=self._auth.tenancy_ocid,
                time_usage_started=start_time,
                time_usage_ended=end_time,
                granularity=granularity,
                query_type="COST",
                group_by=["service", "compartmentName", "region", "resourceId"],
                compartment_depth=5
            )

            response = usage_client.request_summarized_usages(
                request_summarized_usages_details
            )

            # Transform to rows with full schema mapping
            rows = []
            ingestion_ts = datetime.now(timezone.utc).isoformat()

            for item in response.data.items:
                row = {
                    # Required fields
                    "usage_date": start_time[:10],
                    "x_org_slug": self.org_slug,
                    "provider": "oci",
                    "tenancy_id": self._auth.tenancy_ocid,
                    "cost": float(item.computed_amount) if item.computed_amount else 0.0,
                    "ingestion_timestamp": ingestion_ts,

                    # Tenancy/Compartment info
                    "tenancy_name": getattr(item, 'tenant_name', None),
                    "compartment_id": getattr(item, 'compartment_id', None),
                    "compartment_name": item.compartment_name,
                    "compartment_path": getattr(item, 'compartment_path', None),

                    # Location
                    "region": item.region,
                    "availability_domain": getattr(item, 'availability_domain', None),

                    # Service/SKU info
                    "service_name": item.service,
                    "sku_name": getattr(item, 'sku_name', None),
                    "sku_part_number": getattr(item, 'sku_part_number', None),

                    # Resource info
                    "resource_id": item.resource_id,
                    "resource_name": getattr(item, 'resource_name', None),

                    # Usage details
                    "usage_type": getattr(item, 'usage_type', None),
                    "unit": item.unit,
                    "usage_start_time": getattr(item, 'time_usage_started', None),
                    "usage_end_time": getattr(item, 'time_usage_ended', None),
                    "usage_quantity": float(item.computed_quantity) if item.computed_quantity else 0.0,
                    "computed_quantity": float(item.computed_quantity) if item.computed_quantity else 0.0,
                    "unit_price": float(item.unit_price) if item.unit_price else 0.0,
                    "currency": item.currency or "USD",

                    # Overage/Correction flags
                    "overage_flag": getattr(item, 'is_forecast', 'N'),  # Map forecast to overage
                    "is_correction": getattr(item, 'is_correction', False),

                    # Subscription/Platform
                    "subscription_id": getattr(item, 'subscription_id', None),
                    "platform_type": getattr(item, 'platform_type', None),
                    "billing_period": getattr(item, 'time_usage_started', start_time)[:7] if hasattr(item, 'time_usage_started') else start_time[:7],

                    # Tags (as JSON strings)
                    "freeform_tags_json": self._tags_to_json(getattr(item, 'freeform_tags', None)),
                    "defined_tags_json": self._tags_to_json(getattr(item, 'defined_tags', None)),
                }
                rows.append(row)

            return rows

        except ImportError:
            logger.warning("OCI SDK not installed, using REST API fallback")
            return await self._query_costs_rest(start_time, end_time, granularity)

    def _tags_to_json(self, tags) -> str:
        """Convert OCI tags dict to JSON string."""
        import json
        if tags is None:
            return None
        if isinstance(tags, dict):
            return json.dumps(tags) if tags else None
        return None

    async def _query_costs_rest(
        self,
        start_time: str,
        end_time: str,
        granularity: str
    ) -> List[Dict[str, Any]]:
        """Fallback: Query OCI Usage API via REST."""
        import httpx

        config = await self._auth.get_oci_config()
        region = config["region"]
        tenancy = config["tenancy"]

        url = f"https://usageapi.{region}.oci.oraclecloud.com/20200107/usage"

        # Note: OCI REST API requires request signing
        # This is a simplified example - production would need proper signature
        logger.warning("REST API fallback not fully implemented - requires OCI request signing")

        return []


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    extractor = OCICostExtractor(org_slug)
    return await extractor.execute(step_config, context)


def get_engine():
    """Factory function for pipeline executor."""
    return OCICostExtractor()
