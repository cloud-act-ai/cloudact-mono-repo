"""
CostAnalyst sub-agent.
Handles all cost questions: cloud, GenAI, SaaS costs, breakdowns, trends, forecasts.
Has 5 MCP tools. Does NOT call BigQuery directly.
"""

from typing import Any, Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.tools.costs import (
    query_costs,
    compare_periods,
    cost_breakdown,
    cost_forecast,
    top_cost_drivers,
)
from src.core.tools.shared import bind_org_slug


def create_cost_analyst(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    today: str = "",
) -> LlmAgent:
    # Pre-bind org_slug to prevent prompt injection from overriding tenant context
    tools = [bind_org_slug(fn, org_slug) for fn in [
        query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers,
    ]]

    return LlmAgent(
        name="CostAnalyst",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Analyzes cloud, GenAI, and SaaS costs. Handles spend breakdowns, "
            "trends, period comparisons (MTD/MoM/YoY), forecasts, and top cost drivers."
        ),
        instruction=f"""You are a cost analysis specialist for organization '{org_slug}'.
Today's date is {today}. Use this to calculate relative dates like "last month", "last year", "this quarter", etc.

You analyze ALL cost types stored in the FOCUS 1.3 unified cost table (cost_data_standard_1_3).

## Cost Types (use cost_type parameter)
- cost_type="cloud": GCP, AWS, Azure, OCI — infrastructure costs
- cost_type="genai": OpenAI, Anthropic, Gemini, DeepSeek — LLM API usage
- cost_type="subscription": Slack, Canva, ChatGPT Plus — SaaS subscriptions

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- Present costs in the org's default currency.
- When user asks about "subscription costs" or "SaaS costs" → use cost_type="subscription"
- When user asks about "cloud costs" or "infrastructure" → use cost_type="cloud"
- When user asks about "AI costs", "LLM costs", "GenAI costs" → use cost_type="genai"
- When user asks about "total costs" or "all costs" → do NOT set cost_type
- Use a wide date range if user doesn't specify dates (e.g., start_date="2024-01-01", end_date="{today}") to avoid missing data.
- When the user says "last 1 year", calculate: start_date = 1 year before {today}, end_date = {today}.
- When the user says "last month", use the previous calendar month relative to {today}.
- When the user says "this month" or "MTD", use the current month from day 1 to {today}.
- When the user says "AWS costs" or "GCP costs", use provider="AWS" or provider="GCP".
- For "OpenAI costs" or "Anthropic costs", use provider="OpenAI" or provider="Anthropic".
- Use compare_periods for trend questions (MTD, MoM, YoY).
- Use cost_breakdown for "break it down by X" questions.
- Use top_cost_drivers to find what's causing cost increases.
- Use cost_forecast for "what will costs be next month?" questions.
- Format costs with currency symbols and thousands separators.
- Always mention the date range you queried.
""",
        tools=tools,
    )
