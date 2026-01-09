"""
Pipeline Trigger Helper

Helper functions for triggering pipelines from API service.
Used for automatic pipeline execution after data changes (e.g., subscription creation).
"""

import httpx
import logging
from typing import Optional, Dict, Any
from datetime import date

logger = logging.getLogger(__name__)


async def trigger_subscription_cost_pipeline(
    org_slug: str,
    api_key: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pipeline_service_url: str = "http://localhost:8001"
) -> Dict[str, Any]:
    """
    Trigger subscription cost calculation pipeline.

    Args:
        org_slug: Organization slug
        api_key: Org API key for authentication
        start_date: Optional start date (defaults to MONTH_START in pipeline)
        end_date: Optional end date (defaults to TODAY in pipeline)
        pipeline_service_url: Pipeline service base URL

    Returns:
        Dict with pipeline_logging_id and status, or error details

    Notes:
        - This is a best-effort trigger - failures are logged but don't raise exceptions
        - If subscription was created with past start_date, this enables cost backfill
        - Pipeline defaults: start_date=MONTH_START, end_date=TODAY
    """
    try:
        # Build pipeline URL
        url = f"{pipeline_service_url}/api/v1/pipelines/run/{org_slug}/subscription/costs/subscription_cost"

        # Build request body
        body: Dict[str, Any] = {}
        if start_date:
            body["start_date"] = start_date.isoformat()
        if end_date:
            body["end_date"] = end_date.isoformat()

        # Make async HTTP request with timeout
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json=body
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(
                    f"Subscription cost pipeline triggered successfully",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_logging_id": result.get("pipeline_logging_id"),
                        "start_date": start_date.isoformat() if start_date else "MONTH_START",
                        "end_date": end_date.isoformat() if end_date else "TODAY"
                    }
                )
                return {
                    "success": True,
                    "pipeline_logging_id": result.get("pipeline_logging_id"),
                    "status": result.get("status", "PENDING"),
                    "message": result.get("message", "Pipeline triggered")
                }
            elif response.status_code == 429:
                # Pipeline already running or rate limited - this is OK
                logger.info(
                    f"Subscription cost pipeline already running or rate limited",
                    extra={"org_slug": org_slug, "status_code": response.status_code}
                )
                return {
                    "success": True,  # Not a failure - pipeline is running
                    "status": "ALREADY_RUNNING",
                    "message": "Pipeline already in progress"
                }
            else:
                # Other error codes
                error_detail = response.text
                try:
                    error_detail = response.json().get("detail", response.text)
                except Exception:
                    pass

                logger.warning(
                    f"Failed to trigger subscription cost pipeline",
                    extra={
                        "org_slug": org_slug,
                        "status_code": response.status_code,
                        "error": error_detail
                    }
                )
                return {
                    "success": False,
                    "status": "FAILED",
                    "message": f"Pipeline trigger failed: {error_detail}"
                }

    except httpx.TimeoutException as e:
        logger.warning(
            f"Timeout triggering subscription cost pipeline",
            extra={"org_slug": org_slug, "error": str(e)}
        )
        return {
            "success": False,
            "status": "TIMEOUT",
            "message": "Pipeline service timeout"
        }

    except Exception as e:
        logger.error(
            f"Unexpected error triggering subscription cost pipeline",
            extra={"org_slug": org_slug, "error": str(e)},
            exc_info=True
        )
        return {
            "success": False,
            "status": "ERROR",
            "message": f"Unexpected error: {str(e)}"
        }


def should_trigger_cost_backfill(start_date: Optional[date]) -> bool:
    """
    Determine if cost backfill should be triggered based on subscription start_date.

    Args:
        start_date: Subscription start date

    Returns:
        True if start_date is in the past (should backfill costs)
        False if start_date is today or future (costs will be calculated on schedule)

    Notes:
        - If start_date is None, we don't trigger (pipeline defaults to MONTH_START)
        - If start_date is today or future, daily schedule will handle it
        - If start_date is in the past, we need to backfill historical costs
    """
    if start_date is None:
        return False

    today = date.today()
    return start_date < today
