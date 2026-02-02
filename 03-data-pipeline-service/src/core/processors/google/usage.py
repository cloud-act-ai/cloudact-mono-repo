"""
Google Vertex AI Usage Processor

Fetches usage data from Google Cloud Discovery API or aggregated logs.
Currently a placeholder as Vertex AI usage is best handled via BigQuery Billing Export.
This processor acts as a stub to allow the pipeline to run without errors.

Usage in pipeline:
    ps_type: google.usage
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List

from src.app.config import get_settings


class GoogleUsageProcessor:
    """
    Processor for fetching Google Vertex AI usage.
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
        Fetch Google usage data (Stub).
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}
            
        start_date = config.get("start_date") or (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = config.get("end_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        self.logger.info(
            f"Fetching Google usage for {org_slug} (Stub)",
            extra={"org_slug": org_slug}
        )
        
        # Google Vertex AI usage requires BigQuery Billing Export
        # Return SKIPPED status to indicate this step was intentionally not executed
        return {
            "status": "SKIPPED",
            "provider": "GOOGLE",
            "date_range": {"start": start_date, "end": end_date},
            "usage_records": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0,
            "reason": "Google usage requires BigQuery Billing Export",
            "message": "Google Cloud/Vertex AI usage is tracked via BigQuery Billing Export, not a direct API.",
            "action_required": "Configure Cloud Billing Export to BigQuery and use gcp.cost pipeline instead.",
            "is_stub": True
        }


def get_engine():
    return GoogleUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    processor = GoogleUsageProcessor()
    return await processor.execute(step_config, context)
