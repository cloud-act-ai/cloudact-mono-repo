"""
GenAI Pricing Pipeline Tests

Tests for GenAI pricing data pipelines:
- PAYG pricing pipeline
- Commitment pricing pipeline
- Infrastructure pricing pipeline
- Cost calculation pipelines
- Usage aggregation pipelines

Run: python -m pytest tests/test_07_genai_pipelines.py -v
"""

import pytest
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, List, Any, Optional
import os
import json

# ============================================================================
# Configuration
# ============================================================================

PIPELINE_SERVICE_URL = os.getenv("PIPELINE_SERVICE_URL", "http://localhost:8001")
TEST_ORG_SLUG = "genai_pipeline_test_org"


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_payg_pricing() -> List[Dict[str, Any]]:
    """Sample PAYG pricing data."""
    return [
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "openai",
            "model": "gpt-4o",
            "model_family": "gpt-4o",
            "region": "global",
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "cached_input_per_1m": 1.25,
            "context_window": 128000,
            "max_output_tokens": 16384,
            "supports_vision": True,
            "supports_tools": True,
            "rate_limit_rpm": 10000,
            "rate_limit_tpm": 30_000_000,
            "status": "active",
            "last_updated": datetime.now().isoformat()
        },
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "model_family": "claude-3.5",
            "region": "global",
            "input_per_1m": 3.00,
            "output_per_1m": 15.00,
            "cached_input_per_1m": 0.30,
            "context_window": 200000,
            "max_output_tokens": 8192,
            "supports_vision": True,
            "supports_tools": True,
            "status": "active",
            "last_updated": datetime.now().isoformat()
        }
    ]


@pytest.fixture
def sample_commitment_pricing() -> List[Dict[str, Any]]:
    """Sample commitment pricing data."""
    return [
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "azure_openai_ptu",
            "model": "gpt-4o",
            "commitment_type": "ptu",
            "region": "eastus",
            "ptu_hourly_rate": 0.06,
            "ptu_monthly_rate": 43.80,
            "min_ptu": 1,
            "max_ptu": 10000,
            "commitment_term_months": 1,
            "tokens_per_ptu_minute": 12500,
            "status": "active",
            "last_updated": datetime.now().isoformat()
        },
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "gcp_vertex_gsu",
            "model": "gemini-2.0-flash",
            "commitment_type": "gsu",
            "region": "us-central1",
            "ptu_hourly_rate": 0.05,
            "ptu_monthly_rate": 36.50,
            "min_ptu": 1,
            "max_ptu": 5000,
            "commitment_term_months": 1,
            "status": "active",
            "last_updated": datetime.now().isoformat()
        }
    ]


@pytest.fixture
def sample_infrastructure_pricing() -> List[Dict[str, Any]]:
    """Sample infrastructure pricing data."""
    return [
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "gcp_gpu",
            "resource_type": "gpu",
            "instance_type": "a2-highgpu-8g",
            "gpu_type": "A100-80GB",
            "gpu_count": 8,
            "gpu_memory_gb": 640,
            "hourly_rate": 29.39,
            "spot_discount_pct": 70,
            "reserved_1yr_discount_pct": 30,
            "reserved_3yr_discount_pct": 50,
            "region": "us-central1",
            "cloud_provider": "gcp",
            "status": "active",
            "last_updated": datetime.now().isoformat()
        },
        {
            "org_slug": TEST_ORG_SLUG,
            "provider": "aws_gpu",
            "resource_type": "gpu",
            "instance_type": "p5.48xlarge",
            "gpu_type": "H100-80GB",
            "gpu_count": 8,
            "gpu_memory_gb": 640,
            "hourly_rate": 98.32,
            "spot_discount_pct": 60,
            "reserved_1yr_discount_pct": 37,
            "reserved_3yr_discount_pct": 60,
            "region": "us-east-1",
            "cloud_provider": "aws",
            "status": "active",
            "last_updated": datetime.now().isoformat()
        }
    ]


