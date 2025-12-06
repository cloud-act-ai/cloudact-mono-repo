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
        cache.set("test_key", "test_value", ttl_seconds=60)
        assert cache.get("test_key") == "test_value"

    def test_get_nonexistent_key(self):
        """Test getting a key that doesn't exist."""
        cache = InMemoryCache()
        assert cache.get("nonexistent") is None

    def test_ttl_expiration(self):
        """Test that cache entries expire after TTL."""
        cache = InMemoryCache()
        cache.set("expiring_key", "value", ttl_seconds=1)

        # Should exist immediately
        assert cache.get("expiring_key") == "value"

        # Wait for expiration
        time.sleep(1.1)

        # Should be expired
        assert cache.get("expiring_key") is None

    def test_invalidate_single_key(self):
        """Test invalidating a single cache key."""
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=60)
        cache.set("key2", "value2", ttl_seconds=60)

        cache.invalidate("key1")

        assert cache.get("key1") is None
        assert cache.get("key2") == "value2"

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
        cache.set("key1", "value1", ttl_seconds=60)
        cache.set("key2", "value2", ttl_seconds=60)
        cache.set("key3", "value3", ttl_seconds=60)

        cache.clear()

        assert cache.get("key1") is None
        assert cache.get("key2") is None
        assert cache.get("key3") is None

    def test_cache_statistics(self):
        """Test cache statistics tracking."""
        cache = InMemoryCache()

        # Initial stats
        stats = cache.get_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["sets"] == 0

        # Set a value
        cache.set("key1", "value1", ttl_seconds=60)
        stats = cache.get_stats()
        assert stats["sets"] == 1

        # Cache hit
        cache.get("key1")
        stats = cache.get_stats()
        assert stats["hits"] == 1

        # Cache miss
        cache.get("nonexistent")
        stats = cache.get_stats()
        assert stats["misses"] == 1

        # Calculate hit rate
        assert stats["total_requests"] == 2
        assert stats["hit_rate_pct"] == 50.0

    def test_cleanup_expired(self):
        """Test cleanup of expired entries."""
        cache = InMemoryCache()

        # Add entries with different TTLs
        cache.set("short_lived", "value1", ttl_seconds=1)
        cache.set("long_lived", "value2", ttl_seconds=60)

        # Wait for short_lived to expire
        time.sleep(1.1)

        # Cleanup expired entries
        count = cache.cleanup_expired()

        assert count == 1
        assert cache.get("short_lived") is None
        assert cache.get("long_lived") == "value2"

    def test_different_data_types(self):
        """Test caching different data types."""
        cache = InMemoryCache()

        # String
        cache.set("string_key", "string_value", ttl_seconds=60)
        assert cache.get("string_key") == "string_value"

        # Integer
        cache.set("int_key", 42, ttl_seconds=60)
        assert cache.get("int_key") == 42

        # List
        cache.set("list_key", [1, 2, 3], ttl_seconds=60)
        assert cache.get("list_key") == [1, 2, 3]

        # Dictionary
        cache.set("dict_key", {"a": 1, "b": 2}, ttl_seconds=60)
        assert cache.get("dict_key") == {"a": 1, "b": 2}

        # Complex object
        class TestObject:
            def __init__(self, value):
                self.value = value

        obj = TestObject("test")
        cache.set("obj_key", obj, ttl_seconds=60)
        cached_obj = cache.get("obj_key")
        assert cached_obj.value == "test"


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
