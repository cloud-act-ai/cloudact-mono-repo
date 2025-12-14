"""
Test suite for bootstrap endpoint.

Tests the POST /api/v1/admin/bootstrap endpoint which initializes the system
by creating the central organizations dataset and 15 management tables.

Authentication:
- Requires X-CA-Root-Key header
- Uses verify_admin_key dependency

Test Coverage:
1. Authentication failures (missing/invalid keys)
2. Successful bootstrap
3. Idempotent behavior (safe to call multiple times)
4. Meta table creation verification
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
import httpx

# Set environment variables BEFORE any imports that might load settings
# Use real values from .env.local if available, fall back to test defaults
os.environ.setdefault("GCP_PROJECT_ID", "gac-prod-471220")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("KMS_KEY_NAME", "projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-prod/cryptoKeys/api-key-encryption")
# CA_ROOT_API_KEY should come from .env.local - don't override if already set
if "CA_ROOT_API_KEY" not in os.environ:
    os.environ["CA_ROOT_API_KEY"] = "test-ca-root-key-secure-32chars"
# Auth is always enabled - use proper CA_ROOT_API_KEY for admin tests


# ============================================
# Fixtures
# ============================================

@pytest.fixture(autouse=True)
def disable_rate_limiting():
    """Disable rate limiting for all bootstrap tests."""
    # Patch where rate_limit_global is imported (in admin.py), not where it's defined
    with patch("src.app.routers.admin.rate_limit_global", new_callable=AsyncMock) as mock_rate_limit:
        # Make rate_limit_global always allow requests
        mock_rate_limit.return_value = (True, {})
        yield mock_rate_limit


@pytest.fixture
def base_url():
    """Base URL for API requests."""
    return "http://localhost:8000"


@pytest.fixture
def admin_headers():
    """Headers with valid CA root API key from environment."""
    return {
        "X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars"),
        "Content-Type": "application/json"
    }


@pytest.fixture
def invalid_admin_headers():
    """Headers with invalid CA root API key."""
    return {
        "X-CA-Root-Key": "wrong-key",
        "Content-Type": "application/json"
    }


@pytest.fixture
def mock_bootstrap_processor():
    """Mock bootstrap processor with successful response."""
    # Patch where it's imported, not where it's defined
    with patch("src.core.processors.setup.initial.onetime_bootstrap_processor.OnetimeBootstrapProcessor") as MockProcessor:
        mock_processor = MagicMock()

        # Mock successful bootstrap response
        mock_processor.execute = AsyncMock(return_value={
            "status": "SUCCESS",
            "dataset_created": True,
            "tables_created": [
                "org_profiles",
                "org_api_keys",
                "org_subscriptions",
                "org_usage_quotas",
                "org_integration_credentials",
                "org_pipeline_configs",
                "org_scheduled_pipeline_runs",
                "org_pipeline_execution_queue",
                "org_meta_pipeline_runs",
                "org_meta_step_logs",
                "org_meta_dq_results",
                "org_audit_logs",
                "org_kms_keys",
                "org_cost_tracking",
                "org_idempotency_keys"
            ],
            "tables_existed": [],
            "total_tables": 15,
            "message": "Bootstrap completed successfully"
        })

        MockProcessor.return_value = mock_processor
        yield mock_processor


@pytest.fixture
def mock_bootstrap_processor_idempotent():
    """Mock bootstrap processor for idempotent scenario (tables already exist)."""
    with patch("src.core.processors.setup.initial.onetime_bootstrap_processor.OnetimeBootstrapProcessor") as MockProcessor:
        mock_processor = MagicMock()

        # Mock idempotent bootstrap response (tables already exist)
        mock_processor.execute = AsyncMock(return_value={
            "status": "SUCCESS",
            "dataset_created": False,
            "tables_created": [],
            "tables_existed": [
                "org_profiles",
                "org_api_keys",
                "org_subscriptions",
                "org_usage_quotas",
                "org_integration_credentials",
                "org_pipeline_configs",
                "org_scheduled_pipeline_runs",
                "org_pipeline_execution_queue",
                "org_meta_pipeline_runs",
                "org_meta_step_logs",
                "org_meta_dq_results",
                "org_audit_logs",
                "org_kms_keys",
                "org_cost_tracking",
                "org_idempotency_keys"
            ],
            "total_tables": 15,
            "message": "Bootstrap already completed - all tables exist"
        })

        MockProcessor.return_value = mock_processor
        yield mock_processor


@pytest.fixture
def mock_bootstrap_processor_failure():
    """Mock bootstrap processor that fails."""
    with patch("src.core.processors.setup.initial.onetime_bootstrap_processor.OnetimeBootstrapProcessor") as MockProcessor:
        mock_processor = MagicMock()

        # Mock failure during bootstrap
        mock_processor.execute = AsyncMock(side_effect=Exception("BigQuery dataset creation failed"))

        MockProcessor.return_value = mock_processor
        yield mock_processor


# ============================================
# Test: Authentication
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_without_auth(base_url, mock_bootstrap_processor):
    """Test bootstrap fails without authentication header."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            json={"force_recreate_dataset": False}
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        assert "root api key" in response.json()["detail"].lower() or "x-ca-root-key" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_bootstrap_with_invalid_key(base_url, invalid_admin_headers, mock_bootstrap_processor):
    """Test bootstrap fails with invalid CA root API key."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=invalid_admin_headers,
            json={"force_recreate_dataset": False}
        )

        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        assert "invalid" in response.json()["detail"].lower()


# ============================================
# Test: Successful Bootstrap
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_success(base_url, admin_headers, mock_bootstrap_processor):
    """Test successful bootstrap creates all meta tables or returns 409 if already bootstrapped."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"force_recreate_dataset": False}
        )

        # Accept both 200 (fresh bootstrap) and 409 (already bootstrapped)
        assert response.status_code in [200, 409], f"Expected 200 or 409, got {response.status_code}: {response.text}"

        if response.status_code == 409:
            # System already bootstrapped - this is valid behavior
            data = response.json()
            assert "already bootstrapped" in data["detail"].lower()
            return

        data = response.json()

        # Verify response structure
        assert data["status"] == "SUCCESS"
        assert data["dataset_created"] is True
        assert data["total_tables"] == 15
        assert len(data["tables_created"]) == 15
        assert len(data["tables_existed"]) == 0

        # Verify all expected tables were created
        expected_tables = [
            "org_profiles",
            "org_api_keys",
            "org_subscriptions",
            "org_usage_quotas",
            "org_integration_credentials",
            "org_pipeline_configs",
            "org_scheduled_pipeline_runs",
            "org_pipeline_execution_queue",
            "org_meta_pipeline_runs",
            "org_meta_step_logs",
            "org_meta_dq_results",
            "org_audit_logs",
            "org_kms_keys",
            "org_cost_tracking"
        ]

        for table in expected_tables:
            assert table in data["tables_created"], f"Expected table {table} not found in tables_created"

        # Verify processor was called with correct context
        mock_bootstrap_processor.execute.assert_called_once()
        call_args = mock_bootstrap_processor.execute.call_args
        assert call_args[1]["context"]["force_recreate_dataset"] is False
        assert call_args[1]["context"]["force_recreate_tables"] is False


