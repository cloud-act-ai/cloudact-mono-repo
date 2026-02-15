"""
CloudAct Chat Backend — FastAPI + Google ADK.

Endpoints:
- POST /copilotkit    → AG-UI endpoint (CopilotKit Runtime connects here)
- GET  /health        → Health check
- POST /api/v1/chat/{org_slug}/send    → Direct chat API (non-CopilotKit)
- POST /api/v1/chat/{org_slug}/stream  → SSE streaming chat
- GET  /api/v1/chat/{org_slug}/conversations → List conversations
- GET  /.well-known/agent.json → A2A agent discovery
"""

import re
import json
import time
import uuid
import asyncio
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
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
    get_conversation,
    list_conversations,
    delete_conversation,
    persist_message,
    rename_conversation,
    search_messages,
    auto_title_conversation,
    generate_title_from_message,
)
from src.core.security.kms_decryption import decrypt_value, decrypt_value_base64
from src.core.observability.logging import setup_logging
from src.a2a.agent_card import get_agent_card

logger = logging.getLogger(__name__)

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")

# Agent execution timeout (seconds)
_AGENT_TIMEOUT_SECONDS = 60

# Simple in-memory rate limiter: {org_slug:user_id -> [timestamps]}
_rate_limit_window: Dict[str, List[float]] = defaultdict(list)
_RATE_LIMIT_MAX = 15  # max requests per window
_RATE_LIMIT_WINDOW_SECONDS = 60


def _validate_path_org_slug(org_slug: str) -> None:
    """Validate org_slug from URL path before any processing."""
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise HTTPException(
            status_code=400,
            detail="Invalid org_slug format. Must be 3-50 lowercase alphanumeric characters with underscores.",
        )


_RATE_LIMIT_MAX_KEYS = 10000  # Evict stale keys if dict grows too large


def _check_rate_limit(org_slug: str, user_id: str) -> None:
    """Simple in-memory per-org-user rate limiter."""
    key = f"{org_slug}:{user_id}"
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    # Evict stale keys if dict grows too large
    if len(_rate_limit_window) > _RATE_LIMIT_MAX_KEYS:
        stale = [k for k, v in _rate_limit_window.items() if not v or v[-1] < window_start]
        for k in stale:
            del _rate_limit_window[k]

    # Clean old entries
    _rate_limit_window[key] = [t for t in _rate_limit_window[key] if t > window_start]

    if len(_rate_limit_window[key]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {_RATE_LIMIT_MAX} messages per minute.",
        )

    _rate_limit_window[key].append(now)


async def _run_agent(
    runner: Runner, user_id: str, session_id: str, content
) -> Tuple[str, Optional[str], Optional[int], Optional[int]]:
    """Run agent and extract final response. Returns (response_text, agent_name, input_tokens, output_tokens)."""
    response_text = ""
    agent_name = None
    input_tokens = None  # type: Optional[int]
    output_tokens = None  # type: Optional[int]
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=content,
    ):
        # Try to extract token usage from event metadata
        if hasattr(event, "usage_metadata"):
            um = event.usage_metadata
            if hasattr(um, "prompt_token_count") and um.prompt_token_count is not None:
                input_tokens = um.prompt_token_count
            if hasattr(um, "candidates_token_count") and um.candidates_token_count is not None:
                output_tokens = um.candidates_token_count
        if event.is_final_response() and event.content and event.content.parts:
            response_text = event.content.parts[0].text
            agent_name = event.author
    return response_text, agent_name, input_tokens, output_tokens


async def _run_agent_with_retry(
    runner: Runner, user_id: str, session_id: str, content, max_retries: int = 2
) -> Tuple[str, Optional[str], Optional[int], Optional[int]]:
    """Run agent with retry on rate limit errors."""
    for attempt in range(max_retries + 1):
        try:
            return await _run_agent(runner, user_id, session_id, content)
        except Exception as e:
            error_str = str(e).lower()
            if ("rate" in error_str or "429" in error_str) and attempt < max_retries:
                wait_time = (attempt + 1) * 2  # 2s, 4s
                logger.warning(f"Rate limited, retrying in {wait_time}s (attempt {attempt + 1})")
                await asyncio.sleep(wait_time)
                continue
            raise
    # Should not reach here, but satisfy type checker
    return "", None, None, None


