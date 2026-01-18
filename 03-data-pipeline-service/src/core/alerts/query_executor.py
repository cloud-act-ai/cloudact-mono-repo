"""
Query Executor

Predefined BigQuery query templates for alert evaluation.
Each template is optimized for the specific alert type.
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
import logging

from src.app.config import settings

logger = logging.getLogger(__name__)


# ============================================
# QUERY TEMPLATES
# ============================================

QUERY_TEMPLATES = {
    # --------------------------------------------
    # SUBSCRIPTION COSTS (Primary use case)
    # --------------------------------------------
    "subscription_costs": """
        SELECT
            @org_slug as org_slug,
            SUM(BilledCost) as total_cost,
            MAX(BillingCurrency) as currency,
            COUNT(*) as record_count,
            MIN(DATE(ChargePeriodStart)) as period_start,
            MAX(DATE(ChargePeriodEnd)) as period_end
        FROM `{project}.{dataset}.cost_data_standard_1_3`
        WHERE x_source_system = 'subscription_costs_daily'
          AND DATE(ChargePeriodStart) >= @start_date
          AND DATE(ChargePeriodStart) <= @end_date
    """,

    # --------------------------------------------
    # CLOUD COSTS (GCP, AWS, Azure)
    # --------------------------------------------
    "cloud_costs": """
        SELECT
            @org_slug as org_slug,
            SUM(BilledCost) as total_cost,
            MAX(BillingCurrency) as currency,
            COUNT(*) as record_count
        FROM `{project}.{dataset}.cost_data_standard_1_3`
        WHERE x_source_system IN ('gcp_billing', 'aws_billing', 'azure_billing')
          AND DATE(ChargePeriodStart) >= @start_date
          AND DATE(ChargePeriodStart) <= @end_date
    """,

    # --------------------------------------------
    # GENAI COSTS
    # --------------------------------------------
    "genai_costs": """
        SELECT
            @org_slug as org_slug,
            SUM(BilledCost) as total_cost,
            SUM(ConsumedQuantity) as total_tokens,
            MAX(BillingCurrency) as currency,
            COUNT(*) as record_count
        FROM `{project}.{dataset}.cost_data_standard_1_3`
        WHERE (
            LOWER(ServiceProviderName) IN ('openai', 'anthropic', 'google', 'gemini')
            OR LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning')
        )
        AND x_source_system != 'subscription_costs_daily'
        AND DATE(ChargePeriodStart) >= @start_date
        AND DATE(ChargePeriodStart) <= @end_date
    """,

    # --------------------------------------------
    # TOTAL COSTS (All types combined)
    # --------------------------------------------
    "total_costs": """
        SELECT
            @org_slug as org_slug,
            SUM(BilledCost) as total_cost,
            MAX(BillingCurrency) as currency,
            COUNT(*) as record_count
        FROM `{project}.{dataset}.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) >= @start_date
          AND DATE(ChargePeriodStart) <= @end_date
    """,

    # --------------------------------------------
    # QUOTA USAGE
    # --------------------------------------------
    "quota_usage": """
        SELECT
            org_slug,
            pipelines_run_today as daily_runs,
            pipelines_run_month as monthly_runs,
            daily_limit,
            monthly_limit,
            SAFE_DIVIDE(pipelines_run_today, daily_limit) * 100 as daily_usage_percent,
            SAFE_DIVIDE(pipelines_run_month, monthly_limit) * 100 as monthly_usage_percent
        FROM `{project}.organizations.org_usage_quotas`
        WHERE usage_date = @usage_date
          AND daily_limit > 0
    """,
}


class AlertQueryExecutor:
    """
    Execute parameterized alert queries against BigQuery.

    Queries are executed per-org for cost data (each org has its own dataset).
    """

    def __init__(self, bq_client=None):
        """
        Initialize query executor.

        Args:
            bq_client: BigQuery client instance (optional, will be obtained if not provided)
        """
        self._bq_client = bq_client
        self._project_id = settings.gcp_project_id

    async def execute(
        self,
        template_name: str,
        params: Dict[str, Any],
        org_slugs: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a query template for one or more organizations.

        Args:
            template_name: Name of query template
            params: Query parameters (period, filters, etc.)
            org_slugs: List of org slugs to query. If None, queries all active orgs.

        Returns:
            List of result rows as dictionaries
        """
        if template_name not in QUERY_TEMPLATES:
            raise ValueError(f"Unknown query template: {template_name}")

        template = QUERY_TEMPLATES[template_name]

        # Resolve period to actual dates
        start_date, end_date = self._resolve_period(params.get("period", "current_month"))

        # Get orgs to query
        if org_slugs is None:
            org_slugs = await self._get_active_orgs()

        results = []

        for org_slug in org_slugs:
            try:
                # Format query with project and org dataset
                env_suffix = settings.get_environment_suffix()
                dataset = f"{org_slug}_{env_suffix}"

                query = template.format(
                    project=self._project_id,
                    dataset=dataset
                )

                # Execute query
                row = await self._execute_org_query(query, org_slug, start_date, end_date)
                if row and row.get("total_cost") is not None:
                    row["org_slug"] = org_slug
                    results.append(row)

            except Exception as e:
                logger.warning(f"Query failed for org {org_slug}: {e}")

        return results

    async def _execute_org_query(
        self,
        query: str,
        org_slug: str,
        start_date: date,
        end_date: date
    ) -> Optional[Dict[str, Any]]:
        """
        Execute query for a single organization with configurable timeout.

        Args:
            query: Formatted SQL query
            org_slug: Organization slug
            start_date: Query start date
            end_date: Query end date

        Returns:
            Single result row or None
        """
        from google.cloud import bigquery
        import asyncio
        from concurrent.futures import TimeoutError as FuturesTimeoutError

        # Get or create BigQuery client
        if self._bq_client is None:
            from src.core.engine.bq_client import get_bigquery_client
            self._bq_client = get_bigquery_client()

        # GAP-006 FIX: Use configurable query timeout
        query_timeout = settings.alert_query_timeout_seconds

        # Build query parameters
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
                bigquery.ScalarQueryParameter("usage_date", "DATE", date.today()),
            ]
        )

        try:
            job = self._bq_client.client.query(query, job_config=job_config)

            # GAP-006 FIX: Apply timeout to query result
            loop = asyncio.get_running_loop()
            rows = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: list(job.result(timeout=query_timeout))),
                timeout=query_timeout + 5  # Extra 5s buffer for network
            )

            if rows:
                return dict(rows[0])
            return None

        except (asyncio.TimeoutError, FuturesTimeoutError):
            logger.error(f"Query timed out after {query_timeout}s for {org_slug}")
            return None
        except Exception as e:
            logger.debug(f"Query execution failed for {org_slug}: {e}")
            return None

    def _resolve_period(self, period: str) -> tuple:
        """
        Convert period string to date range.

        Args:
            period: Period identifier (current_month, yesterday, last_7_days, etc.)

        Returns:
            Tuple of (start_date, end_date)
        """
        today = date.today()

        if period == "current_month":
            start = today.replace(day=1)
            end = today
        elif period == "yesterday":
            start = end = today - timedelta(days=1)
        elif period == "today":
            start = end = today
        elif period == "last_7_days":
            start = today - timedelta(days=7)
            end = today - timedelta(days=1)
        elif period == "last_30_days":
            start = today - timedelta(days=30)
            end = today - timedelta(days=1)
        elif period == "current_week":
            start = today - timedelta(days=today.weekday())
            end = today
        else:
            # Default to current month
            start = today.replace(day=1)
            end = today

        return start, end

    async def _get_active_orgs(self) -> List[str]:
        """
        Get list of active organization slugs.

        Returns:
            List of org_slug strings
        """
        from google.cloud import bigquery

        if self._bq_client is None:
            from src.core.engine.bq_client import get_bigquery_client
            self._bq_client = get_bigquery_client()

        query = f"""
        SELECT org_slug
        FROM `{self._project_id}.organizations.org_profiles`
        WHERE status = 'ACTIVE'
        """

        try:
            job = self._bq_client.client.query(query)
            return [row["org_slug"] for row in job.result()]
        except Exception as e:
            logger.error(f"Failed to get active orgs: {e}")
            return []
