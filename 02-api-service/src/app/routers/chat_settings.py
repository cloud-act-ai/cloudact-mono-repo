"""
Chat Settings Router

API endpoints for managing AI chat configuration per organization.
Stores settings in BigQuery organizations.org_chat_settings table.
References existing org_integration_credentials for BYOK API keys.

Endpoints:
    GET  /chat-settings/{org_slug}                → Get active chat settings
    POST /chat-settings/{org_slug}                → Create/upsert chat settings
    PUT  /chat-settings/{org_slug}/{setting_id}   → Update specific settings
    DELETE /chat-settings/{org_slug}/{setting_id}  → Delete chat settings
    GET  /chat-settings/{org_slug}/providers       → List available providers
    POST /chat-settings/{org_slug}/validate-key    → Validate LLM API key
"""

import re
import uuid
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field, field_validator
from google.cloud import bigquery

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


# ============================================
# Enums
# ============================================

class LLMProvider(str, Enum):
    OPENAI = "OPENAI"
    ANTHROPIC = "ANTHROPIC"
    GEMINI = "GEMINI"
    DEEPSEEK = "DEEPSEEK"


# Default models per provider
DEFAULT_MODELS: Dict[str, List[Dict[str, str]]] = {
    "OPENAI": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
    ],
    "ANTHROPIC": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
        {"id": "claude-opus-4-20250514", "name": "Claude Opus 4"},
        {"id": "claude-haiku-4-20250514", "name": "Claude Haiku 4"},
    ],
    "GEMINI": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
        {"id": "gemini-2.0-pro", "name": "Gemini 2.0 Pro"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
    ],
    "DEEPSEEK": [
        {"id": "deepseek-chat", "name": "DeepSeek Chat"},
        {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner"},
    ],
}


# ============================================
# Validation
# ============================================

def validate_org_slug(org_slug: str) -> None:
    """Validate org_slug format."""
    if not org_slug or not re.match(r'^[a-z0-9_]{3,50}$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_slug format. Must be 3-50 lowercase alphanumeric characters with underscores.",
        )


def check_org_access(org: Dict, org_slug: str) -> None:
    """Verify authenticated org matches requested org."""
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access settings for another organization",
        )


# ============================================
# Pydantic Models
# ============================================

class ChatSettingCreate(BaseModel):
    """Request model for creating/upserting chat settings."""
    provider: LLMProvider = Field(..., description="LLM provider")
    credential_id: str = Field(..., min_length=1, max_length=100, description="FK to org_integration_credentials")
    model_id: str = Field(..., min_length=1, max_length=100, description="Model identifier (e.g., gpt-4o)")
    model_name: Optional[str] = Field(None, max_length=200, description="Human-readable model name")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="LLM temperature")
    max_tokens: int = Field(default=4096, ge=256, le=32768, description="Max output tokens")
    include_org_context: bool = Field(default=True, description="Inject org metadata into system prompt")
    enable_memory: bool = Field(default=True, description="Load conversation history")
    max_history_messages: int = Field(default=50, ge=0, le=200, description="Max messages to load per conversation")
    system_prompt_extra: Optional[str] = Field(None, max_length=2000, description="Custom instructions")

    @field_validator("credential_id")
    @classmethod
    def validate_credential_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Invalid credential_id format")
        return v


class ChatSettingUpdate(BaseModel):
    """Request model for partial update."""
    provider: Optional[LLMProvider] = None
    credential_id: Optional[str] = Field(None, min_length=1, max_length=100)
    model_id: Optional[str] = Field(None, min_length=1, max_length=100)
    model_name: Optional[str] = Field(None, max_length=200)
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=256, le=32768)
    include_org_context: Optional[bool] = None
    enable_memory: Optional[bool] = None
    max_history_messages: Optional[int] = Field(None, ge=0, le=200)
    system_prompt_extra: Optional[str] = Field(None, max_length=2000)


class ChatSettingResponse(BaseModel):
    """Response model for chat settings."""
    setting_id: str
    org_slug: str
    provider: str
    credential_id: str
    model_id: str
    model_name: Optional[str] = None
    temperature: float
    max_tokens: int
    include_org_context: bool
    enable_memory: bool
    max_history_messages: int
    system_prompt_extra: Optional[str] = None
    is_active: bool
    configured_by: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


# ============================================
# Helper: BigQuery table reference
# ============================================

def _settings_table() -> str:
    return f"{settings.gcp_project_id}.organizations.org_chat_settings"


def _credentials_table() -> str:
    return f"{settings.gcp_project_id}.organizations.org_integration_credentials"


# ============================================
# Endpoints
# ============================================

