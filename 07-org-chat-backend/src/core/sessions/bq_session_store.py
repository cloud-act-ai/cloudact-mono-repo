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
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """List conversations for a user in an org."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    return execute_query(
        f"""SELECT c.conversation_id, c.title, c.status,
                   COALESCE(m.msg_count, 0) AS message_count,
                   c.provider, c.model_id, c.created_at,
                   m.last_msg_at AS last_message_at
            FROM `{dataset}.org_chat_conversations` c
            LEFT JOIN (
                SELECT conversation_id,
                       COUNT(*) AS msg_count,
                       MAX(created_at) AS last_msg_at
                FROM `{dataset}.org_chat_messages`
                WHERE org_slug = @org_slug
                GROUP BY conversation_id
            ) m ON c.conversation_id = m.conversation_id
            WHERE c.org_slug = @org_slug AND c.user_id = @user_id AND c.status = 'active'
            ORDER BY COALESCE(m.last_msg_at, c.created_at) DESC
            LIMIT {max(1, min(limit, 10))}""",
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

    # Note: We skip updating conversation metadata (message_count, last_message_at)
    # because BigQuery streaming buffer rows cannot be UPDATEd immediately.
    # The message_count is derived from actual messages when listing conversations.

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


def delete_conversation(
    org_slug: str,
    conversation_id: str,
) -> bool:
    """Soft-delete a conversation by setting status='deleted'.

    Returns True if the conversation was deleted, False if not found.
    Note: rows still in the streaming buffer (~90 min) cannot be updated;
    old conversations (the typical delete target) are always safe.
    """
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    # Soft-delete: set status to 'deleted' (list queries already filter status='active')
    try:
        execute_query(
            f"""UPDATE `{dataset}.org_chat_conversations`
                SET status = 'deleted', updated_at = @now
                WHERE conversation_id = @conv_id AND org_slug = @org_slug AND status = 'active'""",
            params=[
                bigquery.ScalarQueryParameter("conv_id", "STRING", conversation_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("now", "STRING", _now()),
            ],
        )
        logger.info(f"Soft-deleted conversation {conversation_id} for {org_slug}")
        return True
    except Exception as e:
        # Rows in BQ streaming buffer (~90 min) cannot be UPDATEd
        logger.warning(f"Could not delete conversation {conversation_id}: {e}")
        return False


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


# ============================================
# Rename / Search / Auto-Title
# ============================================


def rename_conversation(
    org_slug: str,
    conversation_id: str,
    title: str,
) -> bool:
    """Rename a conversation."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset

    # Sanitize title
    title = title.strip()[:100]  # Max 100 chars
    if not title:
        return False

    try:
        execute_query(
            f"""UPDATE `{dataset}.org_chat_conversations`
                SET title = @title, updated_at = @now
                WHERE conversation_id = @conv_id AND org_slug = @org_slug AND status = 'active'""",
            params=[
                bigquery.ScalarQueryParameter("title", "STRING", title),
                bigquery.ScalarQueryParameter("conv_id", "STRING", conversation_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("now", "STRING", _now()),
            ],
        )
        return True
    except Exception as e:
        logger.warning(f"Could not rename conversation {conversation_id}: {e}")
        return False


def search_messages(
    org_slug: str,
    user_id: str,
    query: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Search messages across all conversations for a user."""
    _validate_org_slug_format(org_slug)
    settings = get_settings()
    dataset = settings.organizations_dataset
    limit = max(1, min(limit, 50))

    # Sanitize query
    search_term = query.strip()[:200]
    if not search_term:
        return []

    return execute_query(
        f"""SELECT m.message_id, m.conversation_id, m.content, m.role, m.created_at
            FROM `{dataset}.org_chat_messages` m
            JOIN `{dataset}.org_chat_conversations` c
              ON m.conversation_id = c.conversation_id AND m.org_slug = c.org_slug
            WHERE m.org_slug = @org_slug
              AND c.user_id = @user_id
              AND c.status = 'active'
              AND LOWER(m.content) LIKE CONCAT('%', LOWER(@query), '%')
            ORDER BY m.created_at DESC
            LIMIT {limit}""",
        params=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
            bigquery.ScalarQueryParameter("query", "STRING", search_term),
        ],
    )


def generate_title_from_message(first_message: str) -> str:
    """Generate a conversation title from the first user message."""
    title = first_message.strip()[:60]
    if len(first_message.strip()) > 60:
        last_space = title.rfind(" ")
        if last_space > 20:
            title = title[:last_space] + "..."
        else:
            title = title + "..."
    return title or "New conversation"


def auto_title_conversation(
    org_slug: str,
    conversation_id: str,
    first_message: str,
) -> None:
    """Auto-generate conversation title from the first message.
    Note: This uses DML UPDATE which won't work on streaming-buffer rows.
    Prefer passing title to create_conversation() instead.
    """
    _validate_org_slug_format(org_slug)
    title = generate_title_from_message(first_message)

    settings = get_settings()
    dataset = settings.organizations_dataset

    try:
        execute_query(
            f"""UPDATE `{dataset}.org_chat_conversations`
                SET title = @title, updated_at = @now
                WHERE conversation_id = @conv_id AND org_slug = @org_slug""",
            params=[
                bigquery.ScalarQueryParameter("title", "STRING", title),
                bigquery.ScalarQueryParameter("conv_id", "STRING", conversation_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("now", "STRING", _now()),
            ],
        )
    except Exception as e:
        logger.warning(f"Could not auto-title conversation {conversation_id}: {e}")
