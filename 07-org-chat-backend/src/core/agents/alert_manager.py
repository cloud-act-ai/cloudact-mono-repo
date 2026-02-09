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

You manage cost alert rules and their trigger history.

RULES:
- org_slug is already set — do NOT pass it to tool calls.
- When creating alerts, confirm the threshold and severity with the user.
- Suggest appropriate severity levels: info (monitoring), warning (action needed), critical (immediate).
- Show alert history in chronological order with status indicators.
- For acknowledgment, confirm the specific alert the user wants to acknowledge.
""",
        tools=tools,
    )
