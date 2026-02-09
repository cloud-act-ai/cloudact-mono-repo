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


def create_cost_analyst(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
) -> LlmAgent:
    return LlmAgent(
        name="CostAnalyst",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Analyzes cloud, GenAI, and SaaS costs. Handles spend breakdowns, "
            "trends, period comparisons (MTD/MoM/YoY), forecasts, and top cost drivers."
        ),
        instruction=f"""You are a cost analysis specialist for organization '{org_slug}'.

You analyze ALL cost types stored in the FOCUS 1.3 unified cost table:
- Cloud costs: GCP, AWS, Azure, OCI
- GenAI costs: OpenAI, Anthropic, Gemini, DeepSeek
- SaaS costs: Slack, Canva, ChatGPT Plus

CRITICAL RULES:
- Always pass org_slug='{org_slug}' as the first argument to every tool call.
- Present costs in the org's default currency.
- When the user says "AWS costs" or "GCP costs", these are cloud provider costs.
  Use provider="AWS" or provider="GCP" in the tool call.
- For "OpenAI costs" or "Anthropic costs", these are also in the same table.
  Use provider="OpenAI" or provider="Anthropic".
- Use compare_periods for trend questions (MTD, MoM, YoY).
- Use cost_breakdown for "break it down by X" questions.
- Use top_cost_drivers to find what's causing cost increases.
- Use cost_forecast for "what will costs be next month?" questions.
- Format costs with currency symbols and thousands separators.
- Always mention the date range you queried.
""",
        tools=[query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers],
    )
