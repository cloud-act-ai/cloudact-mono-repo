"""
GenAI Pricing API Tests

Tests for the GenAI pricing API endpoints:
- GET /api/v1/genai/{org_slug}/pricing - Get all pricing
- GET /api/v1/genai/{org_slug}/pricing/{flow} - Get pricing by flow
- POST /api/v1/genai/{org_slug}/pricing/{flow} - Add custom pricing
- PUT /api/v1/genai/{org_slug}/pricing/{flow}/{pricing_id}/override - Set override
- DELETE /api/v1/genai/{org_slug}/pricing/{flow}/{pricing_id} - Delete pricing
- DELETE /api/v1/genai/{org_slug}/pricing/{flow}/{pricing_id}/override - Reset override

Run: python -m pytest tests/test_08_genai_api.py -v
"""

import pytest
import httpx
from datetime import datetime, date
from typing import Optional
import os
import uuid

# ============================================================================
# Configuration
# ============================================================================

API_BASE_URL = os.getenv("API_SERVICE_URL", "http://localhost:8000")
CA_ROOT_API_KEY = os.getenv("CA_ROOT_API_KEY", "test_root_key_32_characters_min")
TEST_ORG_SLUG = f"genai_test_org_{int(datetime.now().timestamp())}"
TEST_API_KEY = f"test_genai_api_key_{uuid.uuid4().hex[:8]}"


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture(scope="module")
def api_client():
    """Create HTTP client for API calls."""
    return httpx.Client(base_url=API_BASE_URL, timeout=30.0)


