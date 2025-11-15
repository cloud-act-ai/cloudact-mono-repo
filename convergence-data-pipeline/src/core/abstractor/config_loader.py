"""
Configuration Loader
Loads and validates YAML configuration files using Pydantic models.
"""

import yaml
from pathlib import Path
from typing import Optional, Dict, Any
from functools import lru_cache
import logging

from src.core.abstractor.models import (
    SourceConfig,
    DQConfig,
    PipelineConfig
)
from src.app.config import settings

logger = logging.getLogger(__name__)


class ConfigLoader:
    """
    Loads and caches configuration files for tenants.

    Features:
    - YAML parsing with Pydantic validation
    - Tenant-scoped config loading
    - LRU caching for performance
    - Type-safe config models
    """

    def __init__(self):
        """Initialize config loader."""
        self._cache: Dict[str, Any] = {}

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

        if cache_key in self._cache:
            logger.debug(f"Config cache hit: {cache_key}")
            return self._cache[cache_key]

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

            # Cache the config
            self._cache[cache_key] = config

            logger.info(
                f"Loaded source config: {config.source_id}",
                tenant_id=tenant_id,
                config_file=config_file
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

        if cache_key in self._cache:
            logger.debug(f"Config cache hit: {cache_key}")
            return self._cache[cache_key]

        config_path = Path(settings.get_tenant_config_path(tenant_id)) / config_file

        if not config_path.exists():
            raise FileNotFoundError(
                f"DQ config not found: {config_path} for tenant {tenant_id}"
            )

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)

            config = DQConfig(**config_dict)
            self._cache[cache_key] = config

            logger.info(
                f"Loaded DQ config: {config.dq_id}",
                tenant_id=tenant_id,
                config_file=config_file
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

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier (e.g., "p_openai_billing")

        Returns:
            Validated PipelineConfig object
        """
        cache_key = f"{tenant_id}:pipeline:{pipeline_id}"

        if cache_key in self._cache:
            logger.debug(f"Config cache hit: {cache_key}")
            return self._cache[cache_key]

        # Pipelines stored in configs/{tenant_id}/pipelines/{pipeline_id}.yml
        config_path = (
            Path(settings.get_tenant_pipelines_path(tenant_id))
            / f"{pipeline_id}.yml"
        )

        if not config_path.exists():
            raise FileNotFoundError(
                f"Pipeline config not found: {config_path} for tenant {tenant_id}"
            )

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)

            config = PipelineConfig(**config_dict)
            self._cache[cache_key] = config

            logger.info(
                f"Loaded pipeline config: {config.pipeline_id}",
                tenant_id=tenant_id,
                num_steps=len(config.steps)
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
            self._cache.clear()
            logger.info("Cleared entire config cache")
        else:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(f"{tenant_id}:")]
            for key in keys_to_delete:
                del self._cache[key]
            logger.info(f"Cleared config cache for tenant: {tenant_id}")


@lru_cache()
def get_config_loader() -> ConfigLoader:
    """Get cached config loader instance."""
    return ConfigLoader()
