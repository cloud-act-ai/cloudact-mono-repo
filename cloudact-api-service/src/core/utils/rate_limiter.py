"""
Rate Limiting Module
Provides organization-aware and global rate limiting for multi-organization systems.
Supports in-memory store for development and Redis for production.
"""

import time
import asyncio
from typing import Dict, Tuple, Optional
from collections import defaultdict
from functools import wraps
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


# ============================================
# Time Constants
# ============================================
SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600

# Rate limit window sizes
MINUTE_WINDOW_SECONDS = SECONDS_PER_MINUTE
HOUR_WINDOW_SECONDS = SECONDS_PER_HOUR

# Entry coalescing threshold (requests within this time window are merged)
ENTRY_COALESCE_SECONDS = 1


class RateLimitStore(ABC):
    """Abstract base class for rate limit storage backends."""

    @abstractmethod
    async def check_and_increment(
        self,
        key: str,
        limit: int,
        window_seconds: int
    ) -> Tuple[bool, Dict]:
        """
        Check if request is within rate limit and increment counter.

        Args:
            key: Rate limit key (e.g., org_slug, endpoint)
            limit: Maximum requests allowed in window
            window_seconds: Time window in seconds

        Returns:
            Tuple of (is_allowed, metadata)
            metadata contains: remaining, reset_time, limit, window
        """
        pass


class InMemoryRateLimitStore(RateLimitStore):
    """
    In-memory rate limit store for development and single-instance deployments.
    Uses sliding window counter algorithm.

    CRITICAL: Not suitable for distributed systems - use Redis for production.
    """

    def __init__(self):
        """Initialize in-memory rate limit store."""
        # Structure: {key: [(timestamp, count), ...]}
        self._store: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check_and_increment(
        self,
        key: str,
        limit: int,
        window_seconds: int
    ) -> Tuple[bool, Dict]:
        """
        Check and increment rate limit using sliding window counter.

        Args:
            key: Rate limit key
            limit: Maximum requests allowed
            window_seconds: Time window in seconds

        Returns:
            Tuple of (is_allowed, metadata)
        """
        async with self._lock:
            now = time.time()
            window_start = now - window_seconds

            # Remove expired entries
            if key in self._store:
                self._store[key] = [
                    (ts, count) for ts, count in self._store[key]
                    if ts > window_start
                ]

            # Count requests in current window
            current_count = sum(count for _, count in self._store[key])

            # Determine if request is allowed
            is_allowed = current_count < limit

            if is_allowed:
                # Increment counter
                if self._store[key]:
                    # Update last entry if within coalesce window to reduce storage
                    last_ts, last_count = self._store[key][-1]
                    if now - last_ts < ENTRY_COALESCE_SECONDS:
                        self._store[key][-1] = (last_ts, last_count + 1)
                    else:
                        self._store[key].append((now, 1))
                else:
                    self._store[key].append((now, 1))
                current_count += 1

            # Calculate metadata
            remaining = max(0, limit - current_count)
            reset_time = int(window_start + window_seconds)

            metadata = {
                "limit": limit,
                "remaining": remaining,
                "reset": reset_time,
                "window_seconds": window_seconds
            }

            return is_allowed, metadata