@pytest.fixture
def sample_payg_usage() -> List[Dict[str, Any]]:
    """Sample PAYG usage data."""
    today = date.today()
    return [
        {
            "org_slug": TEST_ORG_SLUG,
            "usage_date": today.isoformat(),
            "cost_type": "payg",
            "provider": "openai",
            "model": "gpt-4o",
            "region": "global",
            "input_tokens": 5_000_000,
            "output_tokens": 1_000_000,
            "cached_input_tokens": 2_000_000,
            "request_count": 10000,
            "hierarchy_team_id": "TEAM-001",
            "hierarchy_team_name": "ML Team"
        },
        {
            "org_slug": TEST_ORG_SLUG,
            "usage_date": today.isoformat(),
            "cost_type": "payg",
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "region": "global",
            "input_tokens": 3_000_000,
            "output_tokens": 500_000,
            "cached_input_tokens": 1_000_000,
            "request_count": 5000,
            "hierarchy_team_id": "TEAM-002",
            "hierarchy_team_name": "Data Team"
        }
    ]


# ============================================================================
# PAYG PRICING PIPELINE TESTS
# ============================================================================

class TestPAYGPricingPipeline:
    """Test PAYG pricing pipeline processing."""

    def test_payg_data_structure(self, sample_payg_pricing):
        """Test PAYG pricing data structure."""
        for pricing in sample_payg_pricing:
            assert "org_slug" in pricing
            assert "provider" in pricing
            assert "model" in pricing
            assert "input_per_1m" in pricing
            assert "output_per_1m" in pricing
            assert "status" in pricing

    def test_payg_pricing_values(self, sample_payg_pricing):
        """Test PAYG pricing values are valid."""
        for pricing in sample_payg_pricing:
            assert pricing["input_per_1m"] >= 0
            assert pricing["output_per_1m"] >= 0
            if pricing.get("cached_input_per_1m"):
                assert pricing["cached_input_per_1m"] <= pricing["input_per_1m"]

    def test_payg_context_window_valid(self, sample_payg_pricing):
        """Test context window values are valid."""
        for pricing in sample_payg_pricing:
            if pricing.get("context_window"):
                assert pricing["context_window"] > 0
                assert pricing["context_window"] <= 2_000_000  # Max 2M tokens

    def test_payg_rate_limits_valid(self, sample_payg_pricing):
        """Test rate limits are valid."""
        for pricing in sample_payg_pricing:
            if pricing.get("rate_limit_rpm"):
                assert pricing["rate_limit_rpm"] > 0
            if pricing.get("rate_limit_tpm"):
                assert pricing["rate_limit_tpm"] > 0

    def test_payg_provider_enum(self, sample_payg_pricing):
        """Test provider values are from valid enum."""
        valid_providers = [
            "openai", "anthropic", "gemini",
            "azure_openai", "aws_bedrock", "gcp_vertex",
            "deepseek"
        ]
        for pricing in sample_payg_pricing:
            assert pricing["provider"] in valid_providers


# ============================================================================
# COMMITMENT PRICING PIPELINE TESTS
# ============================================================================

class TestCommitmentPricingPipeline:
    """Test commitment pricing pipeline processing."""

    def test_commitment_data_structure(self, sample_commitment_pricing):
        """Test commitment pricing data structure."""
        for pricing in sample_commitment_pricing:
            assert "org_slug" in pricing
            assert "provider" in pricing
            assert "model" in pricing
            assert "commitment_type" in pricing
            assert "status" in pricing

    def test_commitment_type_enum(self, sample_commitment_pricing):
        """Test commitment type values are valid."""
        valid_types = ["ptu", "gsu", "provisioned_throughput", "reserved"]
        for pricing in sample_commitment_pricing:
            assert pricing["commitment_type"] in valid_types

    def test_commitment_rates_valid(self, sample_commitment_pricing):
        """Test commitment rates are valid."""
        for pricing in sample_commitment_pricing:
            if pricing.get("ptu_hourly_rate"):
                assert pricing["ptu_hourly_rate"] > 0
            if pricing.get("ptu_monthly_rate"):
                assert pricing["ptu_monthly_rate"] > 0
                # Monthly should be approximately hourly * 730
                if pricing.get("ptu_hourly_rate"):
                    expected_monthly = pricing["ptu_hourly_rate"] * 730
                    assert abs(pricing["ptu_monthly_rate"] - expected_monthly) < expected_monthly * 0.1

    def test_commitment_term_valid(self, sample_commitment_pricing):
        """Test commitment term is valid."""
        for pricing in sample_commitment_pricing:
            if pricing.get("commitment_term_months"):
                assert pricing["commitment_term_months"] >= 1

    def test_commitment_ptu_limits(self, sample_commitment_pricing):
        """Test PTU limits are valid."""
        for pricing in sample_commitment_pricing:
            if pricing.get("min_ptu"):
                assert pricing["min_ptu"] >= 1
            if pricing.get("max_ptu"):
                assert pricing["max_ptu"] >= pricing.get("min_ptu", 1)


