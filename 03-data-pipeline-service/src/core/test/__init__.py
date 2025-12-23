"""
Pipeline Testing Framework

Lightweight testing utilities for pipeline processors.
Works with existing processors without modification.

Usage:
    from src.core.test import ProcessorTestCase, MockContext

    class TestOpenAIUsage(ProcessorTestCase):
        processor_module = "src.core.processors.openai.usage"

        async def test_execute_success(self):
            result = await self.execute_processor(
                step_config={"config": {"start_date": "2025-01-01"}},
                context=MockContext(org_slug="test_org")
            )
            self.assert_success(result)
"""

from src.core.test.definition import (
    ProcessorTestCase,
    PipelineTestCase,
    TestResult,
)
from src.core.test.fixtures import (
    MockContext,
    MockBigQueryClient,
    mock_api_response,
)
from src.core.test.runner import (
    TestRunner,
    run_processor_tests,
)

__all__ = [
    "ProcessorTestCase",
    "PipelineTestCase",
    "TestResult",
    "MockContext",
    "MockBigQueryClient",
    "mock_api_response",
    "TestRunner",
    "run_processor_tests",
]
