"""
BigQuery-backed session and conversation persistence.

Handles:
- Loading conversation history from org_chat_messages
- Persisting new messages via Streaming Insert
- Persisting tool calls for audit
- Conversation CRUD (create, update metadata)

This is NOT an ADK SessionService replacement — ADK manages in-memory sessions.
This layer syncs between ADK sessions and BigQuery (single source of truth).
"""

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google.cloud import bigquery

from src.core.engine.bigquery import execute_query, streaming_insert
from src.core.security.org_validator import validate_org
from src.app.config import get_settings

logger = logging.getLogger(__name__)

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")


def _validate_org_slug_format(org_slug: str) -> None:
    """Fast format-only validation. Prevents injection in table references."""
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise ValueError(f"Invalid org_slug format: {org_slug!r}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _org_table(table_name: str) -> str:
    settings = get_settings()
    return f"{settings.gcp_project_id}.{settings.organizations_dataset}.{table_name}"


# ============================================
# Conversations
# ============================================


def create_conversation(
    org_slug: str,
    user_id: str,
    provider: str,
    model_id: str,
    title: Optional[str] = None,
) -> str:
    """Create a new conversation. Returns conversation_id."""
    validate_org(org_slug)

    conversation_id = f"conv_{uuid.uuid4().hex[:16]}"
    now = _now()

    row = {
        "conversation_id": conversation_id,
        "org_slug": org_slug,
        "user_id": user_id,
        "title": title or "New conversation",
        "provider": provider,
        "model_id": model_id,
        "status": "active",
        "message_count": 0,
        "created_at": now,
        "updated_at": now,
    }

    streaming_insert(_org_table("org_chat_conversations"), [row])
    logger.info(f"Created conversation {conversation_id} for {org_slug}/{user_id}")
    return conversation_id


def get_conversation(
    org_slug: str,
    conversation_id: str,
) -> Optional[Dict[str, Any]]:
    """Load conversation metadata."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    rows = execute_query(
        f"""SELECT * FROM `{dataset}.org_chat_conversations`
            WHERE conversation_id = @conv_id AND org_slug = @org_slug LIMIT 1""",
        params=[
            bigquery.ScalarQueryParameter("conv_id", "STRING", conversation_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ],
    )
    return rows[0] if rows else None


def list_conversations(
    org_slug: str,
    user_id: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """List conversations for a user in an org."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    return execute_query(
        f"""SELECT conversation_id, title, status, message_count,
                   provider, model_id, created_at, last_message_at
            FROM `{dataset}.org_chat_conversations`
            WHERE org_slug = @org_slug AND user_id = @user_id AND status = 'active'
            ORDER BY COALESCE(last_message_at, created_at) DESC
            LIMIT {max(1, min(limit, 50))}""",
        params=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        ],
    )


# ============================================
# Messages
# ============================================


def load_message_history(
    org_slug: str,
    conversation_id: str,
    max_messages: int = 50,
) -> List[Dict[str, Any]]:
    """Load conversation message history from BigQuery."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset
    max_messages = max(1, min(max_messages, 200))

    return execute_query(
        f"""SELECT message_id, role, content, agent_name,
                   tool_calls_json, model_id, created_at
            FROM `{dataset}.org_chat_messages`
            WHERE conversation_id = @conv_id AND org_slug = @org_slug
            ORDER BY created_at ASC
            LIMIT {max_messages}""",
        params=[
            bigquery.ScalarQueryParameter("conv_id", "STRING", conversation_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ],
    )


def persist_message(
    org_slug: str,
    conversation_id: str,
    role: str,
    content: str,
    agent_name: Optional[str] = None,
    tool_calls_json: Optional[str] = None,
    tool_results_json: Optional[str] = None,
    model_id: Optional[str] = None,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    latency_ms: Optional[int] = None,
) -> str:
    """Persist a message to BigQuery via Streaming Insert. Returns message_id."""
    _validate_org_slug_format(org_slug)
    message_id = f"msg_{uuid.uuid4().hex[:16]}"

    row = {
        "message_id": message_id,
        "conversation_id": conversation_id,
        "org_slug": org_slug,
        "role": role,
        "content": content,
        "agent_name": agent_name,
        "tool_calls_json": tool_calls_json,
        "tool_results_json": tool_results_json,
        "model_id": model_id,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "latency_ms": latency_ms,
        "created_at": _now(),
    }

    # Remove None values for BigQuery
    row = {k: v for k, v in row.items() if v is not None}

    streaming_insert(_org_table("org_chat_messages"), [row])
    return message_id


# ============================================
# Tool Calls (audit log)
# ============================================


def persist_tool_call(
    org_slug: str,
    conversation_id: str,
    message_id: str,
    agent_name: str,
    tool_name: str,
    tool_domain: str,
    input_params: str,
    output_result: Optional[str] = None,
    bytes_processed: Optional[int] = None,
    duration_ms: int = 0,
    status: str = "success",
    error_message: Optional[str] = None,
) -> str:
    """Persist a tool call to BigQuery for auditing."""
    _validate_org_slug_format(org_slug)
    tool_call_id = f"tc_{uuid.uuid4().hex[:12]}"

    row = {
        "tool_call_id": tool_call_id,
        "message_id": message_id,
        "conversation_id": conversation_id,
        "org_slug": org_slug,
        "agent_name": agent_name,
        "tool_name": tool_name,
        "tool_domain": tool_domain,
        "input_params": input_params,
        "output_result": output_result,
        "bytes_processed": bytes_processed,
        "duration_ms": duration_ms,
        "status": status,
        "error_message": error_message,
        "created_at": _now(),
    }

    row = {k: v for k, v in row.items() if v is not None}

    streaming_insert(_org_table("org_chat_tool_calls"), [row])
    return tool_call_id


# ============================================
# Chat Settings
# ============================================


def load_chat_settings(org_slug: str) -> Optional[Dict[str, Any]]:
    """Load active chat settings for an org."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    rows = execute_query(
        f"""SELECT setting_id, provider, credential_id, model_id, model_name,
                   temperature, max_tokens, include_org_context, enable_memory,
                   max_history_messages, system_prompt_extra
            FROM `{dataset}.org_chat_settings`
            WHERE org_slug = @org_slug AND is_active = TRUE
            LIMIT 1""",
        params=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)],
    )
    return rows[0] if rows else None


def load_encrypted_credential(
    org_slug: str,
    credential_id: str,
) -> Optional[str]:
    """Load encrypted credential from org_integration_credentials."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    rows = execute_query(
        f"""SELECT encrypted_credential
            FROM `{dataset}.org_integration_credentials`
            WHERE credential_id = @cred_id
              AND org_slug = @org_slug
              AND is_active = TRUE
              AND validation_status = 'VALID'
            LIMIT 1""",
        params=[
            bigquery.ScalarQueryParameter("cred_id", "STRING", credential_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ],
    )
    return rows[0]["encrypted_credential"] if rows else None
