"""
Orchestrator (Root Agent) — the router.
Has ZERO tools. Only routes to the correct sub-agent.
This is the entry point for all chat interactions.
"""

from datetime import date
from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.agents.cost_analyst import create_cost_analyst
from src.core.agents.alert_manager import create_alert_manager
from src.core.agents.budget_manager import create_budget_manager
from src.core.agents.usage_analyst import create_usage_analyst
from src.core.agents.explorer import create_explorer


def create_orchestrator(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    bigquery_toolset=None,
) -> LlmAgent:
    """
    Create the full agent hierarchy for an organization.

    Orchestrator (Root) → CostAnalyst, AlertManager, BudgetManager, UsageAnalyst, Explorer
    All agents use the same model + key (customer's BYOK).
    """

    today = date.today().isoformat()

    cost_analyst = create_cost_analyst(org_slug, model, generate_config, today)
    alert_manager = create_alert_manager(org_slug, model, generate_config, today)
    budget_manager = create_budget_manager(org_slug, model, generate_config, today)
    usage_analyst = create_usage_analyst(org_slug, model, generate_config, today)
    explorer = create_explorer(org_slug, model, generate_config, bigquery_toolset, today)

    return LlmAgent(
        name="CloudActAI",
        model=model,
        generate_content_config=generate_config,
        description="CloudAct AI assistant for cloud cost analytics",
        instruction=f"""You are CloudAct AI, the intelligent assistant for organization '{org_slug}'.
Today's date is {today}.

You do NOT answer questions directly. You route to the right specialist agent.

ROUTING RULES:
- Cost questions (spend, bills, breakdown, trends, forecasts, cloud costs, GenAI costs, SaaS costs)
  → Transfer to CostAnalyst
- Alert questions (create alert, list alerts, alert history, acknowledge)
  → Transfer to AlertManager
- Budget questions (budgets, spending targets, budget vs actual, variance, allocation, over budget)
  → Transfer to BudgetManager
- Usage questions (token usage, API calls, quotas, pipeline status)
  → Transfer to UsageAnalyst
- Exploratory questions (ad-hoc data queries, schema discovery, anything else)
  → Transfer to Explorer

IMPORTANT:
- "AWS costs", "GCP costs", "Azure costs" = cloud COST questions → CostAnalyst
- "OpenAI usage", "tokens consumed" = USAGE questions → UsageAnalyst
- "OpenAI costs", "how much did Anthropic cost?" = COST questions → CostAnalyst
- "am I over budget?", "budget status", "spending targets" = BUDGET questions → BudgetManager
- If unsure, ask the user to clarify before routing.
- Always be concise and helpful.
- You are scoped to organization '{org_slug}' only.
""",
        sub_agents=[cost_analyst, alert_manager, budget_manager, usage_analyst, explorer],
    )
