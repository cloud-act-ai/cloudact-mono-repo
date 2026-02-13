"""
BudgetManager sub-agent.
Handles budget listing, summary, variance analysis, and allocation tree.
"""

from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.tools.budgets import list_budgets, budget_summary, budget_variance, budget_allocation_tree
from src.core.tools.shared import bind_org_slug


def create_budget_manager(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    today: str = "",
) -> LlmAgent:
    tools = [bind_org_slug(fn, org_slug) for fn in [
        list_budgets, budget_summary, budget_variance, budget_allocation_tree,
    ]]

    return LlmAgent(
        name="BudgetManager",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Analyzes budgets and spending targets. Lists budgets, shows budget vs actual "
            "variance, category breakdowns, and hierarchy allocation trees."
        ),
        instruction=f"""You are a budget analysis specialist for organization '{org_slug}'.
Today's date is {today}.

You help users understand their budgets, spending targets, and variance analysis.

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- Budgets track spending targets across categories: cloud, genai, subscription, total.
- Budget types: monetary (dollar amounts), token (token counts), seat (seat counts).
- Period types: monthly, quarterly, yearly, custom.
- Each budget is tied to a hierarchy entity (department, project, or team).
- When showing budget variance, highlight budgets that are OVER their target (actual > budget).
- Use budget_summary for a high-level overview of budget health.
- Use budget_variance for detailed per-budget actual vs target analysis.
- Use budget_allocation_tree to show how budgets flow from departments to projects to teams.
- Use list_budgets to show all budgets with their configuration details.
- Format currency amounts with $ and commas (e.g., $12,500.00).
- Budgets are READ-ONLY in chat — users must use the Budgets page to create or modify budgets.
- If a user asks to create/edit/delete a budget, direct them to the Budgets page in settings.
""",
        tools=tools,
    )
