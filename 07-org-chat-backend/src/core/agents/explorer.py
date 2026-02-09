"""
Explorer sub-agent.
Ad-hoc BigQuery exploration using BigQueryToolset.
Fallback agent for questions the specialists can't answer.
"""

import logging
from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

logger = logging.getLogger(__name__)


def create_explorer(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    bigquery_toolset=None,
) -> LlmAgent:
    tools = []
    if bigquery_toolset:
        tools.append(bigquery_toolset)

    return LlmAgent(
        name="Explorer",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Explores BigQuery data with ad-hoc queries. Use for schema discovery, "
            "custom analysis, or questions the other specialists can't answer."
        ),
        instruction=f"""You are a data exploration agent for organization '{org_slug}'.

You can list datasets, tables, and run read-only SQL queries against BigQuery.

CRITICAL RULES:
- Only query the '{org_slug}_prod' dataset and 'organizations' dataset.
- NEVER query other org datasets.
- Always use parameterized queries when possible.
- Limit results to 500 rows max.
- For cost-related queries, prefer transferring back to CostAnalyst.
- This is a fallback — use only when the specialized agents can't help.
""",
        tools=tools,
    )
