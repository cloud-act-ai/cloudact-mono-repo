"""
A2A Agent Card — /.well-known/agent.json
Exposes agent capabilities for external A2A discovery.
"""

from src.app.config import get_settings


def get_agent_card() -> dict:
    """
    Generate A2A agent card for CloudAct Chat Backend.

    This card is served at /.well-known/agent.json for agent-to-agent
    protocol discovery per the A2A specification.
    """
    settings = get_settings()

    return {
        "name": "CloudAct AI",
        "description": (
            "Multi-tenant cloud cost analytics AI assistant. "
            "Analyzes cloud, GenAI, and SaaS costs across GCP, AWS, Azure, OCI, "
            "OpenAI, Anthropic, Gemini, and DeepSeek."
        ),
        "url": f"https://chat.cloudact.ai",
        "version": settings.app_version,
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
            "stateTransitionHistory": True,
        },
        "skills": [
            {
                "id": "cost_analysis",
                "name": "Cost Analysis",
                "description": (
                    "Query and analyze cloud, GenAI, and SaaS costs. "
                    "Supports breakdowns, period comparisons, forecasts, and top cost drivers."
                ),
                "tags": ["costs", "cloud", "genai", "saas", "focus-1.3"],
            },
            {
                "id": "alert_management",
                "name": "Alert Management",
                "description": "Create, list, and manage cost alert rules and their trigger history.",
                "tags": ["alerts", "thresholds", "notifications"],
            },
            {
                "id": "usage_analytics",
                "name": "Usage Analytics",
                "description": (
                    "Analyze GenAI token usage, API call volumes, quota utilization, "
                    "and pipeline execution history."
                ),
                "tags": ["usage", "tokens", "quotas", "pipelines"],
            },
            {
                "id": "data_exploration",
                "name": "Data Exploration",
                "description": "Ad-hoc BigQuery queries for custom analysis and schema discovery.",
                "tags": ["bigquery", "sql", "exploration"],
            },
        ],
        "authentication": {
            "schemes": ["apiKey"],
            "credentials": {
                "apiKey": {
                    "headerName": "X-API-Key",
                    "description": "Organization API key for multi-tenant authentication",
                }
            },
        },
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
    }
