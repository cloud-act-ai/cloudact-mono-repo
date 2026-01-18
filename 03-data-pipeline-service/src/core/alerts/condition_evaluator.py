"""
Condition Evaluator

Flexible condition evaluation engine for alert thresholds.

Supports operators:
- gt, lt, eq, gte, lte: Standard comparisons
- between: Range check [min, max]
- contains, not_contains: String matching
- in, not_in: List membership
"""

from typing import Dict, Any, List, Callable, Optional
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class EvaluationResult:
    """Result of condition evaluation."""
    triggered: bool
    conditions_met: List[str] = field(default_factory=list)
    conditions_failed: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)


# ============================================
# OPERATOR FUNCTIONS
# ============================================

OPERATORS: Dict[str, Callable[[Any, Any], bool]] = {
    "gt": lambda a, b: float(a) > float(b),
    "lt": lambda a, b: float(a) < float(b),
    "eq": lambda a, b: a == b,
    "gte": lambda a, b: float(a) >= float(b),
    "lte": lambda a, b: float(a) <= float(b),
    "ne": lambda a, b: a != b,
    "between": lambda a, b: float(b[0]) <= float(a) <= float(b[1]),
    "not_between": lambda a, b: float(a) < float(b[0]) or float(a) > float(b[1]),
    "contains": lambda a, b: str(b).lower() in str(a).lower(),
    "not_contains": lambda a, b: str(b).lower() not in str(a).lower(),
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "is_null": lambda a, b: a is None,
    "is_not_null": lambda a, b: a is not None,
    # BUG-003 FIX: percentage_of now returns bool (checks if percentage exceeds threshold)
    # Usage: { "field": "usage", "operator": "percentage_of_exceeds", "value": [limit_field, threshold_percent] }
    # e.g., usage is 80% of limit, threshold is 90% -> False (80 < 90)
    "percentage_of_exceeds": lambda a, b: (float(a) / float(b[0])) * 100 >= float(b[1]) if b[0] and float(b[0]) > 0 else False,
}


class ConditionEvaluator:
    """
    Evaluates alert conditions against data.

    Supports AND logic (all conditions must be true).
    Each condition specifies: field, operator, value
    """

    def __init__(self):
        self.operators = OPERATORS

    def evaluate(
        self,
        data: Dict[str, Any],
        conditions: List[Dict[str, Any]]
    ) -> EvaluationResult:
        """
        Evaluate all conditions against data.

        Args:
            data: Row data from query (e.g., {"total_cost": 25.50, "org_slug": "acme"})
            conditions: List of condition configurations

        Returns:
            EvaluationResult with triggered status and details
        """
        conditions_met = []
        conditions_failed = []
        details = {}

        for condition in conditions:
            field_name = condition.get("field")
            operator = condition.get("operator")
            threshold = condition.get("value")

            # Get actual value from data
            actual_value = data.get(field_name)

            if actual_value is None:
                conditions_failed.append(f"{field_name} is null")
                details[field_name] = {
                    "actual": None,
                    "expected": f"{operator} {threshold}",
                    "met": False
                }
                continue

            # Get operator function
            op_func = self.operators.get(operator)
            if not op_func:
                logger.warning(f"Unknown operator: {operator}")
                conditions_failed.append(f"Unknown operator: {operator}")
                continue

            # Evaluate condition
            try:
                result = op_func(actual_value, threshold)

                condition_desc = f"{field_name} {operator} {threshold}"

                if result:
                    conditions_met.append(condition_desc)
                else:
                    conditions_failed.append(condition_desc)

                details[field_name] = {
                    "actual": actual_value,
                    "operator": operator,
                    "threshold": threshold,
                    "met": result
                }

            except Exception as e:
                logger.error(f"Condition evaluation error for {field_name}: {e}")
                conditions_failed.append(f"Error evaluating {field_name}: {e}")
                details[field_name] = {
                    "actual": actual_value,
                    "error": str(e),
                    "met": False
                }

        # All conditions must be met (AND logic)
        triggered = len(conditions_failed) == 0 and len(conditions_met) > 0

        return EvaluationResult(
            triggered=triggered,
            conditions_met=conditions_met,
            conditions_failed=conditions_failed,
            details=details
        )

    def add_operator(self, name: str, func: Callable[[Any, Any], bool]):
        """
        Add a custom operator.

        Args:
            name: Operator name (e.g., "custom_check")
            func: Function taking (actual_value, threshold) -> bool
        """
        self.operators[name] = func
