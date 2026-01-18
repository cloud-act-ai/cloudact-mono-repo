"""
Alert Configuration Loader

Loads and parses YAML alert configurations from configs/alerts/ directory.
"""

import yaml
from pathlib import Path
from typing import List, Optional
import logging

from .models import AlertConfig, AlertConfigFile

logger = logging.getLogger(__name__)


class AlertConfigLoader:
    """
    Loads alert configurations from YAML files.

    Searches for config files in:
    1. configs/alerts/*.yml - Main alert configs
    """

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize config loader.

        Args:
            config_path: Base path for configs. Defaults to ./configs
        """
        self.config_path = config_path or Path("./configs")
        self.alerts_path = self.config_path / "alerts"
        self._cache: Optional[List[AlertConfig]] = None

    def load_all_alerts(self, force_reload: bool = False) -> List[AlertConfig]:
        """
        Load all alert configurations from YAML files.

        Args:
            force_reload: Force reload from disk, ignoring cache

        Returns:
            List of AlertConfig objects
        """
        if self._cache is not None and not force_reload:
            return self._cache

        alerts: List[AlertConfig] = []

        if not self.alerts_path.exists():
            logger.warning(f"Alerts config path not found: {self.alerts_path}")
            return alerts

        # Load all YAML files in alerts directory
        for config_file in self.alerts_path.glob("*.yml"):
            try:
                file_alerts = self._load_config_file(config_file)
                alerts.extend(file_alerts)
                logger.info(f"Loaded {len(file_alerts)} alerts from {config_file.name}")
            except Exception as e:
                logger.error(f"Failed to load alert config {config_file}: {e}")

        self._cache = alerts
        logger.info(f"Total alerts loaded: {len(alerts)}")
        return alerts

    def _load_config_file(self, file_path: Path) -> List[AlertConfig]:
        """
        Load alerts from a single YAML file.

        Args:
            file_path: Path to YAML file

        Returns:
            List of AlertConfig objects from this file
        """
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)

        if not data:
            return []

        # Parse using Pydantic model
        config_file = AlertConfigFile(**data)
        return config_file.alerts

    def get_alert_by_id(self, alert_id: str) -> Optional[AlertConfig]:
        """
        Get a specific alert by ID.

        Args:
            alert_id: Alert ID to find

        Returns:
            AlertConfig or None if not found
        """
        alerts = self.load_all_alerts()
        for alert in alerts:
            if alert.id == alert_id:
                return alert
        return None

    def get_alerts_by_tag(self, tag: str) -> List[AlertConfig]:
        """
        Get alerts that have a specific tag.

        Args:
            tag: Tag to filter by

        Returns:
            List of AlertConfig objects with matching tag
        """
        alerts = self.load_all_alerts()
        return [a for a in alerts if tag in a.tags]

    def get_enabled_alerts(self) -> List[AlertConfig]:
        """
        Get only enabled alerts.

        Returns:
            List of enabled AlertConfig objects
        """
        alerts = self.load_all_alerts()
        return [a for a in alerts if a.enabled]

    def clear_cache(self):
        """Clear the configuration cache."""
        self._cache = None
        logger.info("Alert config cache cleared")
