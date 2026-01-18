"""
Alert Framework

Reusable, config-driven scheduled alert system for CloudAct.

Components:
- AlertEngine: Main orchestrator
- ConfigLoader: YAML configuration parsing
- ConditionEvaluator: Threshold condition evaluation
- QueryExecutor: BigQuery query templates
- RecipientResolver: Dynamic recipient resolution
"""

from .engine import AlertEngine, get_alert_engine
from .models import (
    AlertConfig,
    AlertResult,
    AlertStatus,
    AlertSeverity,
    ConditionConfig,
    RecipientConfig,
    SourceConfig,
    ScheduleConfig,
    NotificationConfig as AlertNotificationConfig,
    CooldownConfig,
)
from .condition_evaluator import ConditionEvaluator, EvaluationResult

__all__ = [
    "AlertEngine",
    "get_alert_engine",
    "AlertConfig",
    "AlertResult",
    "AlertStatus",
    "AlertSeverity",
    "ConditionConfig",
    "RecipientConfig",
    "SourceConfig",
    "ScheduleConfig",
    "AlertNotificationConfig",
    "CooldownConfig",
    "ConditionEvaluator",
    "EvaluationResult",
]
