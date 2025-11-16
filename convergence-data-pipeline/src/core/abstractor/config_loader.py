"""
Configuration Loader
Loads and validates YAML configuration files using Pydantic models.

Memory-efficient LRU caching for multi-tenant environments.
"""

import yaml
from pathlib import Path
from typing import Optional, Dict, Any
from functools import lru_cache
from collections import OrderedDict
import logging

from src.core.abstractor.models import (
    SourceConfig,
    DQConfig,
    PipelineConfig
)
from src.app.config import settings

logger = logging.getLogger(__name__)

# Global module-level cache for dataset types with bounded size
@lru_cache(maxsize=1)
def _get_dataset_types_cache() -> Dict[str, Any]:
    """Get cached dataset types mapping (bounded to 1 entry)."""
    return {}


class ConfigLoader:
    """
    Loads and caches configuration files for tenants.

    Features:
    - YAML parsing with Pydantic validation
    - Tenant-scoped config loading
    - LRU (Least Recently Used) caching with bounded size limit
    - Type-safe config models
    - Memory-efficient for multi-tenant scale (10k+ tenants)

    Cache Strategy:
    - maxsize=1000: Maintains cache for ~10% of 10k tenants
    - LRU eviction: Automatically removes least recently used entries
    - Prevents unbounded memory growth
    """

    # Cache size limit: 1000 entries supports 10k tenants with 10% hit rate
    # Typical config object size: ~5-50KB, so max cache ~50-500MB
    CACHE_MAXSIZE = 1000

    def __init__(self):
        """Initialize config loader with bounded LRU cache."""
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._cache_hits = 0
        self._cache_misses = 0

    def _evict_lru(self) -> None:
        """
        Evict least recently used entry if cache exceeds CACHE_MAXSIZE.

        OrderedDict maintains insertion order. Moving accessed item to end
        ensures LRU items are at the beginning.
        """
        if len(self._cache) >= self.CACHE_MAXSIZE:
            # Remove oldest (least recently used) item
            lru_key, _ = self._cache.popitem(last=False)
            logger.debug(f"Evicted LRU cache entry: {lru_key} (cache size: {len(self._cache)})")

    def _access_cache(self, cache_key: str) -> Optional[Any]:
        """
        Access cache entry and mark as recently used.

        Args:
            cache_key: Cache key to access

        Returns:
            Cached value or None if not found
        """
        if cache_key in self._cache:
            # Move to end to mark as recently used
            self._cache.move_to_end(cache_key)
            self._cache_hits += 1
            return self._cache[cache_key]

        self._cache_misses += 1
        return None

    def _set_cache(self, cache_key: str, value: Any) -> None:
        """
        Set cache entry and manage LRU eviction.

        Args:
            cache_key: Cache key
            value: Value to cache
        """
        if cache_key in self._cache:
            # Update existing entry and move to end
            del self._cache[cache_key]

        self._cache[cache_key] = value
        self._evict_lru()

    def load_source_config(
        self,
        tenant_id: str,
        config_file: str
    ) -> SourceConfig:
        """
        Load source configuration from YAML file.

        Args:
            tenant_id: Tenant identifier
            config_file: Relative path to config file (e.g., "sources/openai_billing.yml")

        Returns:
            Validated SourceConfig object

        Raises:
            FileNotFoundError: If config file doesn't exist
            ValueError: If config validation fails
        """
        cache_key = f"{tenant_id}:source:{config_file}"

        # Check cache with LRU tracking
        cached_config = self._access_cache(cache_key)
        if cached_config is not None:
            logger.debug(f"Config cache hit: {cache_key}")
            return cached_config

        # Build full path
        config_path = Path(settings.get_tenant_config_path(tenant_id)) / config_file

        if not config_path.exists():
            raise FileNotFoundError(
                f"Source config not found: {config_path} for tenant {tenant_id}"
            )

        # Load and parse YAML
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)

            # Validate with Pydantic
            config = SourceConfig(**config_dict)

            # Cache the config with LRU eviction
            self._set_cache(cache_key, config)

            logger.info(
                f"Loaded source config: {config.source_id}",
                extra={"tenant_id": tenant_id, "config_file": config_file}
            )

            return config

        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML in {config_path}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading source config {config_path}: {e}")

    def load_dq_config(
        self,
        tenant_id: str,
        config_file: str
    ) -> DQConfig:
        """
        Load data quality configuration from YAML file.

        Args:
            tenant_id: Tenant identifier
            config_file: Relative path to config file (e.g., "dq_rules/billing_dq.yml")

        Returns:
            Validated DQConfig object
        """
        cache_key = f"{tenant_id}:dq:{config_file}"

        # Check cache with LRU tracking
        cached_config = self._access_cache(cache_key)
        if cached_config is not None:
            logger.debug(f"Config cache hit: {cache_key}")
            return cached_config

        config_path = Path(settings.get_tenant_config_path(tenant_id)) / config_file

        if not config_path.exists():
            raise FileNotFoundError(
                f"DQ config not found: {config_path} for tenant {tenant_id}"
            )

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)

            config = DQConfig(**config_dict)
            self._set_cache(cache_key, config)

            logger.info(
                f"Loaded DQ config: {config.dq_id}",
                extra={"tenant_id": tenant_id, "config_file": config_file}
            )

            return config

        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML in {config_path}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading DQ config {config_path}: {e}")

    def load_pipeline_config(
        self,
        tenant_id: str,
        pipeline_id: str
    ) -> PipelineConfig:
        """
        Load pipeline configuration from YAML file.

        Searches recursively for pipeline in cloud-provider/domain structure:
        configs/{tenant_id}/{provider}/{domain}/{pipeline_id}.yml

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier (e.g., "p_openai_billing")

        Returns:
            Validated PipelineConfig object
        """
        cache_key = f"{tenant_id}:pipeline:{pipeline_id}"

        # Check cache with LRU tracking
        cached_config = self._access_cache(cache_key)
        if cached_config is not None:
            logger.debug(f"Config cache hit: {cache_key}")
            return cached_config

        # Use new recursive search method to find pipeline
        try:
            config_path_str = settings.find_pipeline_path(tenant_id, pipeline_id)
            config_path = Path(config_path_str)
        except (FileNotFoundError, ValueError) as e:
            raise FileNotFoundError(
                f"Pipeline config not found: {pipeline_id} for tenant {tenant_id}. {e}"
            )

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)

            config = PipelineConfig(**config_dict)
            self._set_cache(cache_key, config)

            logger.info(
                f"Loaded pipeline config: {config.pipeline_id}",
                extra={"tenant_id": tenant_id, "num_steps": len(config.steps)}
            )

            return config

        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML in {config_path}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading pipeline config {config_path}: {e}")

    def clear_cache(self, tenant_id: Optional[str] = None):
        """
        Clear configuration cache.

        Args:
            tenant_id: If provided, only clear configs for this tenant.
                      If None, clear entire cache.
        """
        if tenant_id is None:
            cache_size = len(self._cache)
            self._cache.clear()
            self._cache_hits = 0
            self._cache_misses = 0
            logger.info(f"Cleared entire config cache (removed {cache_size} entries)")
        else:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(f"{tenant_id}:")]
            for key in keys_to_delete:
                del self._cache[key]
            logger.info(
                f"Cleared config cache for tenant: {tenant_id} (removed {len(keys_to_delete)} entries)"
            )

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache performance statistics.

        Returns:
            Dictionary with cache stats including hits, misses, and current size
        """
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = (
            (self._cache_hits / total_requests * 100)
            if total_requests > 0
            else 0
        )

        return {
            "cache_size": len(self._cache),
            "max_size": self.CACHE_MAXSIZE,
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "total_requests": total_requests,
            "hit_rate_percent": round(hit_rate, 2),
        }


@lru_cache()
def get_config_loader() -> ConfigLoader:
    """Get cached config loader instance."""
    return ConfigLoader()
