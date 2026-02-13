"""CORS middleware configuration."""

import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.app.config import get_settings


def _parse_origins(raw: str) -> list[str]:
    """Parse CORS_ORIGINS from plain URL, comma-separated, or JSON array."""
    raw = raw.strip()
    if raw.startswith("["):
        return json.loads(raw)
    return [o.strip() for o in raw.split(",") if o.strip()]


def setup_cors(app: FastAPI) -> None:
    settings = get_settings()
    origins = _parse_origins(settings.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Org-Slug", "X-User-Id"],
    )