@router.get(
    "/chat-settings/{org_slug}",
    response_model=Optional[ChatSettingResponse],
    summary="Get active chat settings",
    description="Get the active AI chat configuration for an organization.",
)
async def get_chat_settings(
    org_slug: str = Path(..., description="Organization slug"),
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """Get active chat settings for the organization."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    query = f"""
        SELECT setting_id, org_slug, provider, credential_id, model_id,
               model_name, temperature, max_tokens, include_org_context,
               enable_memory, max_history_messages, system_prompt_extra,
               is_active, configured_by,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', updated_at) AS updated_at
        FROM `{_settings_table()}`
        WHERE org_slug = @org_slug AND is_active = TRUE
        LIMIT 1
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    results = list(bq_client.query(query, parameters=params))
    if not results:
        return None

    row = dict(results[0])
    return ChatSettingResponse(**row)


@router.post(
    "/chat-settings/{org_slug}",
    response_model=ChatSettingResponse,
    status_code=201,
    summary="Create or update chat settings",
    description="Create or update AI chat settings for an organization. Deactivates any previous active settings.",
)
async def upsert_chat_settings(
    org_slug: str = Path(..., description="Organization slug"),
    body: ChatSettingCreate = ...,
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """Create or upsert chat settings. Only one active setting per org."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    # Verify credential exists and belongs to this org
    cred_query = f"""
        SELECT credential_id, provider, validation_status
        FROM `{_credentials_table()}`
        WHERE org_slug = @org_slug AND credential_id = @credential_id AND is_active = TRUE
        LIMIT 1
    """
    cred_params = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("credential_id", "STRING", body.credential_id),
    ]
    cred_results = list(bq_client.query(cred_query, parameters=cred_params))
    if not cred_results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credential '{body.credential_id}' not found for this organization. Set up the integration first.",
        )

    cred_row = dict(cred_results[0])
    if cred_row.get("validation_status") != "VALID":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Credential is not valid. Please re-configure the integration.",
        )

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f UTC")

    # Deactivate existing active settings
    deactivate_query = f"""
        UPDATE `{_settings_table()}`
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug AND is_active = TRUE
    """
    deactivate_params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    try:
        bq_client.query(deactivate_query, parameters=deactivate_params).result()
    except Exception as e:
        logger.warning(f"Deactivate previous settings (may be first time): {e}")

    # Insert new active setting
    setting_id = f"cs_{uuid.uuid4().hex[:16]}"
    user_id = current_org.get("user_id", "system")

    row = {
        "setting_id": setting_id,
        "org_slug": org_slug,
        "provider": body.provider.value,
        "credential_id": body.credential_id,
        "model_id": body.model_id,
        "model_name": body.model_name or body.model_id,
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
        "include_org_context": body.include_org_context,
        "enable_memory": body.enable_memory,
        "max_history_messages": body.max_history_messages,
        "system_prompt_extra": body.system_prompt_extra,
        "is_active": True,
        "configured_by": user_id,
        "created_at": now,
        "updated_at": None,
    }

    table_ref = _settings_table()
    errors = bq_client.insert_rows_json(table_ref, [row])
    if errors:
        logger.error(f"BigQuery insert error: {errors}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save chat settings.",
        )

    logger.info(f"Chat settings created: {setting_id} for {org_slug} ({body.provider.value}/{body.model_id})")

    return ChatSettingResponse(
        setting_id=setting_id,
        org_slug=org_slug,
        provider=body.provider.value,
        credential_id=body.credential_id,
        model_id=body.model_id,
        model_name=body.model_name or body.model_id,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        include_org_context=body.include_org_context,
        enable_memory=body.enable_memory,
        max_history_messages=body.max_history_messages,
        system_prompt_extra=body.system_prompt_extra,
        is_active=True,
        configured_by=user_id,
        created_at=now,
        updated_at=None,
    )


@router.put(
    "/chat-settings/{org_slug}/{setting_id}",
    response_model=ChatSettingResponse,
    summary="Update chat settings",
    description="Update specific fields of an existing chat setting.",
)
async def update_chat_settings(
    org_slug: str = Path(..., description="Organization slug"),
    setting_id: str = Path(..., description="Setting ID"),
    body: ChatSettingUpdate = ...,
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """Update specific chat setting fields."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    # Build SET clause from provided fields
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update.",
        )

    # If credential_id is being changed, validate it
    if "credential_id" in updates:
        cred_query = f"""
            SELECT credential_id, validation_status
            FROM `{_credentials_table()}`
            WHERE org_slug = @org_slug AND credential_id = @credential_id AND is_active = TRUE
            LIMIT 1
        """
        cred_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("credential_id", "STRING", updates["credential_id"]),
        ]
        cred_results = list(bq_client.query(cred_query, parameters=cred_params))
        if not cred_results:
            raise HTTPException(status_code=404, detail="Credential not found for this organization.")

    # Convert enum to string if present
    if "provider" in updates and isinstance(updates["provider"], LLMProvider):
        updates["provider"] = updates["provider"].value

    set_clauses = []
    params = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("setting_id", "STRING", setting_id),
    ]

    for field_name, value in updates.items():
        set_clauses.append(f"{field_name} = @{field_name}")
        if isinstance(value, bool):
            params.append(bigquery.ScalarQueryParameter(field_name, "BOOL", value))
        elif isinstance(value, int):
            params.append(bigquery.ScalarQueryParameter(field_name, "INT64", value))
        elif isinstance(value, float):
            params.append(bigquery.ScalarQueryParameter(field_name, "FLOAT64", value))
        else:
            params.append(bigquery.ScalarQueryParameter(field_name, "STRING", str(value)))

    set_clauses.append("updated_at = CURRENT_TIMESTAMP()")

    update_query = f"""
        UPDATE `{_settings_table()}`
        SET {', '.join(set_clauses)}
        WHERE org_slug = @org_slug AND setting_id = @setting_id
    """

    bq_client.query(update_query, parameters=params).result()

    # Fetch updated record
    fetch_query = f"""
        SELECT setting_id, org_slug, provider, credential_id, model_id,
               model_name, temperature, max_tokens, include_org_context,
               enable_memory, max_history_messages, system_prompt_extra,
               is_active, configured_by,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', updated_at) AS updated_at
        FROM `{_settings_table()}`
        WHERE org_slug = @org_slug AND setting_id = @setting_id
        LIMIT 1
    """
    fetch_params = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("setting_id", "STRING", setting_id),
    ]
    results = list(bq_client.query(fetch_query, parameters=fetch_params))
    if not results:
        raise HTTPException(status_code=404, detail="Setting not found.")

    return ChatSettingResponse(**dict(results[0]))