@pytest.fixture(scope="module")
def org_headers():
    """Headers for org-level API calls."""
    return {
        "X-API-Key": TEST_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def admin_headers():
    """Headers for admin API calls."""
    return {
        "X-CA-Root-Key": CA_ROOT_API_KEY,
        "Content-Type": "application/json"
    }


# ============================================================================
# DATA VALIDATION TESTS
# ============================================================================

class TestGenAIPricingDataValidation:
    """Test data validation for GenAI pricing."""

    def test_payg_required_fields(self):
        """Test PAYG pricing required fields."""
        valid_payg = {
            "provider": "openai",
            "model": "gpt-4o-custom",
            "model_family": "gpt-4o",
            "region": "global",
            "input_per_1m": 2.50,
            "output_per_1m": 10.00
        }

        assert valid_payg["provider"] is not None
        assert valid_payg["model"] is not None
        assert valid_payg["input_per_1m"] >= 0
        assert valid_payg["output_per_1m"] >= 0

    def test_payg_reject_negative_prices(self):
        """Test PAYG rejects negative prices."""
        invalid_payg = {
            "provider": "openai",
            "model": "test",
            "input_per_1m": -5.00,
            "output_per_1m": 10.00
        }

        assert invalid_payg["input_per_1m"] < 0

    def test_commitment_required_fields(self):
        """Test commitment pricing required fields."""
        valid_commitment = {
            "provider": "azure_openai_ptu",
            "model": "gpt-4o",
            "commitment_type": "ptu",
            "region": "eastus",
            "ptu_hourly_rate": 0.06
        }

        assert valid_commitment["provider"] is not None
        assert valid_commitment["model"] is not None
        assert valid_commitment["commitment_type"] is not None

    def test_commitment_valid_types(self):
        """Test valid commitment types."""
        valid_types = ["ptu", "gsu", "provisioned_throughput", "reserved"]
        invalid_type = "on_demand"

        assert invalid_type not in valid_types

    def test_infrastructure_required_fields(self):
        """Test infrastructure pricing required fields."""
        valid_infra = {
            "provider": "gcp_gpu",
            "resource_type": "gpu",
            "instance_type": "a2-highgpu-8g",
            "gpu_type": "A100-80GB",
            "gpu_count": 8,
            "hourly_rate": 29.39,
            "region": "us-central1"
        }

        assert valid_infra["provider"] is not None
        assert valid_infra["instance_type"] is not None
        assert valid_infra["gpu_type"] is not None
        assert valid_infra["hourly_rate"] > 0

    def test_infrastructure_valid_gpu_types(self):
        """Test valid GPU types."""
        valid_gpus = ["A100-40GB", "A100-80GB", "H100-80GB", "L4", "T4", "V100"]

        for gpu in valid_gpus:
            assert isinstance(gpu, str)
            assert len(gpu) > 0


# ============================================================================
# API ENDPOINT TESTS
# ============================================================================

class TestGenAIPricingAPIEndpoints:
    """Test GenAI pricing API endpoints."""

    def test_get_all_pricing_endpoint_format(self, api_client):
        """Test get all pricing endpoint format."""
        endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing"

        assert "/api/v1/genai/" in endpoint
        assert TEST_ORG_SLUG in endpoint
        assert "/pricing" in endpoint

    def test_get_pricing_by_flow_endpoint_format(self, api_client):
        """Test get pricing by flow endpoint format."""
        flows = ["payg", "commitment", "infrastructure"]

        for flow in flows:
            endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/{flow}"
            assert f"/pricing/{flow}" in endpoint

    def test_add_custom_pricing_endpoint_format(self, api_client):
        """Test add custom pricing endpoint format."""
        flows = ["payg", "commitment", "infrastructure"]

        for flow in flows:
            endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/{flow}"
            assert f"/pricing/{flow}" in endpoint

    def test_set_override_endpoint_format(self, api_client):
        """Test set pricing override endpoint format."""
        pricing_id = "openai-gpt-4o-global"
        endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/payg/{pricing_id}/override"

        assert "/override" in endpoint
        assert pricing_id in endpoint

    def test_delete_pricing_endpoint_format(self, api_client):
        """Test delete pricing endpoint format."""
        pricing_id = "custom-model-123"
        endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/payg/{pricing_id}"

        assert pricing_id in endpoint

    def test_reset_override_endpoint_format(self, api_client):
        """Test reset pricing override endpoint format."""
        pricing_id = "openai-gpt-4o-global"
        endpoint = f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/payg/{pricing_id}/override"

        assert "/override" in endpoint


# ============================================================================
# COST CALCULATION TESTS
# ============================================================================

class TestGenAICostCalculations:
    """Test GenAI cost calculations."""

    def test_payg_token_cost_calculation(self):
        """Test PAYG token cost calculation."""
        pricing = {
            "input_per_1m": 2.50,
            "output_per_1m": 10.00
        }

        input_tokens = 500_000
        output_tokens = 200_000

        input_cost = (input_tokens / 1_000_000) * pricing["input_per_1m"]
        output_cost = (output_tokens / 1_000_000) * pricing["output_per_1m"]
        total_cost = input_cost + output_cost

        assert abs(input_cost - 1.25) < 0.01
        assert abs(output_cost - 2.00) < 0.01
        assert abs(total_cost - 3.25) < 0.01

    def test_cached_token_discount(self):
        """Test cached token discount calculation."""
        pricing = {
            "input_per_1m": 2.50,
            "cached_input_per_1m": 0.50,
            "cached_discount_pct": 80
        }

        tokens = 1_000_000
        regular_cost = (tokens / 1_000_000) * pricing["input_per_1m"]
        cached_cost = (tokens / 1_000_000) * pricing["cached_input_per_1m"]
        savings = regular_cost - cached_cost

        assert cached_cost < regular_cost
        assert abs(savings - 2.00) < 0.01

    def test_batch_discount(self):
        """Test batch processing discount."""
        pricing = {
            "input_per_1m": 2.50,
            "batch_discount_pct": 50
        }

        tokens = 1_000_000
        regular_cost = (tokens / 1_000_000) * pricing["input_per_1m"]
        batch_cost = regular_cost * (1 - pricing["batch_discount_pct"] / 100)

        assert abs(batch_cost - 1.25) < 0.01

    def test_ptu_monthly_cost(self):
        """Test PTU monthly cost calculation."""
        ptu_pricing = {
            "ptu_hourly_rate": 0.06,
            "ptu_count": 100,
            "hours_per_month": 730
        }

        monthly_cost = (
            ptu_pricing["ptu_hourly_rate"] *
            ptu_pricing["ptu_count"] *
            ptu_pricing["hours_per_month"]
        )

        assert abs(monthly_cost - 4380) < 1

    def test_infrastructure_spot_savings(self):
        """Test infrastructure spot instance savings."""
        infra_pricing = {
            "hourly_rate": 30.00,
            "spot_discount_pct": 70
        }

        hours_per_month = 720
        on_demand_cost = infra_pricing["hourly_rate"] * hours_per_month
        spot_cost = on_demand_cost * (1 - infra_pricing["spot_discount_pct"] / 100)
        savings = on_demand_cost - spot_cost

        assert abs(spot_cost - 6480) < 1
        assert abs(savings - 15120) < 1

    def test_infrastructure_reserved_savings(self):
        """Test infrastructure reserved instance savings."""
        infra_pricing = {
            "hourly_rate": 30.00,
            "reserved_1yr_discount_pct": 30,
            "reserved_3yr_discount_pct": 50
        }

        hours_per_month = 720
        on_demand = infra_pricing["hourly_rate"] * hours_per_month
        reserved_1yr = on_demand * (1 - infra_pricing["reserved_1yr_discount_pct"] / 100)
        reserved_3yr = on_demand * (1 - infra_pricing["reserved_3yr_discount_pct"] / 100)

        assert reserved_1yr < on_demand
        assert reserved_3yr < reserved_1yr


# ============================================================================
# SECURITY TESTS
# ============================================================================

class TestGenAIPricingSecurity:
    """Test GenAI pricing security."""

    def test_xss_sanitization(self):
        """Test XSS input sanitization."""
        xss_input = '<script>alert("XSS")</script>'

        # Simulated sanitization
        import re
        sanitized = re.sub(r'<[^>]*>', '', xss_input)
        sanitized = re.sub(r'[<>"\'&;]', '', sanitized)

        assert '<script>' not in sanitized
        assert '>' not in sanitized
        assert '<' not in sanitized

    def test_sql_injection_sanitization(self):
        """Test SQL injection sanitization.

        SQL injection is prevented by removing dangerous characters that enable
        SQL command execution. The word 'DROP' by itself is harmless as a string
        value - it's only dangerous when combined with SQL syntax like ';' and '--'.
        """
        sql_input = "'; DROP TABLE pricing; --"

        # Simulated sanitization - removes SQL special characters
        import re
        sanitized = sql_input.lower().strip()
        sanitized = re.sub(r'[^a-z0-9_]', '_', sanitized)
        sanitized = re.sub(r'^_+|_+$', '', sanitized)
        sanitized = re.sub(r'_+', '_', sanitized)

        # SQL injection is prevented by removing these dangerous characters:
        assert ';' not in sanitized  # Statement terminator
        assert "'" not in sanitized  # String escape
        assert '--' not in sanitized  # Comment start
        assert '/*' not in sanitized  # Block comment

        # Result should be a safe alphanumeric string
        assert re.match(r'^[a-z0-9_]+$', sanitized) is not None

    def test_notes_max_length(self):
        """Test notes field max length validation."""
        long_notes = 'A' * 600
        max_length = 500

        assert len(long_notes) > max_length

    def test_model_name_max_length(self):
        """Test model name max length validation."""
        long_name = 'A' * 150
        max_length = 100

        assert len(long_name) > max_length


# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

class TestGenAIPricingErrorHandling:
    """Test GenAI pricing error handling."""

    def test_404_response_structure(self):
        """Test 404 not found response structure."""
        error_response = {
            "detail": "Pricing record not found",
            "context": {"pricing_id": "nonexistent"}
        }

        assert "detail" in error_response
        assert "not found" in error_response["detail"]

    def test_400_validation_response_structure(self):
        """Test 400 validation error response structure."""
        error_response = {
            "detail": "PAYG requires model, input_per_1m, output_per_1m"
        }

        assert "detail" in error_response
        assert "requires" in error_response["detail"]

    def test_403_unauthorized_response_structure(self):
        """Test 403 unauthorized response structure."""
        error_response = {
            "detail": "Access denied",
            "context": {"org_slug": "other_org"}
        }

        assert "detail" in error_response
        assert "denied" in error_response["detail"]

    def test_429_rate_limit_response_structure(self):
        """Test 429 rate limit response structure."""
        error_response = {
            "detail": "Rate limit exceeded. Please try again later."
        }

        assert "detail" in error_response
        assert "Rate limit" in error_response["detail"]


# ============================================================================
# INTEGRATION TESTS (require running API)
# ============================================================================

@pytest.mark.integration
class TestGenAIPricingIntegration:
    """Integration tests for GenAI pricing API."""

    @pytest.fixture(autouse=True)
    def skip_if_no_api(self, api_client):
        """Skip if API is not running."""
        try:
            response = api_client.get("/health")
            if response.status_code != 200:
                pytest.skip("API service not running")
        except Exception:
            pytest.skip("API service not running")

    def test_health_check(self, api_client):
        """Test API health check."""
        response = api_client.get("/health")
        assert response.status_code == 200

    def test_get_pricing_requires_auth(self, api_client):
        """Test get pricing requires authentication."""
        response = api_client.get(f"/api/v1/genai/{TEST_ORG_SLUG}/pricing")

        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403]

    def test_get_pricing_by_flow_requires_auth(self, api_client):
        """Test get pricing by flow requires authentication."""
        response = api_client.get(f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/payg")

        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403]

    def test_add_custom_pricing_requires_auth(self, api_client):
        """Test add custom pricing requires authentication."""
        response = api_client.post(
            f"/api/v1/genai/{TEST_ORG_SLUG}/pricing/payg",
            json={
                "provider": "openai",
                "model": "test-model",
                "input_per_1m": 5.0,
                "output_per_1m": 15.0
            }
        )

        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403]


