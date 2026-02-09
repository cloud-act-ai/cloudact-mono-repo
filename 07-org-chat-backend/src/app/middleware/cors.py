"""CORS middleware configuration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.app.config import get_settings


def setup_cors(app: FastAPI) -> None:
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Org-Slug", "X-User-Id"],
    )
