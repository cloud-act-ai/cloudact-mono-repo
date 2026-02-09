"""
Authentication dependency for chat backend.
Validates X-Org-Slug and X-API-Key headers from CopilotKit Runtime.
"""

import re
import hashlib
import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException
from google.cloud import bigquery

from src.core.engine.bigquery import execute_query
from src.app.config import get_settings

logger = logging.getLogger(__name__)

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")


@dataclass
class ChatContext:
    org_slug: str
    user_id: str
    api_key_hash: str


def _hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def _validate_org_slug(org_slug: str) -> None:
    """Validate org_slug format to prevent injection. Always enforced."""
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise HTTPException(
            status_code=400,
            detail="Invalid org_slug format. Must be 3-50 lowercase alphanumeric characters with underscores.",
        )


async def get_chat_context(
    x_org_slug: str = Header(..., alias="X-Org-Slug"),
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_user_id: str = Header(default="anonymous", alias="X-User-Id"),
) -> ChatContext:
    """
    Validate org context from headers injected by CopilotKit Runtime.

    The CopilotKit Runtime (in 01-frontend) validates the Supabase JWT
    and extracts org_slug + API key server-side. This endpoint validates
    the API key against BigQuery.
    """
    settings = get_settings()

    # Always validate org_slug format, even in dev mode
    effective_slug = x_org_slug or settings.default_org_slug
    _validate_org_slug(effective_slug)

    if settings.disable_auth:
        return ChatContext(
            org_slug=effective_slug,
            user_id=x_user_id,
            api_key_hash="dev",
        )

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header is required")

    api_key_hash = _hash_api_key(x_api_key)
    org_dataset = settings.organizations_dataset

    rows = execute_query(
        f"""SELECT org_slug FROM `{org_dataset}.org_api_keys`
            WHERE key_hash = @key_hash AND org_slug = @org_slug
              AND is_active = TRUE LIMIT 1""",
        params=[
            bigquery.ScalarQueryParameter("key_hash", "STRING", api_key_hash),
            bigquery.ScalarQueryParameter("org_slug", "STRING", x_org_slug),
        ],
    )

    if not rows:
        raise HTTPException(status_code=401, detail="Invalid API key or org mismatch")

    return ChatContext(
        org_slug=x_org_slug,
        user_id=x_user_id,
        api_key_hash=api_key_hash,
    )