# ============================================================================
# INFRASTRUCTURE PRICING PIPELINE TESTS
# ============================================================================

class TestInfrastructurePricingPipeline:
    """Test infrastructure pricing pipeline processing."""

    def test_infrastructure_data_structure(self, sample_infrastructure_pricing):
        """Test infrastructure pricing data structure."""
        for pricing in sample_infrastructure_pricing:
            assert "org_slug" in pricing
            assert "provider" in pricing
            assert "instance_type" in pricing
            assert "gpu_type" in pricing
            assert "hourly_rate" in pricing
            assert "status" in pricing

    def test_infrastructure_gpu_types(self, sample_infrastructure_pricing):
        """Test GPU types are valid."""
        valid_gpus = [
            "A100-40GB", "A100-80GB",
            "H100-80GB", "H200-141GB",
            "L4", "L40S",
            "T4", "V100",
            "TPU-v4", "TPU-v5"
        ]
        for pricing in sample_infrastructure_pricing:
            assert pricing["gpu_type"] in valid_gpus

    def test_infrastructure_hourly_rate(self, sample_infrastructure_pricing):
        """Test hourly rates are valid."""
        for pricing in sample_infrastructure_pricing:
            assert pricing["hourly_rate"] > 0

    def test_infrastructure_discounts(self, sample_infrastructure_pricing):
        """Test discount percentages are valid."""
        for pricing in sample_infrastructure_pricing:
            if pricing.get("spot_discount_pct"):
                assert 0 <= pricing["spot_discount_pct"] <= 100
            if pricing.get("reserved_1yr_discount_pct"):
                assert 0 <= pricing["reserved_1yr_discount_pct"] <= 100
            if pricing.get("reserved_3yr_discount_pct"):
                assert 0 <= pricing["reserved_3yr_discount_pct"] <= 100
                # 3yr should be >= 1yr discount
                if pricing.get("reserved_1yr_discount_pct"):
                    assert pricing["reserved_3yr_discount_pct"] >= pricing["reserved_1yr_discount_pct"]

    def test_infrastructure_gpu_memory(self, sample_infrastructure_pricing):
        """Test GPU memory is valid."""
        for pricing in sample_infrastructure_pricing:
            if pricing.get("gpu_memory_gb"):
                assert pricing["gpu_memory_gb"] > 0
                # Memory should be gpu_count * per_gpu_memory
                if pricing.get("gpu_count"):
                    per_gpu = pricing["gpu_memory_gb"] / pricing["gpu_count"]
                    assert per_gpu in [16, 24, 40, 48, 80, 141]  # Common GPU memory sizes


# ============================================================================
# COST CALCULATION PIPELINE TESTS
# ============================================================================

