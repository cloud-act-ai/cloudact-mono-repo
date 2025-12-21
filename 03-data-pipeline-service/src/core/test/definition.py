"""
Test Case Definitions

Lightweight test abstractions for pipeline processors.
Does NOT require modifying existing processors.
"""

import asyncio
import importlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable, Union
from enum import Enum


class TestStatus(str, Enum):
    """Test execution status."""
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    ERROR = "error"


@dataclass
class TestResult:
    """Result of a single test execution."""
    test_name: str
    status: TestStatus
    duration_ms: float
    processor_result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    assertions_passed: int = 0
    assertions_failed: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return self.status == TestStatus.PASSED

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_name": self.test_name,
            "status": self.status.value,
            "duration_ms": self.duration_ms,
            "passed": self.passed,
            "error": self.error,
            "assertions_passed": self.assertions_passed,
            "assertions_failed": self.assertions_failed,
        }


@dataclass
class TestSuiteResult:
    """Result of running a test suite."""
    suite_name: str
    results: List[TestResult] = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.status == TestStatus.PASSED)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status == TestStatus.FAILED)

    @property
    def all_passed(self) -> bool:
        return self.failed == 0 and self.total > 0

    def summary(self) -> str:
        return f"{self.suite_name}: {self.passed}/{self.total} passed"


class AssertionError(Exception):
    """Custom assertion error for test failures."""
    pass


class ProcessorTestCase(ABC):
    """
    Base class for testing individual processors.

    Works with existing processors - no modification required.

    Example:
        class TestOpenAIUsage(ProcessorTestCase):
            processor_module = "src.core.processors.openai.usage"

            async def test_success_case(self):
                result = await self.execute_processor(
                    step_config={"config": {"start_date": "2025-01-01"}},
                    context={"org_slug": "test_org"}
                )
                self.assert_success(result)
                self.assert_has_key(result, "usage_records")
    """

    # Override in subclass
    processor_module: str = ""

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self._processor = None
        self._assertions_passed = 0
        self._assertions_failed = 0

    def setup(self) -> None:
        """Override for test setup. Called before each test."""
        pass

    def teardown(self) -> None:
        """Override for test cleanup. Called after each test."""
        pass

    async def execute_processor(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute the processor with given config and context.

        Dynamically loads the processor module and calls get_engine().
        """
        if not self.processor_module:
            raise ValueError("processor_module must be set in test class")

        # Dynamic import (same as AsyncPipelineExecutor)
        module = importlib.import_module(self.processor_module)

        if hasattr(module, "get_engine"):
            processor = module.get_engine()
        else:
            raise ValueError(f"Module {self.processor_module} has no get_engine()")

        return await processor.execute(step_config, context)

    # ==========================================
    # Assertion Methods
    # ==========================================

    def assert_success(self, result: Dict[str, Any], msg: str = "") -> None:
        """Assert processor returned SUCCESS status."""
        status = result.get("status", "").upper()
        if status != "SUCCESS":
            error = result.get("error", "Unknown error")
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected SUCCESS, got {status}: {error}"
            )
        self._assertions_passed += 1

    def assert_failed(self, result: Dict[str, Any], msg: str = "") -> None:
        """Assert processor returned FAILED status."""
        status = result.get("status", "").upper()
        if status != "FAILED":
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected FAILED, got {status}"
            )
        self._assertions_passed += 1

    def assert_has_key(self, result: Dict[str, Any], key: str, msg: str = "") -> None:
        """Assert result contains a specific key."""
        if key not in result:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected key '{key}' not found in result"
            )
        self._assertions_passed += 1

    def assert_equals(self, actual: Any, expected: Any, msg: str = "") -> None:
        """Assert two values are equal."""
        if actual != expected:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected {expected}, got {actual}"
            )
        self._assertions_passed += 1

    def assert_true(self, condition: bool, msg: str = "") -> None:
        """Assert condition is True."""
        if not condition:
            self._assertions_failed += 1
            raise AssertionError(msg or "Condition is not True")
        self._assertions_passed += 1

    def assert_in(self, item: Any, collection: Any, msg: str = "") -> None:
        """Assert item is in collection."""
        if item not in collection:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"'{item}' not found in collection"
            )
        self._assertions_passed += 1

    def assert_rows_processed(
        self,
        result: Dict[str, Any],
        min_rows: int = 0,
        max_rows: Optional[int] = None,
        msg: str = ""
    ) -> None:
        """Assert rows_processed is within expected range."""
        rows = result.get("rows_processed", 0)
        if rows < min_rows:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected at least {min_rows} rows, got {rows}"
            )
        if max_rows is not None and rows > max_rows:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected at most {max_rows} rows, got {rows}"
            )
        self._assertions_passed += 1

    def assert_error_contains(
        self,
        result: Dict[str, Any],
        expected_text: str,
        msg: str = ""
    ) -> None:
        """Assert error message contains expected text."""
        error = result.get("error", "")
        if expected_text not in error:
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Expected error to contain '{expected_text}', got: {error}"
            )
        self._assertions_passed += 1


class PipelineTestCase(ABC):
    """
    Base class for testing complete pipelines (multi-step).

    Example:
        class TestUsageCostPipeline(PipelineTestCase):
            pipeline_path = "configs/openai/cost/usage_cost.yml"

            async def test_full_pipeline(self):
                result = await self.execute_pipeline(
                    org_slug="test_org",
                    parameters={"start_date": "2025-01-01"}
                )
                self.assert_all_steps_passed(result)
    """

    pipeline_path: str = ""

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self._assertions_passed = 0
        self._assertions_failed = 0

    def setup(self) -> None:
        """Override for test setup."""
        pass

    def teardown(self) -> None:
        """Override for test cleanup."""
        pass

    async def execute_pipeline(
        self,
        org_slug: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute the full pipeline.

        Uses AsyncPipelineExecutor internally.
        """
        from src.core.abstractor.config_loader import ConfigLoader
        from src.core.pipeline.async_executor import AsyncPipelineExecutor

        if not self.pipeline_path:
            raise ValueError("pipeline_path must be set in test class")

        # Load config
        loader = ConfigLoader()
        config = loader.load_pipeline_config(org_slug, self.pipeline_path)

        # Execute
        executor = AsyncPipelineExecutor(
            org_slug=org_slug,
            pipeline_config=config.model_dump(),
            parameters=parameters or {}
        )

        return await executor.execute()

    def assert_all_steps_passed(self, result: Dict[str, Any], msg: str = "") -> None:
        """Assert all pipeline steps completed successfully."""
        status = result.get("status", "")
        if status != "COMPLETED":
            failed_steps = [
                s.get("step_id") for s in result.get("steps", [])
                if s.get("status") != "SUCCESS"
            ]
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Pipeline failed. Failed steps: {failed_steps}"
            )
        self._assertions_passed += 1

    def assert_step_passed(
        self,
        result: Dict[str, Any],
        step_id: str,
        msg: str = ""
    ) -> None:
        """Assert a specific step passed."""
        steps = result.get("steps", [])
        step = next((s for s in steps if s.get("step_id") == step_id), None)

        if not step:
            self._assertions_failed += 1
            raise AssertionError(msg or f"Step '{step_id}' not found")

        if step.get("status") != "SUCCESS":
            self._assertions_failed += 1
            raise AssertionError(
                msg or f"Step '{step_id}' failed: {step.get('error')}"
            )
        self._assertions_passed += 1
