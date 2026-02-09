"""MCP tool registry — 13 tools across 3 domains."""

from src.core.tools.costs import (
    query_costs,
    compare_periods,
    cost_breakdown,
    cost_forecast,
    top_cost_drivers,
)
from src.core.tools.alerts import (
    list_alerts,
    create_alert,
    alert_history,
    acknowledge_alert,
)
from src.core.tools.usage import (
    genai_usage,
    quota_status,
    top_consumers,
    pipeline_runs,
)

# All tools grouped by domain for agent registration
COST_TOOLS = [query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers]
ALERT_TOOLS = [list_alerts, create_alert, alert_history, acknowledge_alert]
USAGE_TOOLS = [genai_usage, quota_status, top_consumers, pipeline_runs]
ALL_TOOLS = COST_TOOLS + ALERT_TOOLS + USAGE_TOOLS
