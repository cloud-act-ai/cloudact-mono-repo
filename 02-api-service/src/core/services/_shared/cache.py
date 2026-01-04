"""
LRU Cache Implementation

Thread-safe LRU cache with TTL support for read-only services.
Designed for high-concurrency access patterns.

Memory Management:
- Tracks estimated memory usage per DataFrame
- Evicts based on BOTH entry count AND memory limit
- Default memory limit: 512MB per cache instance
- Prevents OOM with large DataFrames (millions of rows per org)
"""

import polars as pl
import threading
import time
import os
import logging
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Union

logger = logging.getLogger(__name__)

# Memory limits (bytes)
DEFAULT_MAX_MEMORY_MB = 512  # 512MB default per cache instance
BYTES_PER_MB = 1024 * 1024


def _estimate_dataframe_memory(df: pl.DataFrame) -> int:
    """
    Estimate memory usage of a Polars DataFrame in bytes.

    Uses Polars' estimated_size() which accounts for:
    - Column data (actual values)
    - String heap allocations
    - Null bitmaps

    Returns conservative estimate for cache management.
    """
    if df is None or df.is_empty():
        return 0
    try:
        return df.estimated_size()
    except Exception:
        # Fallback: rough estimate (8 bytes per cell average)
        return df.shape[0] * df.shape[1] * 8


def _estimate_dict_memory(data: Dict[str, Any]) -> int:
    """
    Estimate memory usage of a dict (for aggregation cache).

    Very rough estimate - assumes ~100 bytes per key-value pair
    plus actual string/number sizes.
    """
    if not data:
        return 0
    try:
        import sys
        return sys.getsizeof(str(data))  # Rough approximation
    except Exception:
        return len(str(data))  # Fallback


@dataclass
class CacheConfig:
    """Cache configuration for read services."""
    max_size: int = 100  # Reduced from 1000 - entry count limit
    max_memory_mb: int = DEFAULT_MAX_MEMORY_MB  # Memory limit in MB
    ttl_seconds: int = 300  # 5 minute default
    hot_data_ttl_seconds: int = 60  # 1 minute for recent data
    cold_data_ttl_seconds: int = 900  # 15 minutes for historical


@dataclass
class CacheEntry:
    """Single cache entry with TTL and memory tracking."""
    data: Union[pl.DataFrame, Dict[str, Any]]
    created_at: float
    ttl_seconds: int
    memory_bytes: int = 0  # Estimated memory usage
    hits: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl_seconds

    def touch(self) -> None:
        self.hits += 1