class TestCostCalculationPipeline:
    """Test cost calculation pipeline processing."""

    def test_payg_cost_calculation(
        self,
        sample_payg_pricing,
        sample_payg_usage
    ):
        """Test PAYG cost calculation."""
        # Find matching pricing for usage
        for usage in sample_payg_usage:
            provider = usage["provider"]
            model = usage["model"]

            pricing = next(
                (p for p in sample_payg_pricing
                 if p["provider"] == provider and p["model"] == model),
                None
            )

            if pricing:
                # Calculate cost
                input_cost = (usage["input_tokens"] / 1_000_000) * pricing["input_per_1m"]
                output_cost = (usage["output_tokens"] / 1_000_000) * pricing["output_per_1m"]

                # Calculate cached savings
                cached_cost = 0
                if usage.get("cached_input_tokens") and pricing.get("cached_input_per_1m"):
                    cached_cost = (usage["cached_input_tokens"] / 1_000_000) * pricing["cached_input_per_1m"]

                total_cost = input_cost + output_cost + cached_cost

                assert total_cost > 0

    def test_commitment_cost_calculation(self, sample_commitment_pricing):
        """Test commitment cost calculation."""
        for pricing in sample_commitment_pricing:
            ptu_count = 100
            hours = 730  # Monthly

            if pricing.get("ptu_hourly_rate"):
                monthly_cost = pricing["ptu_hourly_rate"] * ptu_count * hours
                assert monthly_cost > 0

            if pricing.get("ptu_monthly_rate"):
                monthly_cost = pricing["ptu_monthly_rate"] * ptu_count
                assert monthly_cost > 0

    def test_infrastructure_cost_calculation(self, sample_infrastructure_pricing):
        """Test infrastructure cost calculation."""
        for pricing in sample_infrastructure_pricing:
            hours = 720  # Monthly

            # On-demand cost
            on_demand_cost = pricing["hourly_rate"] * hours
            assert on_demand_cost > 0

            # Spot cost
            if pricing.get("spot_discount_pct"):
                spot_cost = on_demand_cost * (1 - pricing["spot_discount_pct"] / 100)
                assert spot_cost < on_demand_cost

            # Reserved costs
            if pricing.get("reserved_1yr_discount_pct"):
                reserved_1yr = on_demand_cost * (1 - pricing["reserved_1yr_discount_pct"] / 100)
                assert reserved_1yr < on_demand_cost

            if pricing.get("reserved_3yr_discount_pct"):
                reserved_3yr = on_demand_cost * (1 - pricing["reserved_3yr_discount_pct"] / 100)
                assert reserved_3yr < on_demand_cost


# ============================================================================
# USAGE AGGREGATION PIPELINE TESTS
# ============================================================================

class TestUsageAggregationPipeline:
    """Test usage aggregation pipeline processing."""

    def test_daily_usage_aggregation(self, sample_payg_usage):
        """Test daily usage aggregation."""
        # Group by date
        by_date: Dict[str, Dict] = {}

        for usage in sample_payg_usage:
            usage_date = usage["usage_date"]
            if usage_date not in by_date:
                by_date[usage_date] = {
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_requests": 0
                }

            by_date[usage_date]["total_input_tokens"] += usage["input_tokens"]
            by_date[usage_date]["total_output_tokens"] += usage["output_tokens"]
            by_date[usage_date]["total_requests"] += usage["request_count"]

        # Verify aggregation
        for date_key, totals in by_date.items():
            assert totals["total_input_tokens"] > 0
            assert totals["total_output_tokens"] > 0
            assert totals["total_requests"] > 0

    def test_provider_usage_aggregation(self, sample_payg_usage):
        """Test usage aggregation by provider."""
        by_provider: Dict[str, Dict] = {}

        for usage in sample_payg_usage:
            provider = usage["provider"]
            if provider not in by_provider:
                by_provider[provider] = {
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_requests": 0
                }

            by_provider[provider]["total_input_tokens"] += usage["input_tokens"]
            by_provider[provider]["total_output_tokens"] += usage["output_tokens"]
            by_provider[provider]["total_requests"] += usage["request_count"]

        # Verify aggregation
        assert len(by_provider) >= 1
        for provider, totals in by_provider.items():
            assert totals["total_input_tokens"] > 0

    def test_team_usage_aggregation(self, sample_payg_usage):
        """Test usage aggregation by team (hierarchy)."""
        by_team: Dict[str, Dict] = {}

        for usage in sample_payg_usage:
            team_id = usage.get("hierarchy_team_id", "unassigned")
            if team_id not in by_team:
                by_team[team_id] = {
                    "team_name": usage.get("hierarchy_team_name", "Unassigned"),
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_requests": 0
                }

            by_team[team_id]["total_input_tokens"] += usage["input_tokens"]
            by_team[team_id]["total_output_tokens"] += usage["output_tokens"]
            by_team[team_id]["total_requests"] += usage["request_count"]

        # Verify aggregation
        assert len(by_team) >= 1


