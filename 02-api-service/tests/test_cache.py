"""
Unit tests for caching utility.

Tests the in-memory cache implementation including:
- Basic get/set operations
- TTL expiration
- Cache invalidation (single key and pattern-based)
- Cache statistics tracking
- Thread safety
"""

import time
import pytest
from src.core.utils.cache import InMemoryCache, get_cache, generate_cache_key


class TestInMemoryCache:
    """Test suite for InMemoryCache class."""

    def test_set_and_get(self):
        """Test basic set and get operations."""
        cache = InMemoryCache()
        cache.set("org_test_key", "test_value", ttl_seconds=60)
        assert cache.get("org_test_key") == "test_value"

    def test_get_nonexistent_key(self):
        """Test getting a key that doesn't exist."""
        cache = InMemoryCache()
        assert cache.get("org_nonexistent") is None

    def test_ttl_expiration(self):
        """Test that cache entries expire after TTL."""
        cache = InMemoryCache()
        cache.set("org_expiring_key", "value", ttl_seconds=1)

        # Should exist immediately
        assert cache.get("org_expiring_key") == "value"

        # Wait for expiration
        time.sleep(1.1)

        # Should be expired
        assert cache.get("org_expiring_key") is None

    def test_invalidate_single_key(self):
        """Test invalidating a single cache key."""
        cache = InMemoryCache()
        cache.set("org_key1", "value1", ttl_seconds=60)
        cache.set("org_key2", "value2", ttl_seconds=60)

        cache.invalidate("org_key1")

        assert cache.get("org_key1") is None
        assert cache.get("org_key2") == "value2"

    def test_invalidate_pattern(self):
        """Test pattern-based cache invalidation."""
        cache = InMemoryCache()
        cache.set("org_acme_providers", "data1", ttl_seconds=60)
        cache.set("org_acme_plans", "data2", ttl_seconds=60)
        cache.set("org_other_providers", "data3", ttl_seconds=60)

        # Invalidate all keys for org_acme
        count = cache.invalidate_pattern("org_acme")

        assert count == 2
        assert cache.get("org_acme_providers") is None
        assert cache.get("org_acme_plans") is None
        assert cache.get("org_other_providers") == "data3"

    def test_clear_all(self):
        """Test clearing all cache entries."""
        cache = InMemoryCache()
        cache.set("org_key1", "value1", ttl_seconds=60)
        cache.set("org_key2", "value2", ttl_seconds=60)
        cache.set("org_key3", "value3", ttl_seconds=60)

        cache.clear()

        assert cache.get("org_key1") is None
        assert cache.get("org_key2") is None
        assert cache.get("org_key3") is None

    def test_cache_statistics(self):
        """Test cache statistics tracking."""
        cache = InMemoryCache()

        # Initial stats
        stats = cache.get_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["sets"] == 0

        # Set a value
        cache.set("org_key1", "value1", ttl_seconds=60)
        stats = cache.get_stats()
        assert stats["sets"] == 1

        # Cache hit
        cache.get("org_key1")
        stats = cache.get_stats()
        assert stats["hits"] == 1

        # Cache miss
        cache.get("org_nonexistent")
        stats = cache.get_stats()
        assert stats["misses"] == 1

        # Calculate hit rate
        assert stats["total_requests"] == 2
        assert stats["hit_rate_pct"] == 50.0

    def test_cleanup_expired(self):
        """Test cleanup of expired entries."""
        cache = InMemoryCache()

        # Add entries with different TTLs
        cache.set("org_short_lived", "value1", ttl_seconds=1)
        cache.set("org_long_lived", "value2", ttl_seconds=60)

        # Wait for short_lived to expire
        time.sleep(1.1)

        # Cleanup expired entries
        count = cache.cleanup_expired()

        assert count == 1
        assert cache.get("org_short_lived") is None
        assert cache.get("org_long_lived") == "value2"

    def test_different_data_types(self):
        """Test caching different data types."""
        cache = InMemoryCache()

        # String
        cache.set("org_string_key", "string_value", ttl_seconds=60)
        assert cache.get("org_string_key") == "string_value"

        # Integer
        cache.set("org_int_key", 42, ttl_seconds=60)
        assert cache.get("org_int_key") == 42

        # List
        cache.set("org_list_key", [1, 2, 3], ttl_seconds=60)
        assert cache.get("org_list_key") == [1, 2, 3]

        # Dictionary
        cache.set("org_dict_key", {"a": 1, "b": 2}, ttl_seconds=60)
        assert cache.get("org_dict_key") == {"a": 1, "b": 2}

        # Complex object
        class TestObject:
            def __init__(self, value):
                self.value = value

        obj = TestObject("test")
        cache.set("obj_key", obj, ttl_seconds=60)
        cached_obj = cache.get("obj_key")
        assert cached_obj.value == "test"

    def test_lru_eviction(self):
        """Test LRU eviction when cache reaches max_size."""
        # Create cache with small max_size for testing
        cache = InMemoryCache(max_size=3)

        # Fill cache to max
        cache.set("org_key1", "value1", ttl_seconds=60)
        cache.set("org_key2", "value2", ttl_seconds=60)
        cache.set("org_key3", "value3", ttl_seconds=60)

        # All keys should exist
        assert cache.get("org_key1") == "value1"
        assert cache.get("org_key2") == "value2"
        assert cache.get("org_key3") == "value3"

        # Access key1 to make it most recently used (key2 is now LRU)
        cache.get("org_key1")

        # Add new key - should evict key2 (least recently used)
        cache.set("org_key4", "value4", ttl_seconds=60)

        # key2 should be evicted
        assert cache.get("org_key2") is None
        # Others should remain
        assert cache.get("org_key1") == "value1"
        assert cache.get("org_key3") == "value3"
        assert cache.get("org_key4") == "value4"

        # Check eviction stats
        stats = cache.get_stats()
        assert stats["evictions"] == 1

    def test_lru_eviction_order(self):
        """Test that LRU evicts in correct order based on access patterns."""
        cache = InMemoryCache(max_size=3)

        # Add 3 entries
        cache.set("org_a", "val_a", ttl_seconds=60)
        cache.set("org_b", "val_b", ttl_seconds=60)
        cache.set("org_c", "val_c", ttl_seconds=60)

        # Access pattern: a, b (c is now LRU)
        cache.get("org_a")
        cache.get("org_b")

        # Add new entry - should evict c
        cache.set("org_d", "val_d", ttl_seconds=60)

        assert cache.get("org_c") is None
        assert cache.get("org_a") == "val_a"
        assert cache.get("org_b") == "val_b"
        assert cache.get("org_d") == "val_d"

    def test_background_cleanup_thread(self):
        """Test that background cleanup thread is started."""
        cache = InMemoryCache()

        # Check cleanup thread exists and is running
        assert cache._cleanup_thread is not None
        assert cache._cleanup_thread.is_alive()
        assert cache._cleanup_thread.daemon  # Should be daemon thread

        # Cleanup on cache destruction
        cache._stop_eviction_thread()
        time.sleep(0.1)  # Give thread time to stop
        assert not cache._cleanup_thread.is_alive()