@router.delete(
    "/chat-settings/{org_slug}/{setting_id}",
    status_code=204,
    summary="Delete chat settings",
    description="Delete a chat setting. If deleting the active setting, chat will be unconfigured.",
)
async def delete_chat_settings(
    org_slug: str = Path(..., description="Organization slug"),
    setting_id: str = Path(..., description="Setting ID"),
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """Delete a chat setting."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    delete_query = f"""
        DELETE FROM `{_settings_table()}`
        WHERE org_slug = @org_slug AND setting_id = @setting_id
    """
    params = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("setting_id", "STRING", setting_id),
    ]

    result = bq_client.query(delete_query, parameters=params).result()

    if result.num_dml_affected_rows == 0:
        raise HTTPException(status_code=404, detail="Setting not found.")

    logger.info(f"Chat setting deleted: {setting_id} for {org_slug}")


@router.get(
    "/chat-settings/{org_slug}/providers",
    summary="List available LLM providers and models",
    description="Returns the list of supported providers and their available models.",
)
async def list_providers(
    org_slug: str = Path(..., description="Organization slug"),
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """List available providers and their models, with credential status."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    # Get existing credentials for this org
    cred_query = f"""
        SELECT credential_id, provider, validation_status, created_at
        FROM `{_credentials_table()}`
        WHERE org_slug = @org_slug AND is_active = TRUE AND validation_status = 'VALID'
    """
    cred_params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
    cred_results = list(bq_client.query(cred_query, parameters=cred_params))

    # Map provider → credential_id
    provider_creds = {}
    for row in cred_results:
        row_dict = dict(row)
        provider_key = row_dict.get("provider", "").upper()
        if provider_key not in provider_creds:
            provider_creds[provider_key] = row_dict.get("credential_id")

    providers = []
    for provider_enum in LLMProvider:
        provider_name = provider_enum.value
        providers.append({
            "provider": provider_name,
            "models": DEFAULT_MODELS.get(provider_name, []),
            "has_credential": provider_name in provider_creds,
            "credential_id": provider_creds.get(provider_name),
        })

    return {"org_slug": org_slug, "providers": providers}


@router.post(
    "/chat-settings/{org_slug}/validate-key",
    summary="Validate an LLM API key",
    description="Test if the API key works with the selected provider and model.",
)
async def validate_llm_key(
    org_slug: str = Path(..., description="Organization slug"),
    body: ChatSettingCreate = ...,
    current_org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """Validate that the credential works with the selected provider/model."""
    validate_org_slug(org_slug)
    check_org_access(current_org, org_slug)

    # Verify credential exists
    cred_query = f"""
        SELECT credential_id, validation_status
        FROM `{_credentials_table()}`
        WHERE org_slug = @org_slug AND credential_id = @credential_id AND is_active = TRUE
        LIMIT 1
    """
    cred_params = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("credential_id", "STRING", body.credential_id),
    ]
    cred_results = list(bq_client.query(cred_query, parameters=cred_params))
    if not cred_results:
        return {
            "valid": False,
            "error": "Credential not found. Set up the integration first.",
        }

    cred_row = dict(cred_results[0])
    if cred_row.get("validation_status") != "VALID":
        return {
            "valid": False,
            "error": "Credential is not valid.",
        }

    return {
        "valid": True,
        "provider": body.provider.value,
        "model_id": body.model_id,
        "credential_id": body.credential_id,
        "message": "Credential is active and ready for use.",
    }