class LRUCache:
    """
    Thread-safe LRU cache with TTL and memory-based eviction.

    Features:
    - Automatic eviction on max size AND max memory
    - TTL-based expiration
    - Thread-safe operations
    - Memory tracking per entry
    - Cache statistics tracking

    Memory Management:
    - Tracks estimated memory per DataFrame/Dict
    - Evicts LRU entries when memory limit exceeded
    - Prevents OOM with large DataFrames (millions of rows)
    """

    def __init__(
        self,
        max_size: int = 100,
        default_ttl: int = 300,
        max_memory_mb: int = DEFAULT_MAX_MEMORY_MB
    ):
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
        self._max_size = max_size
        self._max_memory_bytes = max_memory_mb * BYTES_PER_MB
        self._current_memory_bytes = 0
        self._default_ttl = default_ttl
        self._stats = {"hits": 0, "misses": 0, "evictions": 0, "memory_evictions": 0}

    def get(self, key: str) -> Optional[Union[pl.DataFrame, Dict[str, Any]]]:
        """Get value from cache, returns None if expired or missing."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired:
                self._current_memory_bytes -= entry.memory_bytes
                del self._cache[key]
                self._stats["misses"] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            self._stats["hits"] += 1
            return entry.data

    def _evict_for_memory(self, needed_bytes: int) -> None:
        """Evict LRU entries until enough memory is available."""
        while (
            self._cache and
            self._current_memory_bytes + needed_bytes > self._max_memory_bytes
        ):
            oldest_key = next(iter(self._cache))
            oldest_entry = self._cache[oldest_key]
            self._current_memory_bytes -= oldest_entry.memory_bytes
            del self._cache[oldest_key]
            self._stats["memory_evictions"] += 1
            logger.debug(
                f"Memory eviction: {oldest_key} freed {oldest_entry.memory_bytes / BYTES_PER_MB:.2f}MB"
            )

    def set(
        self,
        key: str,
        value: Union[pl.DataFrame, Dict[str, Any]],
        ttl: Optional[int] = None
    ) -> None:
        """Set value in cache with optional custom TTL."""
        # Estimate memory for new entry
        if isinstance(value, pl.DataFrame):
            memory_bytes = _estimate_dataframe_memory(value)
        elif isinstance(value, dict):
            memory_bytes = _estimate_dict_memory(value)
        else:
            memory_bytes = 1024  # 1KB default for unknown types

        with self._lock:
            # If key exists, remove old entry's memory first
            if key in self._cache:
                old_entry = self._cache[key]
                self._current_memory_bytes -= old_entry.memory_bytes
                del self._cache[key]

            # Evict if at entry count capacity
            while len(self._cache) >= self._max_size:
                oldest_key = next(iter(self._cache))
                oldest_entry = self._cache[oldest_key]
                self._current_memory_bytes -= oldest_entry.memory_bytes
                del self._cache[oldest_key]
                self._stats["evictions"] += 1

            # Evict if at memory capacity
            self._evict_for_memory(memory_bytes)

            # Add new entry
            self._cache[key] = CacheEntry(
                data=value,
                created_at=time.time(),
                ttl_seconds=ttl or self._default_ttl,
                memory_bytes=memory_bytes
            )
            self._current_memory_bytes += memory_bytes

            # Log large entries in debug mode
            if memory_bytes > 10 * BYTES_PER_MB:  # > 10MB
                logger.debug(
                    f"Large cache entry: {key} = {memory_bytes / BYTES_PER_MB:.2f}MB"
                )

    def invalidate(self, key: str) -> bool:
        """Invalidate specific cache entry."""
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                self._current_memory_bytes -= entry.memory_bytes
                del self._cache[key]
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalidate all entries with given prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                entry = self._cache[key]
                self._current_memory_bytes -= entry.memory_bytes
                del self._cache[key]
            return len(keys_to_delete)

    def invalidate_org(self, org_slug: str) -> int:
        """Invalidate all cache entries for an org."""
        with self._lock:
            # Match both "org_slug:" prefix and ":org_slug:" patterns
            keys_to_delete = [
                k for k in self._cache
                if k.startswith(f"{org_slug}:") or f":{org_slug}:" in k
            ]
            for key in keys_to_delete:
                entry = self._cache[key]
                self._current_memory_bytes -= entry.memory_bytes
                del self._cache[key]
            return len(keys_to_delete)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
            self._current_memory_bytes = 0

    @property
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics including memory usage."""
        with self._lock:
            hit_rate = 0.0
            total = self._stats["hits"] + self._stats["misses"]
            if total > 0:
                hit_rate = self._stats["hits"] / total

            return {
                **self._stats,
                "size": len(self._cache),
                "max_size": self._max_size,
                "memory_bytes": self._current_memory_bytes,
                "memory_mb": round(self._current_memory_bytes / BYTES_PER_MB, 2),
                "max_memory_mb": self._max_memory_bytes // BYTES_PER_MB,
                "memory_utilization": round(
                    self._current_memory_bytes / self._max_memory_bytes, 4
                ) if self._max_memory_bytes > 0 else 0,
                "hit_rate": round(hit_rate, 4)
            }


# Global cache factory with environment configuration
def create_cache(
    name: str,
    max_size: Optional[int] = None,
    default_ttl: Optional[int] = None,
    max_memory_mb: Optional[int] = None
) -> LRUCache:
    """
    Create a new cache instance with environment-based configuration.

    Environment variables:
    - {NAME}_CACHE_MAX_SIZE: Maximum cache entries (default: 100)
    - {NAME}_CACHE_TTL_SECONDS: Default TTL in seconds (default: 300)
    - {NAME}_CACHE_MAX_MEMORY_MB: Maximum memory in MB (default: 512)

    Memory Management:
    - Each org can have millions of rows in DataFrames
    - Memory limit prevents OOM with large datasets
    - Both entry count AND memory limits are enforced
    - LRU eviction when either limit is exceeded

    Example:
    - L1 Cache (DataFrames): 512MB limit, ~5-10 large queries
    - L2 Cache (Aggregations): 128MB limit, ~100+ small dicts
    """
    env_prefix = name.upper()
    resolved_max_size = max_size or int(
        os.environ.get(f"{env_prefix}_CACHE_MAX_SIZE", "100")
    )
    resolved_ttl = default_ttl or int(
        os.environ.get(f"{env_prefix}_CACHE_TTL_SECONDS", "300")
    )
    resolved_max_memory = max_memory_mb or int(
        os.environ.get(f"{env_prefix}_CACHE_MAX_MEMORY_MB", str(DEFAULT_MAX_MEMORY_MB))
    )

    logger.info(
        f"Creating cache '{name}': max_size={resolved_max_size}, "
        f"ttl={resolved_ttl}s, max_memory={resolved_max_memory}MB"
    )

    return LRUCache(
        max_size=resolved_max_size,
        default_ttl=resolved_ttl,
        max_memory_mb=resolved_max_memory
    )