async def _stream_agent(
    runner: Runner, user_id: str, session_id: str, content
) -> AsyncGenerator[Tuple[str, str, Optional[str], Optional[int], Optional[int]], None]:
    """
    Stream agent response. Yields tuples of:
    (event_type, data_text, agent_name, input_tokens, output_tokens)

    event_type is "token" for text chunks.
    The final yield has the accumulated agent_name and token counts.
    """
    agent_name = None  # type: Optional[str]
    input_tokens = None  # type: Optional[int]
    output_tokens = None  # type: Optional[int]
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=content,
    ):
        # Try to extract token usage from event metadata
        if hasattr(event, "usage_metadata"):
            um = event.usage_metadata
            if hasattr(um, "prompt_token_count") and um.prompt_token_count is not None:
                input_tokens = um.prompt_token_count
            if hasattr(um, "candidates_token_count") and um.candidates_token_count is not None:
                output_tokens = um.candidates_token_count
        if event.is_final_response() and event.content and event.content.parts:
            text = event.content.parts[0].text
            agent_name = event.author
            yield ("token", text, agent_name, input_tokens, output_tokens)


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


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)


# ============================================
# Health
# ============================================

@app.get("/health")
async def health():
    settings = get_settings()

    # Check BigQuery connectivity
    try:
        from src.core.engine.bigquery import get_bq_client
        client = get_bq_client()
        client.query("SELECT 1").result()
        bq_status = "connected"
    except Exception as e:
        logger.warning(f"Health check: BigQuery unavailable: {e}")
        bq_status = "unavailable"

    status = "healthy" if bq_status == "connected" else "degraded"
    return {
        "status": status,
        "service": settings.app_name,
        "version": settings.app_version,
        "release": settings.release_version,
        "release_timestamp": settings.release_timestamp,
        "environment": settings.environment,
        "bigquery": bq_status,
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

    # Rate limit check
    _check_rate_limit(org_slug, ctx.user_id)

    # STEP 1: Load chat settings
    chat_settings = load_chat_settings(org_slug)
    if not chat_settings:
        return JSONResponse(
            status_code=422,
            content={"status": "setup_required", "message": "Chat not configured. Set up AI Chat in settings."},
        )

    # STEP 2: Decrypt LLM credential
    api_key = None
    try:
        encrypted_cred = load_encrypted_credential(org_slug, chat_settings["credential_id"])
        if not encrypted_cred:
            return JSONResponse(
                status_code=422,
                content={"status": "key_invalid", "message": "API key not found or inactive. Update in settings."},
            )

        # BigQuery BYTES column returns raw bytes; base64-encoded strings need decoding
        if isinstance(encrypted_cred, bytes):
            api_key = decrypt_value(encrypted_cred)
        else:
            api_key = decrypt_value_base64(encrypted_cred)
    except Exception as e:
        logger.error(f"KMS decryption failed for {org_slug}: {e}")
        # Dev-mode fallback: use provider API key from environment
        settings = get_settings()
        if settings.disable_auth and settings.environment in ("development", "local", "test"):
            import os
            env_key_map = {
                "OPENAI": "OPENAI_API_KEY",
                "ANTHROPIC": "ANTHROPIC_API_KEY",
                "GEMINI": "GOOGLE_API_KEY",
                "DEEPSEEK": "DEEPSEEK_API_KEY",
            }
            env_var = env_key_map.get(chat_settings["provider"].upper(), "")
            api_key = os.environ.get(env_var, "") if env_var else ""
            if api_key:
                logger.warning("Dev fallback: using %s from environment for %s", env_var, org_slug)
            else:
                return JSONResponse(
                    status_code=422,
                    content={"status": "key_invalid", "message": f"KMS decrypt failed and {env_var} not set. Set it in environment."},
                )
        else:
            return JSONResponse(
                status_code=422,
                content={"status": "key_invalid", "message": "Failed to decrypt API key. Please re-configure."},
            )

    try:
        # STEP 3: Load conversation history
        conversation_id = request.conversation_id
        is_new_conversation = False
        if not conversation_id:
            conversation_id = create_conversation(
                org_slug=org_slug,
                user_id=ctx.user_id,
                provider=chat_settings["provider"],
                model_id=chat_settings["model_id"],
                title=generate_title_from_message(request.message),
            )
            is_new_conversation = True
        else:
            # Verify conversation ownership
            conv = get_conversation(org_slug, conversation_id)
            if conv and conv.get("user_id") and conv["user_id"] != ctx.user_id:
                raise HTTPException(status_code=403, detail="Not authorized to access this conversation")

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

        # STEP 5: Execute agent with timeout
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=request.message)],
        )

        response_text = ""
        agent_name = None
        input_tokens = None  # type: Optional[int]
        output_tokens = None  # type: Optional[int]

        try:
            agent_task = _run_agent_with_retry(runner, ctx.user_id, conversation_id, user_content)
            response_text, agent_name, input_tokens, output_tokens = await asyncio.wait_for(
                agent_task, timeout=_AGENT_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            logger.error(f"Agent execution timeout ({_AGENT_TIMEOUT_SECONDS}s) for {org_slug}")
            response_text = "Request timed out. Please try again with a simpler or more specific question."
        except Exception as e:
            logger.error(f"Agent execution error for {org_slug}: {e}")
            response_text = f"I encountered an error while processing your request. Please try rephrasing your question. (Error: {type(e).__name__})"

        latency_ms = int((time.time() - start_time) * 1000)

        # STEP 6: Persist messages (wrap in try/except to avoid losing the response)
        try:
            persist_message(
                org_slug=org_slug,
                conversation_id=conversation_id,
                role="user",
                content=request.message,
            )
        except Exception as e:
            logger.error(f"Failed to persist user message for {org_slug}: {e}")

        try:
            persist_message(
                org_slug=org_slug,
                conversation_id=conversation_id,
                role="assistant",
                content=response_text,
                agent_name=agent_name,
                model_id=chat_settings["model_id"],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
            )
        except Exception as e:
            logger.error(f"Failed to persist assistant message for {org_slug}: {e}")

        return ChatResponse(
            conversation_id=conversation_id,
            response=response_text,
            agent_name=agent_name,
            model_id=chat_settings["model_id"],
            latency_ms=latency_ms,
        )

    finally:
        # STEP 7: Cleanup — always runs, even on exceptions
        if api_key:
            del api_key


# ============================================
# Streaming Chat API (SSE)
# ============================================

@app.post("/api/v1/chat/{org_slug}/stream")
async def stream_message(
    org_slug: str,
    request: ChatRequest,
    ctx: ChatContext = Depends(get_chat_context),
):
    """
    Send a message and stream the response as Server-Sent Events.
    SSE event types:
    - token: {"text": "..."} — streamed text chunk
    - done:  {"conversation_id": "...", "agent_name": "...", "model_id": "...", "latency_ms": ...}
    - error: {"message": "..."}
    """
    _validate_path_org_slug(org_slug)
    start_time = time.time()

    # Verify org matches
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    # Rate limit check
    _check_rate_limit(org_slug, ctx.user_id)

    # STEP 1: Load chat settings
    chat_settings = load_chat_settings(org_slug)
    if not chat_settings:
        return JSONResponse(
            status_code=422,
            content={"status": "setup_required", "message": "Chat not configured. Set up AI Chat in settings."},
        )

    # STEP 2: Decrypt LLM credential
    api_key = None
    try:
        encrypted_cred = load_encrypted_credential(org_slug, chat_settings["credential_id"])
        if not encrypted_cred:
            return JSONResponse(
                status_code=422,
                content={"status": "key_invalid", "message": "API key not found or inactive. Update in settings."},
            )

        if isinstance(encrypted_cred, bytes):
            api_key = decrypt_value(encrypted_cred)
        else:
            api_key = decrypt_value_base64(encrypted_cred)
    except Exception as e:
        logger.error(f"KMS decryption failed for {org_slug}: {e}")
        settings = get_settings()
        if settings.disable_auth and settings.environment in ("development", "local", "test"):
            import os
            env_key_map = {
                "OPENAI": "OPENAI_API_KEY",
                "ANTHROPIC": "ANTHROPIC_API_KEY",
                "GEMINI": "GOOGLE_API_KEY",
                "DEEPSEEK": "DEEPSEEK_API_KEY",
            }
            env_var = env_key_map.get(chat_settings["provider"].upper(), "")
            api_key = os.environ.get(env_var, "") if env_var else ""
            if api_key:
                logger.warning("Dev fallback: using %s from environment for %s", env_var, org_slug)
            else:
                return JSONResponse(
                    status_code=422,
                    content={"status": "key_invalid", "message": f"KMS decrypt failed and {env_var} not set."},
                )
        else:
            return JSONResponse(
                status_code=422,
                content={"status": "key_invalid", "message": "Failed to decrypt API key. Please re-configure."},
            )

    # Capture variables needed by the generator
    captured_api_key = api_key
    captured_chat_settings = chat_settings

    async def event_generator() -> AsyncGenerator[str, None]:
        local_api_key = captured_api_key
        try:
            # STEP 3: Load conversation history
            conversation_id = request.conversation_id
            if not conversation_id:
                conversation_id = create_conversation(
                    org_slug=org_slug,
                    user_id=ctx.user_id,
                    provider=captured_chat_settings["provider"],
                    model_id=captured_chat_settings["model_id"],
                    title=generate_title_from_message(request.message),
                )
            else:
                conv = get_conversation(org_slug, conversation_id)
                if conv and conv.get("user_id") and conv["user_id"] != ctx.user_id:
                    yield f"event: error\ndata: {json.dumps({'message': 'Not authorized to access this conversation'})}\n\n"
                    return

            load_message_history(
                org_slug=org_slug,
                conversation_id=conversation_id,
                max_messages=captured_chat_settings.get("max_history_messages", 50),
            )

            # STEP 4: Build ADK agent hierarchy
            agent = create_agent_for_org(
                org_slug=org_slug,
                provider=captured_chat_settings["provider"],
                model_id=captured_chat_settings["model_id"],
                api_key=local_api_key,
                temperature=captured_chat_settings.get("temperature", 0.7),
                max_tokens=captured_chat_settings.get("max_tokens", 4096),
            )

            runner = Runner(
                agent=agent,
                app_name="cloudact_chat",
                session_service=session_service,
            )

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

            # STEP 5: Stream agent response
            user_content = types.Content(
                role="user",
                parts=[types.Part(text=request.message)],
            )

            full_response = ""
            agent_name = None  # type: Optional[str]
            input_tokens = None  # type: Optional[int]
            output_tokens = None  # type: Optional[int]

            try:
                async for event_type, text, evt_agent, evt_in_tok, evt_out_tok in _stream_agent(
                    runner, ctx.user_id, conversation_id, user_content
                ):
                    if event_type == "token" and text:
                        full_response += text
                        agent_name = evt_agent
                        input_tokens = evt_in_tok
                        output_tokens = evt_out_tok
                        yield f"event: token\ndata: {json.dumps({'text': text})}\n\n"
            except asyncio.TimeoutError:
                logger.error(f"Agent stream timeout for {org_slug}")
                yield f"event: error\ndata: {json.dumps({'message': 'Request timed out.'})}\n\n"
                return
            except Exception as e:
                logger.error(f"Agent stream error for {org_slug}: {e}")
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                return

            latency_ms = int((time.time() - start_time) * 1000)

            # STEP 6: Persist messages
            try:
                persist_message(
                    org_slug=org_slug,
                    conversation_id=conversation_id,
                    role="user",
                    content=request.message,
                )
            except Exception as e:
                logger.error(f"Failed to persist user message for {org_slug}: {e}")

            try:
                persist_message(
                    org_slug=org_slug,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    agent_name=agent_name,
                    model_id=captured_chat_settings["model_id"],
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                )
            except Exception as e:
                logger.error(f"Failed to persist assistant message for {org_slug}: {e}")

            # Send done event
            yield f"event: done\ndata: {json.dumps({'conversation_id': conversation_id, 'agent_name': agent_name, 'model_id': captured_chat_settings['model_id'], 'latency_ms': latency_ms})}\n\n"

        except Exception as e:
            logger.error(f"Stream error for {org_slug}: {e}")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        finally:
            # STEP 7: Cleanup
            if local_api_key:
                del local_api_key

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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

    # Verify conversation ownership
    conv = get_conversation(org_slug, conversation_id)
    if conv and conv.get("user_id") and conv["user_id"] != ctx.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this conversation")

    messages = load_message_history(org_slug, conversation_id)
    return {"org_slug": org_slug, "conversation_id": conversation_id, "messages": messages}


@app.delete("/api/v1/chat/{org_slug}/conversations/{conversation_id}")
async def remove_conversation(
    org_slug: str,
    conversation_id: str,
    ctx: ChatContext = Depends(get_chat_context),
):
    """Soft-delete a conversation (sets status='deleted')."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    # Verify conversation ownership
    conv = get_conversation(org_slug, conversation_id)
    if conv and conv.get("user_id") and conv["user_id"] != ctx.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this conversation")

    deleted = delete_conversation(org_slug, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found or still in buffer")

    return {"status": "deleted", "conversation_id": conversation_id}


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
# Rename / Search
# ============================================


class RenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


@app.patch("/api/v1/chat/{org_slug}/conversations/{conversation_id}/rename")
async def rename_conv(
    org_slug: str,
    conversation_id: str,
    request: RenameRequest,
    ctx: ChatContext = Depends(get_chat_context),
):
    """Rename a conversation."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    conv = get_conversation(org_slug, conversation_id)
    if conv and conv.get("user_id") and conv["user_id"] != ctx.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    renamed = rename_conversation(org_slug, conversation_id, request.title)
    if not renamed:
        raise HTTPException(status_code=400, detail="Failed to rename")

    return {"status": "renamed", "conversation_id": conversation_id, "title": request.title}


@app.get("/api/v1/chat/{org_slug}/messages/search")
async def search_msgs(
    org_slug: str,
    q: str = "",
    ctx: ChatContext = Depends(get_chat_context),
):
    """Search messages across conversations."""
    _validate_path_org_slug(org_slug)
    if ctx.org_slug != org_slug:
        raise HTTPException(status_code=403, detail="Org mismatch")

    if not q.strip():
        return {"results": []}

    results = search_messages(org_slug, ctx.user_id, q)
    return {"results": results}


# ============================================
# A2A Agent Discovery
# ============================================

@app.get("/.well-known/agent.json")
async def agent_card():
    """A2A agent card for external agent discovery."""
    return get_agent_card()