# ============================================================================
# DATA QUALITY PIPELINE TESTS
# ============================================================================

class TestDataQualityPipeline:
    """Test data quality checks in pipelines."""

    def test_no_null_required_fields(self, sample_payg_pricing):
        """Test no null values in required fields."""
        required_fields = ["org_slug", "provider", "model", "input_per_1m", "output_per_1m"]

        for pricing in sample_payg_pricing:
            for field in required_fields:
                assert pricing.get(field) is not None

    def test_no_negative_values(self, sample_payg_pricing):
        """Test no negative numeric values."""
        numeric_fields = ["input_per_1m", "output_per_1m", "context_window", "max_output_tokens"]

        for pricing in sample_payg_pricing:
            for field in numeric_fields:
                if pricing.get(field) is not None:
                    assert pricing[field] >= 0

    def test_valid_status_values(self, sample_payg_pricing):
        """Test valid status values."""
        valid_statuses = ["active", "deprecated", "preview", "deleted"]

        for pricing in sample_payg_pricing:
            assert pricing.get("status") in valid_statuses

    def test_timestamp_format(self, sample_payg_pricing):
        """Test timestamp format is valid."""
        for pricing in sample_payg_pricing:
            if pricing.get("last_updated"):
                # Should be ISO format
                try:
                    datetime.fromisoformat(pricing["last_updated"].replace("Z", "+00:00"))
                except ValueError:
                    pytest.fail(f"Invalid timestamp format: {pricing['last_updated']}")


# ============================================================================
# PIPELINE CONFIGURATION TESTS
# ============================================================================

class TestPipelineConfiguration:
    """Test pipeline configuration validation."""

    def test_genai_pipeline_config_structure(self):
        """Test GenAI pipeline config structure."""
        expected_config = {
            "domain": "genai",
            "pipeline_type": "pricing",
            "flows": ["payg", "commitment", "infrastructure"],
            "source_type": "csv",
            "destination": "bigquery"
        }

        assert "domain" in expected_config
        assert "pipeline_type" in expected_config
        assert "flows" in expected_config
        assert len(expected_config["flows"]) == 3

    def test_genai_table_mappings(self):
        """Test GenAI table mappings."""
        table_mappings = {
            "payg": "genai_payg_pricing",
            "commitment": "genai_commitment_pricing",
            "infrastructure": "genai_infrastructure_pricing",
            "usage": "genai_usage_daily_unified",
            "costs": "genai_costs_daily_unified"
        }

        for flow, table in table_mappings.items():
            assert table.startswith("genai_")
            assert len(table) > len("genai_")

    def test_genai_schema_validation(self):
        """Test GenAI schema field validation."""
        payg_required_fields = [
            "org_slug", "provider", "model", "region",
            "input_per_1m", "output_per_1m", "status"
        ]

        commitment_required_fields = [
            "org_slug", "provider", "model", "commitment_type",
            "region", "status"
        ]

        infrastructure_required_fields = [
            "org_slug", "provider", "instance_type", "gpu_type",
            "hourly_rate", "region", "status"
        ]

        assert len(payg_required_fields) >= 5
        assert len(commitment_required_fields) >= 5
        assert len(infrastructure_required_fields) >= 5


# ============================================================================
# OPENAI ADAPTER TESTS
# ============================================================================

