"""
Tests for usage MCP tools — placeholder tests.
The usage tools follow the same pattern as cost tools.
"""

import pytest


class TestUsageToolsExist:
    def test_genai_usage_importable(self):
        from src.core.tools.usage import genai_usage
        assert callable(genai_usage)

    def test_quota_status_importable(self):
        from src.core.tools.usage import quota_status
        assert callable(quota_status)

    def test_top_consumers_importable(self):
        from src.core.tools.usage import top_consumers
        assert callable(top_consumers)

    def test_pipeline_runs_importable(self):
        from src.core.tools.usage import pipeline_runs
        assert callable(pipeline_runs)
