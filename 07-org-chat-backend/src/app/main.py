"""
CloudAct Chat Backend — FastAPI + Google ADK.

Endpoints:
- POST /copilotkit    → AG-UI endpoint (CopilotKit Runtime connects here)
- GET  /health        → Health check
- POST /api/v1/chat/{org_slug}/send    → Direct chat API (non-CopilotKit)
- GET  /api/v1/chat/{org_slug}/conversations → List conversations
- GET  /.well-known/agent.json → A2A agent discovery
"""

import re
import json
import time
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from src.app.config import get_settings
from src.app.dependencies.auth import get_chat_context, ChatContext
from src.app.middleware.cors import setup_cors
from src.app.middleware.logging import RequestLoggingMiddleware
from src.core.agents import create_agent_for_org
from src.core.sessions.bq_session_store import (
    load_chat_settings,
    load_encrypted_credential,
    load_message_history,
    create_conversation,
    list_conversations,
    persist_message,
)
from src.core.security.kms_decryption import decrypt_value, decrypt_value_base64
from src.core.observability.logging import setup_logging
from src.a2a.agent_card import get_agent_card

logger = logging.getLogger(__name__)

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")


def _validate_path_org_slug(org_slug: str) -> None:
    """Validate org_slug from URL path before any processing."""
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise HTTPException(
            status_code=400,
            detail="Invalid org_slug format. Must be 3-50 lowercase alphanumeric characters with underscores.",
        )


# ADK session service — in-memory for fast access, BQ for persistence
session_service = InMemorySessionService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} v{settings.app_version} on port {settings.api_port}")
    yield
    logger.info("Shutting down chat backend")


app = FastAPI(
    title="CloudAct Chat Backend",
    version="1.0.0",
    lifespan=lifespan,
)

setup_cors(app)
app.add_middleware(RequestLoggingMiddleware)


# ============================================
# Health
# ============================================

@app.get("/health")
async def health():
    settings = get_settings()
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
    }


# ============================================
# Chat API (direct, non-CopilotKit)
# ============================================

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    response: str
    agent_name: Optional[str] = None
    model_id: Optional[str] = None
    latency_ms: int = 0


@app.post("/api/v1/chat/{org_slug}/send", response_model=ChatResponse)
async def send_message(
    org_slug: str,
    request: ChatRequest,
    ctx: ChatContext = Depends(get_chat_context),
):
    """
    Send a message and get a response.
    This is the full lifecycle per the architecture flow:
    1. Load settings → 2. Decrypt key → 3. Load history → 4. Build agents
    → 5. Execute → 6. Persist → 7. Cleanup
    """
    _validate_path_org_slug(org_slug)
    start_time = time.time()

    # Verify org matches
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    # STEP 1: Load chat settings
    chat_settings = load_chat_settings(org_slug)
    if not chat_settings:
        return JSONResponse(
            status_code=422,
            content={"status": "setup_required", "message": "Chat not configured. Set up AI Chat in settings."},
        )

    # STEP 2: Decrypt LLM credential
    encrypted_cred = load_encrypted_credential(org_slug, chat_settings["credential_id"])
    if not encrypted_cred:
        return JSONResponse(
            status_code=422,
            content={"status": "key_invalid", "message": "API key not found or inactive. Update in settings."},
        )

    try:
        # BigQuery BYTES column returns raw bytes; base64-encoded strings need decoding
        if isinstance(encrypted_cred, bytes):
            api_key = decrypt_value(encrypted_cred)
        else:
            api_key = decrypt_value_base64(encrypted_cred)
    except Exception as e:
        logger.error(f"KMS decryption failed for {org_slug}: {e}")
        return JSONResponse(
            status_code=422,
            content={"status": "key_invalid", "message": "Failed to decrypt API key. Please re-configure."},
        )

    # STEP 3: Load conversation history
    conversation_id = request.conversation_id
    if not conversation_id:
        conversation_id = create_conversation(
            org_slug=org_slug,
            user_id=ctx.user_id,
            provider=chat_settings["provider"],
            model_id=chat_settings["model_id"],
        )

    history = load_message_history(
        org_slug=org_slug,
        conversation_id=conversation_id,
        max_messages=chat_settings.get("max_history_messages", 50),
    )

    # STEP 4: Build ADK agent hierarchy
    agent = create_agent_for_org(
        org_slug=org_slug,
        provider=chat_settings["provider"],
        model_id=chat_settings["model_id"],
        api_key=api_key,
        temperature=chat_settings.get("temperature", 0.7),
        max_tokens=chat_settings.get("max_tokens", 4096),
    )

    runner = Runner(
        agent=agent,
        app_name="cloudact_chat",
        session_service=session_service,
    )

    # Get existing ADK session or create new one
    session = await session_service.get_session(
        app_name="cloudact_chat",
        user_id=ctx.user_id,
        session_id=conversation_id,
    )
    if not session:
        session = await session_service.create_session(
            app_name="cloudact_chat",
            user_id=ctx.user_id,
            session_id=conversation_id,
        )

    # STEP 5: Execute agent
    user_content = types.Content(
        role="user",
        parts=[types.Part(text=request.message)],
    )

    response_text = ""
    agent_name = None

    async for event in runner.run_async(
        user_id=ctx.user_id,
        session_id=conversation_id,
        new_message=user_content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            response_text = event.content.parts[0].text
            agent_name = event.author

    latency_ms = int((time.time() - start_time) * 1000)

    # STEP 6: Persist messages (async, non-blocking)
    persist_message(
        org_slug=org_slug,
        conversation_id=conversation_id,
        role="user",
        content=request.message,
    )
    persist_message(
        org_slug=org_slug,
        conversation_id=conversation_id,
        role="assistant",
        content=response_text,
        agent_name=agent_name,
        model_id=chat_settings["model_id"],
        latency_ms=latency_ms,
    )

    # STEP 7: Cleanup
    del api_key

    return ChatResponse(
        conversation_id=conversation_id,
        response=response_text,
        agent_name=agent_name,
        model_id=chat_settings["model_id"],
        latency_ms=latency_ms,
    )


# ============================================
# Conversations API
# ============================================

@app.get("/api/v1/chat/{org_slug}/conversations")
async def get_conversations(
    org_slug: str,
    ctx: ChatContext = Depends(get_chat_context),
):
    """List conversations for the authenticated user."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    conversations = list_conversations(org_slug, ctx.user_id)
    return {"org_slug": org_slug, "conversations": conversations}


@app.get("/api/v1/chat/{org_slug}/conversations/{conversation_id}/messages")
async def get_messages(
    org_slug: str,
    conversation_id: str,
    ctx: ChatContext = Depends(get_chat_context),
):
    """Load message history for a conversation."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    messages = load_message_history(org_slug, conversation_id)
    return {"org_slug": org_slug, "conversation_id": conversation_id, "messages": messages}


@app.get("/api/v1/chat/{org_slug}/settings/status")
async def chat_settings_status(
    org_slug: str,
    ctx: ChatContext = Depends(get_chat_context),
):
    """Check if chat is configured for the org."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    settings = load_chat_settings(org_slug)
    if not settings:
        return {"configured": False, "status": "setup_required"}

    return {
        "configured": True,
        "provider": settings["provider"],
        "model_id": settings["model_id"],
    }


# ============================================
# A2A Agent Discovery
# ============================================

@app.get("/.well-known/agent.json")
async def agent_card():
    """A2A agent card for external agent discovery."""
    return get_agent_card()
