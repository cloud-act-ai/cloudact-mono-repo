"""
LRU Cache Implementation

Thread-safe LRU cache with TTL support for read-only services.
Designed for high-concurrency access patterns.
"""

import polars as pl
import threading
import time
import os
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class CacheConfig:
    """Cache configuration for read services."""
    max_size: int = 1000
    ttl_seconds: int = 300  # 5 minute default
    hot_data_ttl_seconds: int = 60  # 1 minute for recent data
    cold_data_ttl_seconds: int = 900  # 15 minutes for historical


@dataclass
class CacheEntry:
    """Single cache entry with TTL tracking."""
    data: pl.DataFrame
    created_at: float
    ttl_seconds: int
    hits: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl_seconds

    def touch(self) -> None:
        self.hits += 1


class LRUCache:
    """
    Thread-safe LRU cache with TTL support.

    Features:
    - Automatic eviction on max size
    - TTL-based expiration
    - Thread-safe operations
    - Cache statistics tracking
    """

    def __init__(self, max_size: int = 1000, default_ttl: int = 300):
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, key: str) -> Optional[pl.DataFrame]:
        """Get value from cache, returns None if expired or missing."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired:
                del self._cache[key]
                self._stats["misses"] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            self._stats["hits"] += 1
            return entry.data

    def set(self, key: str, value: pl.DataFrame, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional custom TTL."""
        with self._lock:
            # Evict if at capacity
            while len(self._cache) >= self._max_size:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
                self._stats["evictions"] += 1

            self._cache[key] = CacheEntry(
                data=value,
                created_at=time.time(),
                ttl_seconds=ttl or self._default_ttl
            )

    def invalidate(self, key: str) -> bool:
        """Invalidate specific cache entry."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalidate all entries with given prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)

    def invalidate_org(self, org_slug: str) -> int:
        """Invalidate all cache entries for an org."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(f"{org_slug}:")]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            hit_rate = 0.0
            total = self._stats["hits"] + self._stats["misses"]
            if total > 0:
                hit_rate = self._stats["hits"] / total
            return {
                **self._stats,
                "size": len(self._cache),
                "max_size": self._max_size,
                "hit_rate": round(hit_rate, 4)
            }


# Global cache factory with environment configuration
def create_cache(
    name: str,
    max_size: Optional[int] = None,
    default_ttl: Optional[int] = None
) -> LRUCache:
    """
    Create a new cache instance with environment-based configuration.

    Environment variables:
    - {NAME}_CACHE_MAX_SIZE: Maximum cache entries
    - {NAME}_CACHE_TTL_SECONDS: Default TTL in seconds
    """
    env_prefix = name.upper()
    resolved_max_size = max_size or int(os.environ.get(f"{env_prefix}_CACHE_MAX_SIZE", "500"))
    resolved_ttl = default_ttl or int(os.environ.get(f"{env_prefix}_CACHE_TTL_SECONDS", "300"))
    return LRUCache(max_size=resolved_max_size, default_ttl=resolved_ttl)