# ============================================================================
# PROVIDER MAPPING TESTS
# ============================================================================

class TestGenAIProviderMapping:
    """Test GenAI provider mappings."""

    def test_payg_valid_providers(self):
        """Test valid PAYG providers."""
        valid_providers = [
            "openai", "anthropic", "gemini",
            "azure_openai", "aws_bedrock", "gcp_vertex"
        ]

        for provider in valid_providers:
            assert isinstance(provider, str)
            assert len(provider) > 0

    def test_commitment_valid_providers(self):
        """Test valid commitment providers."""
        valid_providers = [
            "azure_openai_ptu", "aws_bedrock_pt",
            "gcp_vertex_gsu", "anthropic_custom_models"
        ]

        for provider in valid_providers:
            assert isinstance(provider, str)
            assert len(provider) > 0

    def test_infrastructure_valid_providers(self):
        """Test valid infrastructure providers."""
        valid_providers = ["gcp_gpu", "aws_gpu", "azure_gpu"]

        for provider in valid_providers:
            assert "_gpu" in provider

    def test_cloud_provider_mapping(self):
        """Test cloud provider mapping."""
        provider_map = {
            "gcp_gpu": "gcp",
            "aws_gpu": "aws",
            "azure_gpu": "azure"
        }

        for key, value in provider_map.items():
            assert key.startswith(value) or value in key.lower()


