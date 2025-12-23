"""
Test Runner

Discovers and executes processor tests.
Can run from CLI or programmatically.
"""

import asyncio
import importlib
import inspect
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Type

from src.core.test.definition import (
    ProcessorTestCase,
    PipelineTestCase,
    TestResult,
    TestSuiteResult,
    TestStatus,
    AssertionError,
)

logger = logging.getLogger(__name__)


class TestRunner:
    """
    Discovers and runs processor tests.

    Usage:
        runner = TestRunner()
        results = await runner.run_all()
        print(runner.format_results(results))

    Or run specific test:
        results = await runner.run_test_class(TestOpenAIUsage)
    """

    def __init__(
        self,
        test_dir: str = "tests/processors",
        verbose: bool = True
    ):
        self.test_dir = Path(test_dir)
        self.verbose = verbose
        self.logger = logging.getLogger(__name__)

    async def run_all(self) -> List[TestSuiteResult]:
        """Discover and run all processor tests."""
        test_classes = self._discover_tests()
        results = []

        for test_class in test_classes:
            result = await self.run_test_class(test_class)
            results.append(result)

        return results

    async def run_test_class(
        self,
        test_class: Type[ProcessorTestCase]
    ) -> TestSuiteResult:
        """Run all tests in a test class."""
        suite_name = test_class.__name__
        suite_result = TestSuiteResult(suite_name=suite_name)

        # Get all test methods
        test_methods = [
            method for method in dir(test_class)
            if method.startswith("test_")
        ]

        if self.verbose:
            logger.info(f"Running {suite_name} ({len(test_methods)} tests)")

        test_instance = test_class()

        for method_name in test_methods:
            result = await self._run_single_test(test_instance, method_name)
            suite_result.results.append(result)

            if self.verbose:
                status_icon = "✓" if result.passed else "✗"
                logger.info(f"  {status_icon} {method_name} ({result.duration_ms:.1f}ms)")

        suite_result.ended_at = datetime.utcnow()
        return suite_result

    async def _run_single_test(
        self,
        test_instance: ProcessorTestCase,
        method_name: str
    ) -> TestResult:
        """Run a single test method."""
        start_time = time.perf_counter()

        try:
            # Setup
            test_instance.setup()
            test_instance._assertions_passed = 0
            test_instance._assertions_failed = 0

            # Get method
            method = getattr(test_instance, method_name)

            # Run test (handle both sync and async)
            if asyncio.iscoroutinefunction(method):
                await method()
            else:
                method()

            duration_ms = (time.perf_counter() - start_time) * 1000

            return TestResult(
                test_name=method_name,
                status=TestStatus.PASSED,
                duration_ms=duration_ms,
                assertions_passed=test_instance._assertions_passed,
                assertions_failed=0,
            )

        except AssertionError as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return TestResult(
                test_name=method_name,
                status=TestStatus.FAILED,
                duration_ms=duration_ms,
                error=str(e),
                assertions_passed=test_instance._assertions_passed,
                assertions_failed=test_instance._assertions_failed,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.exception(f"Test {method_name} raised exception")
            return TestResult(
                test_name=method_name,
                status=TestStatus.ERROR,
                duration_ms=duration_ms,
                error=f"{type(e).__name__}: {str(e)}",
            )

        finally:
            # Teardown
            try:
                test_instance.teardown()
            except Exception:
                pass

    def _discover_tests(self) -> List[Type[ProcessorTestCase]]:
        """Discover all test classes in test directory."""
        test_classes = []

        if not self.test_dir.exists():
            logger.warning(f"Test directory {self.test_dir} does not exist")
            return test_classes

        for test_file in self.test_dir.glob("test_*.py"):
            module_name = f"{self.test_dir.as_posix().replace('/', '.')}.{test_file.stem}"
            try:
                module = importlib.import_module(module_name)
                for name, obj in inspect.getmembers(module, inspect.isclass):
                    if (
                        issubclass(obj, (ProcessorTestCase, PipelineTestCase))
                        and obj not in (ProcessorTestCase, PipelineTestCase)
                    ):
                        test_classes.append(obj)
            except Exception as e:
                logger.error(f"Failed to load {module_name}: {e}")

        return test_classes

    @staticmethod
    def format_results(results: List[TestSuiteResult]) -> str:
        """Format test results for display."""
        lines = ["\n" + "=" * 60, "TEST RESULTS", "=" * 60]

        total_passed = 0
        total_failed = 0

        for suite in results:
            lines.append(f"\n{suite.suite_name}")
            lines.append("-" * 40)

            for test in suite.results:
                icon = "✓" if test.passed else "✗"
                lines.append(f"  {icon} {test.test_name} ({test.duration_ms:.1f}ms)")
                if test.error:
                    lines.append(f"      Error: {test.error}")

            total_passed += suite.passed
            total_failed += suite.failed

        lines.append("\n" + "=" * 60)
        lines.append(f"TOTAL: {total_passed} passed, {total_failed} failed")
        lines.append("=" * 60)

        return "\n".join(lines)


async def run_processor_tests(
    processor_module: str,
    test_class: Optional[Type[ProcessorTestCase]] = None,
    verbose: bool = True
) -> TestSuiteResult:
    """
    Convenience function to run tests for a specific processor.

    Usage:
        results = await run_processor_tests(
            "src.core.processors.openai.usage",
            test_class=TestOpenAIUsage
        )
    """
    if test_class is None:
        raise ValueError("test_class is required")

    runner = TestRunner(verbose=verbose)
    return await runner.run_test_class(test_class)


# ==========================================
# CLI Entry Point
# ==========================================

def main():
    """CLI entry point for running tests."""
    import argparse

    parser = argparse.ArgumentParser(description="Run pipeline processor tests")
    parser.add_argument(
        "--test-dir",
        default="tests/processors",
        help="Directory containing test files"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    parser.add_argument(
        "--filter",
        help="Filter tests by name pattern"
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(message)s"
    )

    # Run tests
    runner = TestRunner(test_dir=args.test_dir, verbose=args.verbose)
    results = asyncio.run(runner.run_all())

    # Print results
    print(runner.format_results(results))

    # Exit with error code if any tests failed
    total_failed = sum(r.failed for r in results)
    exit(1 if total_failed > 0 else 0)


if __name__ == "__main__":
    main()
