"""
In-memory caching utility with TTL support.

Provides a simple in-memory cache with time-to-live (TTL) for BigQuery query results.
Can be extended to use Redis for distributed caching in production.

Features:
- TTL-based expiration
- Automatic key generation from function arguments
- Thread-safe operations
- Cache statistics tracking
- Decorator pattern for easy integration
"""

import time
import hashlib
import json
import logging
from typing import Any, Callable, Dict, Optional, Tuple
from functools import wraps
from threading import Lock

logger = logging.getLogger(__name__)


class CacheEntry:
    """A cached value with expiration timestamp."""

    def __init__(self, value: Any, ttl_seconds: int):
        self.value = value
        self.expires_at = time.time() + ttl_seconds

    def is_expired(self) -> bool:
        """Check if this cache entry has expired."""
        return time.time() > self.expires_at


class InMemoryCache:
    """
    Thread-safe in-memory cache with TTL support.

    Usage:
        cache = InMemoryCache()
        cache.set("key", "value", ttl_seconds=300)
        value = cache.get("key")
    """

    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "invalidations": 0
        }

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache.
        Returns None if key doesn't exist or is expired.
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired():
                del self._cache[key]
                self._stats["misses"] += 1
                return None

            self._stats["hits"] += 1
            return entry.value

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        """
        Set a value in cache with TTL.
        Default TTL is 5 minutes (300 seconds).
        """
        with self._lock:
            self._cache[key] = CacheEntry(value, ttl_seconds)
            self._stats["sets"] += 1

    def invalidate(self, key: str) -> None:
        """Remove a specific key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                self._stats["invalidations"] += 1

    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching a pattern.
        Returns number of keys invalidated.

        Example:
            cache.invalidate_pattern("org_acme_")  # Invalidates all keys for org acme
        """
        count = 0
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_delete:
                del self._cache[key]
                count += 1

            if count > 0:
                self._stats["invalidations"] += count

        return count

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._stats["invalidations"] += count

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats["hits"] + self._stats["misses"]
            hit_rate = (self._stats["hits"] / total_requests * 100) if total_requests > 0 else 0

            return {
                **self._stats,
                "total_requests": total_requests,
                "hit_rate_pct": round(hit_rate, 2),
                "cache_size": len(self._cache)
            }

    def cleanup_expired(self) -> int:
        """
        Remove all expired entries from cache.
        Returns number of entries removed.
        """
        count = 0
        with self._lock:
            keys_to_delete = [
                k for k, v in self._cache.items()
                if v.is_expired()
            ]
            for key in keys_to_delete:
                del self._cache[key]
                count += 1

        if count > 0:
            logger.info(f"Cleaned up {count} expired cache entries")

        return count


# Global cache instance
_cache_instance: Optional[InMemoryCache] = None


def get_cache() -> InMemoryCache:
    """Get the global cache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = InMemoryCache()
    return _cache_instance


def generate_cache_key(*args, **kwargs) -> str:
    """
    Generate a cache key from function arguments.

    Creates a deterministic hash of the arguments for use as cache key.
    """
    # Combine args and kwargs into a single dict for consistent hashing
    key_data = {
        "args": args,
        "kwargs": sorted(kwargs.items())  # Sort for deterministic ordering
    }

    # Create JSON representation and hash it
    key_json = json.dumps(key_data, sort_keys=True, default=str)
    key_hash = hashlib.md5(key_json.encode()).hexdigest()

    return key_hash


def cached(
    ttl_seconds: int = 300,
    key_prefix: Optional[str] = None,
    key_generator: Optional[Callable] = None
):
    """
    Decorator to cache function results with TTL.

    Args:
        ttl_seconds: Time-to-live in seconds (default: 300 = 5 minutes)
        key_prefix: Prefix for cache key (default: function name)
        key_generator: Custom function to generate cache key from args/kwargs

    Example:
        @cached(ttl_seconds=300, key_prefix="org_plans")
        async def get_org_plans(org_slug: str):
            # Expensive database query
            return plans

    Cache invalidation:
        # Invalidate specific org
        get_cache().invalidate_pattern(f"org_plans_{org_slug}")

        # Invalidate all cached data
        get_cache().clear()
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            cache = get_cache()

            # Generate cache key
            if key_generator:
                cache_key_suffix = key_generator(*args, **kwargs)
            else:
                cache_key_suffix = generate_cache_key(*args, **kwargs)

            prefix = key_prefix or func.__name__
            cache_key = f"{prefix}_{cache_key_suffix}"

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached_value

            logger.debug(f"Cache MISS: {cache_key}")

            # Execute function and cache result
            result = await func(*args, **kwargs)
            cache.set(cache_key, result, ttl_seconds=ttl_seconds)

            return result

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            cache = get_cache()

            # Generate cache key
            if key_generator:
                cache_key_suffix = key_generator(*args, **kwargs)
            else:
                cache_key_suffix = generate_cache_key(*args, **kwargs)

            prefix = key_prefix or func.__name__
            cache_key = f"{prefix}_{cache_key_suffix}"

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached_value

            logger.debug(f"Cache MISS: {cache_key}")

            # Execute function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl_seconds=ttl_seconds)

            return result

        # Return appropriate wrapper based on whether function is async
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def invalidate_org_cache(org_slug: str) -> int:
    """
    Invalidate all cached data for a specific organization.

    Args:
        org_slug: Organization slug

    Returns:
        Number of cache entries invalidated
    """
    cache = get_cache()
    count = cache.invalidate_pattern(org_slug)

    if count > 0:
        logger.info(f"Invalidated {count} cache entries for org {org_slug}")

    return count


def invalidate_provider_cache(org_slug: str, provider: str) -> int:
    """
    Invalidate cached data for a specific provider within an organization.

    Args:
        org_slug: Organization slug
        provider: Provider name

    Returns:
        Number of cache entries invalidated
    """
    cache = get_cache()
    pattern = f"{org_slug}_{provider}"
    count = cache.invalidate_pattern(pattern)

    if count > 0:
        logger.info(f"Invalidated {count} cache entries for org {org_slug} provider {provider}")

    return count