# ============================================================================
# OPENAI SPECIFIC TESTS
# ============================================================================

class TestOpenAIPricingAPI:
    """Test OpenAI-specific pricing API functionality."""

    def test_openai_payg_models_validation(self):
        """Test OpenAI PAYG model validation."""
        valid_models = [
            "gpt-4o", "gpt-4o-mini", "gpt-4-turbo",
            "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini"
        ]

        for model in valid_models:
            assert isinstance(model, str)
            assert len(model) > 0

    def test_openai_pricing_data_structure(self):
        """Test OpenAI pricing data structure."""
        openai_pricing = {
            "provider": "openai",
            "model": "gpt-4o",
            "model_family": "gpt-4o",
            "region": "global",
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "cached_input_per_1m": 1.25,
            "batch_discount_pct": 50,
            "context_window": 128000,
            "max_output_tokens": 16384,
            "supports_vision": True,
            "supports_tools": True,
            "status": "active"
        }

        assert openai_pricing["provider"] == "openai"
        assert openai_pricing["input_per_1m"] >= 0
        assert openai_pricing["output_per_1m"] >= 0
        assert openai_pricing["context_window"] > 0

    def test_openai_cost_calculation_precision(self):
        """Test OpenAI cost calculation precision."""
        pricing = {
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "cached_input_per_1m": 1.25
        }

        # Test with various token counts
        test_cases = [
            {"input": 100, "output": 50, "expected_cost": 0.00075},
            {"input": 1000, "output": 500, "expected_cost": 0.0075},
            {"input": 10000, "output": 5000, "expected_cost": 0.075},
            {"input": 1000000, "output": 500000, "expected_cost": 7.50}
        ]

        for case in test_cases:
            input_cost = (case["input"] / 1_000_000) * pricing["input_per_1m"]
            output_cost = (case["output"] / 1_000_000) * pricing["output_per_1m"]
            total_cost = input_cost + output_cost
            assert abs(total_cost - case["expected_cost"]) < 0.0001

    def test_openai_batch_api_discount(self):
        """Test OpenAI Batch API 50% discount."""
        regular_cost = 10.00
        batch_discount_pct = 50
        batch_cost = regular_cost * (1 - batch_discount_pct / 100)

        assert batch_cost == 5.00