class RateLimiter:
    """
    Organization-aware and global rate limiter for FastAPI.

    Features:
    - Per-organization rate limiting (identified by org_slug)
    - Global rate limiting for unauthenticated endpoints
    - Configurable limits and time windows
    - In-memory store for development, Redis for production
    - Async-safe with proper locking
    """

    def __init__(
        self,
        store: Optional[RateLimitStore] = None,
        default_limit_per_minute: int = 100,
        default_limit_per_hour: int = 1000,
        global_limit_per_minute: int = 10000,
        global_limit_per_hour: int = 100000
    ):
        """
        Initialize rate limiter.

        Args:
            store: Rate limit store backend (defaults to in-memory)
            default_limit_per_minute: Default per-organization limit per minute
            default_limit_per_hour: Default per-organization limit per hour
            global_limit_per_minute: Global limit per minute (all organizations)
            global_limit_per_hour: Global limit per hour (all organizations)
        """
        self.store = store or InMemoryRateLimitStore()
        self.default_limit_per_minute = default_limit_per_minute
        self.default_limit_per_hour = default_limit_per_hour
        self.global_limit_per_minute = global_limit_per_minute
        self.global_limit_per_hour = global_limit_per_hour

    async def check_org_limit(
        self,
        org_slug: str,
        limit_per_minute: Optional[int] = None,
        limit_per_hour: Optional[int] = None
    ) -> Tuple[bool, Dict]:
        """
        Check if organization is within rate limits.

        Args:
            org_slug: Organization identifier
            limit_per_minute: Per-minute limit (uses default if not provided)
            limit_per_hour: Per-hour limit (uses default if not provided)

        Returns:
            Tuple of (is_allowed, metadata)
            metadata contains: remaining_minute, remaining_hour, reset_minute, reset_hour
        """
        limit_per_minute = limit_per_minute or self.default_limit_per_minute
        limit_per_hour = limit_per_hour or self.default_limit_per_hour

        # Check minute limit
        minute_key = f"org:{org_slug}:minute"
        minute_allowed, minute_meta = await self.store.check_and_increment(
            minute_key, limit_per_minute, MINUTE_WINDOW_SECONDS
        )

        # Check hour limit
        hour_key = f"org:{org_slug}:hour"
        hour_allowed, hour_meta = await self.store.check_and_increment(
            hour_key, limit_per_hour, HOUR_WINDOW_SECONDS
        )

        is_allowed = minute_allowed and hour_allowed

        metadata = {
            "org_slug": org_slug,
            "minute": minute_meta,
            "hour": hour_meta,
            "is_allowed": is_allowed
        }

        return is_allowed, metadata

    async def check_global_limit(
        self,
        endpoint: str,
        limit_per_minute: Optional[int] = None,
        limit_per_hour: Optional[int] = None
    ) -> Tuple[bool, Dict]:
        """
        Check if global rate limit is exceeded.

        Args:
            endpoint: Endpoint identifier (e.g., "admin_orgs")
            limit_per_minute: Per-minute limit (uses global default if not provided)
            limit_per_hour: Per-hour limit (uses global default if not provided)

        Returns:
            Tuple of (is_allowed, metadata)
        """
        limit_per_minute = limit_per_minute or self.global_limit_per_minute
        limit_per_hour = limit_per_hour or self.global_limit_per_hour

        # Check minute limit
        minute_key = f"global:{endpoint}:minute"
        minute_allowed, minute_meta = await self.store.check_and_increment(
            minute_key, limit_per_minute, MINUTE_WINDOW_SECONDS
        )

        # Check hour limit
        hour_key = f"global:{endpoint}:hour"
        hour_allowed, hour_meta = await self.store.check_and_increment(
            hour_key, limit_per_hour, HOUR_WINDOW_SECONDS
        )

        is_allowed = minute_allowed and hour_allowed

        metadata = {
            "endpoint": endpoint,
            "minute": minute_meta,
            "hour": hour_meta,
            "is_allowed": is_allowed
        }

        return is_allowed, metadata


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """
    Get or create global rate limiter instance.

    Returns:
        RateLimiter instance
    """
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def init_rate_limiter(
    default_limit_per_minute: int = 100,
    default_limit_per_hour: int = 1000,
    global_limit_per_minute: int = 10000,
    global_limit_per_hour: int = 100000
) -> RateLimiter:
    """
    Initialize global rate limiter with custom settings.

    Args:
        default_limit_per_minute: Default per-organization limit per minute
        default_limit_per_hour: Default per-organization limit per hour
        global_limit_per_minute: Global limit per minute
        global_limit_per_hour: Global limit per hour

    Returns:
        Configured RateLimiter instance
    """
    global _rate_limiter
    _rate_limiter = RateLimiter(
        default_limit_per_minute=default_limit_per_minute,
        default_limit_per_hour=default_limit_per_hour,
        global_limit_per_minute=global_limit_per_minute,
        global_limit_per_hour=global_limit_per_hour
    )
    logger.info(
        f"Rate limiter initialized: "
        f"{default_limit_per_minute} req/min per organization, "
        f"{default_limit_per_hour} req/hour per organization, "
        f"{global_limit_per_minute} req/min global, "
        f"{global_limit_per_hour} req/hour global"
    )
    return _rate_limiter
