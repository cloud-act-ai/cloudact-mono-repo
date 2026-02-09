"""
Agent factory for CloudAct Chat Backend.

Two modes:
1. Production: create_agent_for_org() — builds org-scoped agent with customer's BYOK key.
2. ADK Web / Dev: root_agent — default Gemini agent for testing with `adk web`.

Usage with `adk web`:
    cd 07-org-chat-backend/src/core/agents
    adk web

This module exports `root_agent` as required by ADK convention.
"""

import os
import logging
from typing import Any, Dict, Optional, Union

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from src.core.agents.model_factory import create_model, create_default_model
from src.core.agents.orchestrator import create_orchestrator

logger = logging.getLogger(__name__)


def create_agent_for_org(
    org_slug: str,
    provider: str,
    model_id: str,
    api_key: str,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    bigquery_toolset=None,
) -> LlmAgent:
    """
    Create a full agent hierarchy scoped to a specific org with customer's key.

    This is the PRODUCTION entry point. Called per-request after:
    1. Loading org_chat_settings from BigQuery
    2. Decrypting the credential via KMS
    3. Building the agent with the decrypted key

    Args:
        org_slug: Organization slug for multi-tenant scoping.
        provider: LLM provider (OPENAI, ANTHROPIC, GEMINI, DEEPSEEK).
        model_id: Model identifier (e.g., gpt-4o, claude-opus-4).
        api_key: Decrypted API key (in memory only).
        temperature: LLM temperature (0.0-2.0).
        max_tokens: Max output tokens.
        bigquery_toolset: Optional BigQueryToolset for Explorer agent.

    Returns:
        Root LlmAgent (CloudActAI orchestrator) with full sub-agent hierarchy.
    """
    model = create_model(provider, model_id, api_key)

    generate_config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
    )

    return create_orchestrator(org_slug, model, generate_config, bigquery_toolset)


# ============================================
# ADK Web / Dev default agent
# ============================================
# This `root_agent` is what `adk web` discovers when you run:
#   cd 07-org-chat-backend/src/core/agents && adk web
#
# It uses Gemini (native ADK) with GOOGLE_API_KEY from environment.
# For testing with other providers, set the appropriate env vars.

_dev_org = os.environ.get("DEV_ORG_SLUG", "dev_org_local")

root_agent = create_orchestrator(
    org_slug=_dev_org,
    model=create_default_model(),
    generate_config=types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=4096,
    ),
)