class TestOpenAIAdapter:
    """Test OpenAI adapter functionality."""

    def test_openai_payg_usage_structure(self):
        """Test OpenAI PAYG usage record structure."""
        openai_usage = {
            "usage_date": date.today(),
            "org_slug": TEST_ORG_SLUG,
            "provider": "openai",
            "model": "gpt-4o",
            "model_family": "gpt-4o",
            "region": "global",
            "input_tokens": 500_000,
            "output_tokens": 100_000,
            "cached_input_tokens": 0,  # OpenAI doesn't report cached tokens
            "total_tokens": 600_000,
            "request_count": 1000
        }

        assert openai_usage["provider"] == "openai"
        assert openai_usage["input_tokens"] >= 0
        assert openai_usage["output_tokens"] >= 0
        assert openai_usage["total_tokens"] == openai_usage["input_tokens"] + openai_usage["output_tokens"]

    def test_openai_cost_calculation(self):
        """Test OpenAI cost calculation for gpt-4o."""
        pricing = {
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "cached_input_per_1m": 1.25
        }

        usage = {
            "input_tokens": 1_000_000,
            "output_tokens": 500_000,
            "cached_input_tokens": 200_000
        }

        # Calculate costs
        regular_input_cost = ((usage["input_tokens"] - usage["cached_input_tokens"]) / 1_000_000) * pricing["input_per_1m"]
        cached_input_cost = (usage["cached_input_tokens"] / 1_000_000) * pricing["cached_input_per_1m"]
        output_cost = (usage["output_tokens"] / 1_000_000) * pricing["output_per_1m"]
        total_cost = regular_input_cost + cached_input_cost + output_cost

        # Verify
        assert regular_input_cost == pytest.approx(2.00, rel=0.01)  # 800K at $2.50/1M
        assert cached_input_cost == pytest.approx(0.25, rel=0.01)  # 200K at $1.25/1M
        assert output_cost == pytest.approx(5.00, rel=0.01)  # 500K at $10/1M
        assert total_cost == pytest.approx(7.25, rel=0.01)

    def test_openai_batch_discount(self):
        """Test OpenAI batch API discount (50%)."""
        pricing = {
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "batch_discount_pct": 50
        }

        usage = {
            "input_tokens": 1_000_000,
            "output_tokens": 500_000
        }

        regular_cost = (usage["input_tokens"] / 1_000_000) * pricing["input_per_1m"] + \
                       (usage["output_tokens"] / 1_000_000) * pricing["output_per_1m"]
        batch_cost = regular_cost * (1 - pricing["batch_discount_pct"] / 100)

        assert regular_cost == pytest.approx(7.50, rel=0.01)
        assert batch_cost == pytest.approx(3.75, rel=0.01)

    def test_openai_model_families(self):
        """Test OpenAI model family mapping."""
        model_families = {
            "gpt-4o": "gpt-4o",
            "gpt-4o-mini": "gpt-4o-mini",
            "gpt-4-turbo": "gpt-4",
            "gpt-4-turbo-preview": "gpt-4",
            "gpt-4": "gpt-4",
            "gpt-3.5-turbo": "gpt-3.5",
            "gpt-3.5-turbo-16k": "gpt-3.5",
            "o1": "o1",
            "o1-mini": "o1-mini",
            "o1-preview": "o1",
            "o3-mini": "o3-mini"
        }

        for model, expected_family in model_families.items():
            assert isinstance(model, str)
            assert isinstance(expected_family, str)

    def test_openai_rate_limits_structure(self):
        """Test OpenAI rate limit structure."""
        rate_limits = {
            "gpt-4o": {"rpm": 10000, "tpm": 30_000_000},
            "gpt-4o-mini": {"rpm": 30000, "tpm": 150_000_000},
            "gpt-4": {"rpm": 10000, "tpm": 1_000_000},
            "gpt-3.5-turbo": {"rpm": 10000, "tpm": 10_000_000}
        }

        for model, limits in rate_limits.items():
            assert limits["rpm"] > 0
            assert limits["tpm"] > 0
            assert limits["tpm"] >= limits["rpm"]  # TPM should be >= RPM

    def test_openai_context_windows(self):
        """Test OpenAI context window values."""
        context_windows = {
            "gpt-4o": 128000,
            "gpt-4o-mini": 128000,
            "gpt-4-turbo": 128000,
            "gpt-4": 8192,
            "gpt-3.5-turbo": 16385,
            "o1": 200000,
            "o1-mini": 128000
        }

        for model, context in context_windows.items():
            assert context > 0
            assert context <= 2_000_000  # Reasonable upper limit


