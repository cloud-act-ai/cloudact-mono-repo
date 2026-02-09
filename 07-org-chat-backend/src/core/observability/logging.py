"""
Structured logging setup for CloudAct Chat Backend.
JSON format in production, human-readable in development.
"""

import logging
import sys
import json
from datetime import datetime, timezone

from src.app.config import get_settings


class JSONFormatter(logging.Formatter):
    """JSON log formatter for production (Cloud Run / Cloud Logging)."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "org_slug"):
            log_entry["org_slug"] = record.org_slug
        if hasattr(record, "user_id"):
            log_entry["user_id"] = record.user_id
        if hasattr(record, "conversation_id"):
            log_entry["conversation_id"] = record.conversation_id
        return json.dumps(log_entry)


def setup_logging() -> None:
    """Configure logging based on environment."""
    settings = get_settings()

    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Clear existing handlers
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if settings.environment == "production":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s — %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    root.addHandler(handler)

    # Silence noisy libraries
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("litellm").setLevel(logging.WARNING)
