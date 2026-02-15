"""
Supabase Client Utility

Provides a singleton Supabase client for database operations.
Used for quota enforcement instead of BigQuery.
"""

import logging
from typing import Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Get or create the Supabase client singleton.

    Reads configuration from Settings (which loads .env.local via pydantic-settings).

    Returns:
        Supabase Client instance

    Raises:
        ValueError: If required settings are missing
    """
    global _client

    if _client is None:
        from src.app.config import get_settings
        settings = get_settings()

        url = settings.supabase_url
        key = settings.supabase_service_role_key

        if not url:
            raise ValueError("Missing SUPABASE_URL environment variable")
        if not key:
            raise ValueError("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")

        _client = create_client(url, key)
        logger.info("Supabase client initialized successfully")

    return _client


def reset_supabase_client() -> None:
    """
    Reset the Supabase client singleton.

    Useful for testing or when credentials change.
    """
    global _client
    _client = None
    logger.info("Supabase client reset")
