"""
Supabase Client Utility

Provides a singleton Supabase client for quota management operations.
The client uses service role key for server-side operations.

Environment Variables Required:
- SUPABASE_URL: The Supabase project URL
- SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side access
"""

import os
import logging
from typing import Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Get or create a Supabase client singleton.

    Uses service role key for full access to quota tables.

    Returns:
        Supabase Client instance

    Raises:
        ValueError: If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set
    """
    global _client

    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

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