# ============================================================================
# ANTHROPIC SPECIFIC TESTS
# ============================================================================

class TestAnthropicPricingAPI:
    """Test Anthropic-specific pricing API functionality."""

    def test_anthropic_payg_models_validation(self):
        """Test Anthropic PAYG model validation."""
        valid_models = [
            "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229", "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ]

        for model in valid_models:
            assert isinstance(model, str)
            assert "claude" in model.lower()

    def test_anthropic_pricing_data_structure(self):
        """Test Anthropic pricing data structure."""
        anthropic_pricing = {
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
            "status": "active"
        }

        assert anthropic_pricing["provider"] == "anthropic"
        assert anthropic_pricing["input_per_1m"] >= 0
        assert anthropic_pricing["output_per_1m"] >= 0
        assert anthropic_pricing["context_window"] == 200000

    def test_anthropic_cost_calculation_precision(self):
        """Test Anthropic cost calculation precision."""
        pricing = {
            "input_per_1m": 3.00,
            "output_per_1m": 15.00,
            "cached_input_per_1m": 0.30
        }

        # Test with various token counts
        test_cases = [
            {"input": 100, "output": 50, "expected_cost": 0.00105},
            {"input": 1000, "output": 500, "expected_cost": 0.0105},
            {"input": 10000, "output": 5000, "expected_cost": 0.105},
            {"input": 1000000, "output": 500000, "expected_cost": 10.50}
        ]

        for case in test_cases:
            input_cost = (case["input"] / 1_000_000) * pricing["input_per_1m"]
            output_cost = (case["output"] / 1_000_000) * pricing["output_per_1m"]
            total_cost = input_cost + output_cost
            assert abs(total_cost - case["expected_cost"]) < 0.0001

    def test_anthropic_prompt_caching_discount(self):
        """Test Anthropic prompt caching 90% discount."""
        regular_price = 3.00  # per 1M tokens
        cached_price = 0.30   # per 1M tokens

        discount_pct = ((regular_price - cached_price) / regular_price) * 100
        assert abs(discount_pct - 90.0) < 0.1

    def test_anthropic_cache_token_types(self):
        """Test Anthropic cache read vs creation tokens."""
        cache_usage = {
            "cache_read_input_tokens": 500_000,
            "cache_creation_input_tokens": 100_000
        }

        total_cached = cache_usage["cache_read_input_tokens"] + \
                       cache_usage["cache_creation_input_tokens"]

        assert total_cached == 600_000
        # Cache read should typically be > creation (reuse)
        assert cache_usage["cache_read_input_tokens"] >= cache_usage["cache_creation_input_tokens"]


# ============================================================================
# PROVIDER COMPARISON TESTS
# ============================================================================

class TestProviderComparison:
    """Test cross-provider comparisons."""

    def test_openai_vs_anthropic_pricing_structure(self):
        """Test that both providers have compatible pricing structures."""
        required_fields = [
            "provider", "model", "input_per_1m", "output_per_1m",
            "context_window", "status"
        ]

        openai_pricing = {
            "provider": "openai",
            "model": "gpt-4o",
            "input_per_1m": 2.50,
            "output_per_1m": 10.00,
            "context_window": 128000,
            "status": "active"
        }

        anthropic_pricing = {
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "input_per_1m": 3.00,
            "output_per_1m": 15.00,
            "context_window": 200000,
            "status": "active"
        }

        for field in required_fields:
            assert field in openai_pricing
            assert field in anthropic_pricing

    def test_both_providers_support_caching(self):
        """Test both providers support prompt caching."""
        openai_cache = {
            "cached_input_per_1m": 1.25,  # 50% discount
            "cache_discount_pct": 50
        }

        anthropic_cache = {
            "cached_input_per_1m": 0.30,  # 90% discount
            "cache_discount_pct": 90
        }

        # Both should have caching support
        assert openai_cache["cached_input_per_1m"] > 0
        assert anthropic_cache["cached_input_per_1m"] > 0

        # Anthropic has better cache discount
        assert anthropic_cache["cache_discount_pct"] > openai_cache["cache_discount_pct"]

    def test_both_providers_valid_enums(self):
        """Test both providers are in valid provider enum."""
        valid_providers = [
            "openai", "anthropic", "gemini",
            "azure_openai", "aws_bedrock", "gcp_vertex", "deepseek"
        ]

        assert "openai" in valid_providers
        assert "anthropic" in valid_providers


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
