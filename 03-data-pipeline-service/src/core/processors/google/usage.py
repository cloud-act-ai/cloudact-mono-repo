"""
Google Vertex AI Usage Processor

Fetches usage data from Google Cloud Discovery API or aggregated logs.
Currently a placeholder as Vertex AI usage is best handled via BigQuery Billing Export.
This processor acts as a stub to allow the pipeline to run without errors.

Usage in pipeline:
    ps_type: google.usage
"""

import logging
from datetime import datetime, timedelta
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
            
        start_date = config.get("start_date") or (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = config.get("end_date") or datetime.utcnow().strftime("%Y-%m-%d")

        self.logger.info(
            f"Fetching Google usage for {org_slug} (Stub)",
            extra={"org_slug": org_slug}
        )
        
        # Placeholder return
        return {
            "status": "SUCCESS",
            "provider": "GOOGLE",
            "date_range": {"start": start_date, "end": end_date},
            "usage_records": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0,
            "message": "Google usage currently requires BigQuery Billing Export integration.",
            "note": "Configure Billing Export to BigQuery for accurate usage tracking."
        }


def get_engine():
    return GoogleUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    processor = GoogleUsageProcessor()
    return await processor.execute(step_config, context)
