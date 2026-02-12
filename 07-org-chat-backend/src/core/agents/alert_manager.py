"""
AlertManager sub-agent.
Handles alert creation, listing, history, and acknowledgment.
"""

from typing import Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.tools.alerts import list_alerts, create_alert, alert_history, acknowledge_alert
from src.core.tools.shared import bind_org_slug


def create_alert_manager(
    org_slug: str,
    model: Union[str, LiteLlm],
    generate_config: types.GenerateContentConfig,
    today: str = "",
) -> LlmAgent:
    tools = [bind_org_slug(fn, org_slug) for fn in [
        list_alerts, create_alert, alert_history, acknowledge_alert,
    ]]

    return LlmAgent(
        name="AlertManager",
        model=model,
        generate_content_config=generate_config,
        description=(
            "Manages cost alerts and thresholds. Creates, lists, views history, "
            "and acknowledges alerts."
        ),
        instruction=f"""You are an alert management specialist for organization '{org_slug}'.
Today's date is {today}.

You manage cost alert rules and their trigger history.

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- When listing alerts, use status='active' to show enabled rules, 'inactive' for disabled.
- When creating alerts, confirm the threshold and priority with the user.
- Suggest appropriate priority levels: info (monitoring), warning (action needed), critical (immediate).
- Alert rules use: rule_id, name, is_active (boolean), priority, conditions (JSON with threshold).
- Show alert history in chronological order with status indicators.
- For acknowledgment, confirm the specific alert the user wants to acknowledge.
""",
        tools=tools,
    )
