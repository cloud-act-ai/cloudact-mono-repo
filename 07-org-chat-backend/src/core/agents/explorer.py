"""
Explorer sub-agent.
Ad-hoc BigQuery exploration with org-scoped tools.
Fallback agent for questions the specialists can't answer.
"""

import logging
from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.tools.explorer import list_org_tables, describe_table, run_read_query
from src.core.tools.shared import bind_org_slug

logger = logging.getLogger(__name__)


def create_explorer(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    bigquery_toolset=None,
) -> LlmAgent:
    tools = [bind_org_slug(fn, org_slug) for fn in [
        list_org_tables, describe_table, run_read_query,
    ]]

    # Also include external BigQueryToolset if provided
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

You can list datasets, tables, describe schemas, and run read-only SQL queries against BigQuery.

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- Only query the '{org_slug}_prod' dataset and 'organizations' dataset.
- NEVER query other org datasets.
- Use list_org_tables to discover available tables.
- Use describe_table to see column schemas before writing queries.
- Use run_read_query for SELECT-only queries (max 500 rows).
- For cost-related queries, prefer transferring back to CostAnalyst.
- This is a fallback — use only when the specialized agents can't help.
""",
        tools=tools,
    )