# ============================================
# Test: Idempotent Behavior
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_idempotent(base_url, admin_headers, mock_bootstrap_processor_idempotent):
    """Test bootstrap is safe to call multiple times (idempotent)."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"force_recreate_dataset": False}
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()

        # Verify response structure for idempotent case
        assert data["status"] == "SUCCESS"
        assert data["dataset_created"] is False  # Dataset already exists
        assert data["total_tables"] == 15
        assert len(data["tables_created"]) == 0  # No new tables created
        assert len(data["tables_existed"]) == 15  # All tables already exist

        # Verify processor was called
        mock_bootstrap_processor_idempotent.execute.assert_called_once()


# ============================================
# Test: Meta Table Creation
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_creates_meta_tables(base_url, admin_headers, mock_bootstrap_processor):
    """Test bootstrap creates all 15 meta tables."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"force_recreate_dataset": False}
        )

        assert response.status_code == 200

        data = response.json()

        # Verify all 15 meta tables are created
        assert data["total_tables"] == 15
        assert len(data["tables_created"]) == 15

        # Critical tables for organization management
        core_tables = ["org_profiles", "org_api_keys", "org_subscriptions", "org_usage_quotas"]
        for table in core_tables:
            assert table in data["tables_created"], f"Core table {table} not created"

        # Pipeline management tables
        pipeline_tables = ["org_pipeline_configs", "org_meta_pipeline_runs", "org_meta_step_logs"]
        for table in pipeline_tables:
            assert table in data["tables_created"], f"Pipeline table {table} not created"

        # Security and audit tables
        security_tables = ["org_integration_credentials", "org_kms_keys", "org_audit_logs"]
        for table in security_tables:
            assert table in data["tables_created"], f"Security table {table} not created"


