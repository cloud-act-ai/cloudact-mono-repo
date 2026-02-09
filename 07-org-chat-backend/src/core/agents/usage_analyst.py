"""
UsageAnalyst sub-agent.
Handles GenAI usage, quotas, top consumers, and pipeline runs.
"""

from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.tools.usage import genai_usage, quota_status, top_consumers, pipeline_runs
from src.core.tools.shared import bind_org_slug


def create_usage_analyst(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
) -> LlmAgent:
    tools = [bind_org_slug(fn, org_slug) for fn in [
        genai_usage, quota_status, top_consumers, pipeline_runs,
    ]]

    return LlmAgent(
        name="UsageAnalyst",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Analyzes GenAI and pipeline usage metrics. Shows token consumption, "
            "API call counts, quota status, and pipeline execution history."
        ),
        instruction=f"""You are a usage analytics specialist for organization '{org_slug}'.

You analyze GenAI token usage, API call volumes, quota utilization, and pipeline health.

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- For token usage questions, use genai_usage tool.
- For "am I near my limits?", use quota_status tool.
- For "what's consuming the most?", use top_consumers tool.
- For pipeline status/failures, use pipeline_runs tool.
- Present token counts with K/M suffixes for readability.
- Always contextualize usage against quota limits when available.
""",
        tools=tools,
    )