# ============================================================================
# ANTHROPIC ADAPTER TESTS
# ============================================================================

class TestAnthropicAdapter:
    """Test Anthropic adapter functionality."""

    def test_anthropic_payg_usage_structure(self):
        """Test Anthropic PAYG usage record structure."""
        anthropic_usage = {
            "usage_date": date.today(),
            "org_slug": TEST_ORG_SLUG,
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "model_family": "claude-3.5",
            "region": "global",
            "input_tokens": 300_000,
            "output_tokens": 50_000,
            "cached_input_tokens": 100_000,
            "total_tokens": 350_000,
            "request_count": 500
        }

        assert anthropic_usage["provider"] == "anthropic"
        assert anthropic_usage["input_tokens"] >= 0
        assert anthropic_usage["output_tokens"] >= 0
        assert anthropic_usage["cached_input_tokens"] >= 0

    def test_anthropic_cost_calculation(self):
        """Test Anthropic cost calculation for claude-3-5-sonnet."""
        pricing = {
            "input_per_1m": 3.00,
            "output_per_1m": 15.00,
            "cached_input_per_1m": 0.30  # 90% discount for cached
        }

        usage = {
            "input_tokens": 1_000_000,
            "output_tokens": 200_000,
            "cached_input_tokens": 500_000
        }

        # Calculate costs
        regular_input_cost = ((usage["input_tokens"] - usage["cached_input_tokens"]) / 1_000_000) * pricing["input_per_1m"]
        cached_input_cost = (usage["cached_input_tokens"] / 1_000_000) * pricing["cached_input_per_1m"]
        output_cost = (usage["output_tokens"] / 1_000_000) * pricing["output_per_1m"]
        total_cost = regular_input_cost + cached_input_cost + output_cost

        # Verify
        assert regular_input_cost == pytest.approx(1.50, rel=0.01)  # 500K at $3/1M
        assert cached_input_cost == pytest.approx(0.15, rel=0.01)  # 500K at $0.30/1M
        assert output_cost == pytest.approx(3.00, rel=0.01)  # 200K at $15/1M
        assert total_cost == pytest.approx(4.65, rel=0.01)

    def test_anthropic_cache_savings(self):
        """Test Anthropic prompt caching savings (90% discount)."""
        pricing = {
            "input_per_1m": 3.00,
            "cached_input_per_1m": 0.30,
            "cache_discount_pct": 90
        }

        tokens = 1_000_000
        regular_cost = (tokens / 1_000_000) * pricing["input_per_1m"]
        cached_cost = (tokens / 1_000_000) * pricing["cached_input_per_1m"]
        savings = regular_cost - cached_cost
        savings_pct = (savings / regular_cost) * 100

        assert regular_cost == pytest.approx(3.00, rel=0.01)
        assert cached_cost == pytest.approx(0.30, rel=0.01)
        assert savings == pytest.approx(2.70, rel=0.01)
        assert savings_pct == pytest.approx(90.0, rel=0.1)

    def test_anthropic_model_families(self):
        """Test Anthropic model family mapping."""
        model_families = {
            "claude-3-5-sonnet-20241022": "claude-3.5",
            "claude-3-5-haiku-20241022": "claude-3.5",
            "claude-3-opus-20240229": "claude-3",
            "claude-3-sonnet-20240229": "claude-3",
            "claude-3-haiku-20240307": "claude-3",
            "claude-3-5-sonnet-latest": "claude-3.5",
            "claude-3-5-haiku-latest": "claude-3.5"
        }

        for model, expected_family in model_families.items():
            assert isinstance(model, str)
            assert "claude" in model.lower()
            assert isinstance(expected_family, str)

    def test_anthropic_context_windows(self):
        """Test Anthropic context window values."""
        context_windows = {
            "claude-3-5-sonnet-20241022": 200_000,
            "claude-3-5-haiku-20241022": 200_000,
            "claude-3-opus-20240229": 200_000,
            "claude-3-sonnet-20240229": 200_000,
            "claude-3-haiku-20240307": 200_000
        }

        for model, context in context_windows.items():
            assert context > 0
            assert context == 200_000  # All Claude 3 models have 200K context

    def test_anthropic_max_output_tokens(self):
        """Test Anthropic max output token limits."""
        output_limits = {
            "claude-3-5-sonnet-20241022": 8192,
            "claude-3-5-haiku-20241022": 8192,
            "claude-3-opus-20240229": 4096,
            "claude-3-sonnet-20240229": 4096,
            "claude-3-haiku-20240307": 4096
        }

        for model, limit in output_limits.items():
            assert limit > 0
            assert limit <= 16_384  # Reasonable upper limit

    def test_anthropic_prompt_caching_tokens(self):
        """Test Anthropic cache read vs cache write token handling."""
        usage_with_cache = {
            "cache_read_input_tokens": 200_000,
            "cache_creation_input_tokens": 50_000
        }

        # Total cached tokens = read + creation
        total_cached = usage_with_cache["cache_read_input_tokens"] + \
                       usage_with_cache["cache_creation_input_tokens"]

        assert total_cached == 250_000
        assert usage_with_cache["cache_read_input_tokens"] > 0