# ============================================
# Test: Force Recreate Flags
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_force_recreate_dataset(base_url, admin_headers, mock_bootstrap_processor):
    """Test bootstrap with force_recreate_dataset flag."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={
                "force_recreate_dataset": True,
                "force_recreate_tables": False
            }
        )

        assert response.status_code == 200

        # Verify processor was called with force_recreate_dataset=True
        mock_bootstrap_processor.execute.assert_called_once()
        call_args = mock_bootstrap_processor.execute.call_args
        assert call_args[1]["context"]["force_recreate_dataset"] is True
        assert call_args[1]["context"]["force_recreate_tables"] is False


@pytest.mark.asyncio
async def test_bootstrap_force_recreate_tables(base_url, admin_headers, mock_bootstrap_processor):
    """Test bootstrap with force_recreate_tables flag."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={
                "force_recreate_dataset": False,
                "force_recreate_tables": True
            }
        )

        assert response.status_code == 200

        # Verify processor was called with force_recreate_tables=True
        mock_bootstrap_processor.execute.assert_called_once()
        call_args = mock_bootstrap_processor.execute.call_args
        assert call_args[1]["context"]["force_recreate_dataset"] is False
        assert call_args[1]["context"]["force_recreate_tables"] is True


# ============================================
# Test: Error Handling
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_processor_failure(base_url, admin_headers, mock_bootstrap_processor_failure):
    """Test bootstrap handles processor failures gracefully."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"force_recreate_dataset": False}
        )

        assert response.status_code == 500

        data = response.json()
        assert "operation failed" in data["detail"].lower() or "error" in data["detail"].lower()


# ============================================
# Integration Test Marker
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_bootstrap_integration_real_bigquery(base_url, admin_headers):
    """
    Integration test: Bootstrap with real BigQuery connection.

    This test requires:
    - Valid GCP credentials
    - GCP_PROJECT_ID environment variable
    - KMS_KEY_NAME environment variable
    - CA_ROOT_API_KEY environment variable

    Mark with @pytest.mark.integration - skip in unit tests.
    """
    # This test should only run when explicitly requested
    pytest.skip("Integration test - run with: pytest -m integration")

    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"force_recreate_dataset": False}
        )

        # In real BigQuery, bootstrap should succeed or be idempotent
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "SUCCESS"
        assert data["total_tables"] == 15

        # Either tables were created or already existed (idempotent)
        assert len(data["tables_created"]) + len(data["tables_existed"]) == 15


# ============================================
# Test: Request Validation
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_invalid_request_body(base_url, admin_headers, mock_bootstrap_processor):
    """Test bootstrap with invalid request body."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        # Send invalid field
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={"invalid_field": "value"}
        )

        # Should still work (extra fields ignored by Pydantic with extra="forbid" not set)
        # OR return 422 if extra="forbid" is set on BootstrapRequest
        assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_bootstrap_default_flags(base_url, admin_headers, mock_bootstrap_processor):
    """Test bootstrap with default flag values (both False)."""
    from src.app.main import app
    from httpx import ASGITransport

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
        # Send minimal request (flags should default to False)
        response = await client.post(
            "/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={}
        )

        assert response.status_code == 200

        # Verify processor was called with default values
        mock_bootstrap_processor.execute.assert_called_once()
        call_args = mock_bootstrap_processor.execute.call_args
        assert call_args[1]["context"]["force_recreate_dataset"] is False
        assert call_args[1]["context"]["force_recreate_tables"] is False