class TestCacheKeyGeneration:
    """Test suite for cache key generation."""

    def test_generate_cache_key_with_args(self):
        """Test cache key generation with positional arguments."""
        key1 = generate_cache_key("arg1", "arg2", "arg3")
        key2 = generate_cache_key("arg1", "arg2", "arg3")
        key3 = generate_cache_key("arg1", "arg2", "different")

        # Same args should produce same key
        assert key1 == key2

        # Different args should produce different key
        assert key1 != key3

    def test_generate_cache_key_with_kwargs(self):
        """Test cache key generation with keyword arguments."""
        key1 = generate_cache_key(org="acme", provider="slack")
        key2 = generate_cache_key(org="acme", provider="slack")
        key3 = generate_cache_key(org="other", provider="slack")

        # Same kwargs should produce same key
        assert key1 == key2

        # Different kwargs should produce different key
        assert key1 != key3

    def test_generate_cache_key_deterministic(self):
        """Test that cache key generation is deterministic."""
        # Same kwargs in different order should produce same key
        key1 = generate_cache_key(org="acme", provider="slack", enabled=True)
        key2 = generate_cache_key(enabled=True, provider="slack", org="acme")

        assert key1 == key2


class TestGlobalCache:
    """Test suite for global cache singleton."""

    def test_get_cache_singleton(self):
        """Test that get_cache returns a singleton instance."""
        cache1 = get_cache()
        cache2 = get_cache()

        # Should be the same instance
        assert cache1 is cache2

    def test_global_cache_persistence(self):
        """Test that global cache persists data across get_cache calls."""
        cache1 = get_cache()
        cache1.set("test_key", "test_value", ttl_seconds=60)

        cache2 = get_cache()
        assert cache2.get("test_key") == "test_value"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