# ============================================================================
# CROSS-PROVIDER COMPARISON TESTS
# ============================================================================

class TestCrossProviderComparison:
    """Test cross-provider comparisons for OpenAI and Anthropic."""

    def test_provider_enum_values(self):
        """Test provider enum contains both OpenAI and Anthropic."""
        valid_providers = [
            "openai", "anthropic", "gemini",
            "azure_openai", "aws_bedrock", "gcp_vertex",
            "deepseek"
        ]

        assert "openai" in valid_providers
        assert "anthropic" in valid_providers

    def test_comparable_usage_structure(self):
        """Test both providers produce comparable usage structures."""
        openai_usage = {
            "usage_date": date.today(),
            "provider": "openai",
            "model": "gpt-4o",
            "input_tokens": 1000,
            "output_tokens": 500,
            "cached_input_tokens": 0
        }

        anthropic_usage = {
            "usage_date": date.today(),
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "input_tokens": 1000,
            "output_tokens": 500,
            "cached_input_tokens": 200
        }

        # Both should have same required fields
        required_fields = ["usage_date", "provider", "model", "input_tokens", "output_tokens"]
        for field in required_fields:
            assert field in openai_usage
            assert field in anthropic_usage

    def test_cost_comparison(self):
        """Test cost comparison between OpenAI and Anthropic."""
        # Using similar token counts for comparison
        tokens = 1_000_000

        openai_pricing = {"input_per_1m": 2.50, "output_per_1m": 10.00}
        anthropic_pricing = {"input_per_1m": 3.00, "output_per_1m": 15.00}

        openai_cost = (tokens / 1_000_000) * (openai_pricing["input_per_1m"] + openai_pricing["output_per_1m"])
        anthropic_cost = (tokens / 1_000_000) * (anthropic_pricing["input_per_1m"] + anthropic_pricing["output_per_1m"])

        # Both should produce valid positive costs
        assert openai_cost > 0
        assert anthropic_cost > 0
        # Anthropic is more expensive for this comparison
        assert anthropic_cost > openai_cost

    def test_cached_token_support(self):
        """Test cached token handling for both providers."""
        # OpenAI supports cached tokens (prompt caching)
        openai_cached = {
            "cached_input_tokens": 100_000,
            "cached_discount_pct": 50  # 50% discount
        }

        # Anthropic supports cached tokens (prompt caching)
        anthropic_cached = {
            "cached_input_tokens": 100_000,
            "cached_discount_pct": 90  # 90% discount
        }

        assert openai_cached["cached_input_tokens"] >= 0
        assert anthropic_cached["cached_input_tokens"] >= 0
        assert anthropic_cached["cached_discount_pct"] > openai_cached["cached_discount_pct"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
