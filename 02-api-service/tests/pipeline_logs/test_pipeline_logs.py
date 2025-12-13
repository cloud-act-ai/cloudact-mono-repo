"""
Comprehensive tests for Pipeline Logs API endpoints.

Tests the pipeline execution history endpoints including:
- GET /pipelines/{org_slug}/runs - List pipeline runs
- GET /pipelines/{org_slug}/runs/{pipeline_logging_id} - Get run details
- GET /pipelines/{org_slug}/runs/{pipeline_logging_id}/steps - Get step logs
- POST /pipelines/{org_slug}/runs/{pipeline_logging_id}/retry - Retry failed run
- GET /pipelines/{org_slug}/runs/{pipeline_logging_id}/download - Download logs
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, date
from httpx import AsyncClient, ASGITransport


# ============================================
# Test Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client for testing."""
    with patch("src.app.routers.pipeline_logs.get_bigquery_client") as mock_get_client:
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_auth():
    """Mock authentication for testing."""
    with patch("src.app.routers.pipeline_logs.get_current_org") as mock_get_org:
        mock_context = {
            "org_slug": "test_org",
            "company_name": "Test Organization",
            "status": "ACTIVE"
        }
        mock_get_org.return_value = mock_context
        yield mock_context


@pytest.fixture
async def test_client(mock_auth, mock_bq_client):
    """Test client with mocked auth and BigQuery client."""
    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ============================================
# Authentication Tests
# ============================================

class TestPipelineLogsAuthentication:
    """Tests for authentication on pipeline logs endpoints."""

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_401(self):
        """Test that missing API key returns 401 Unauthorized."""
        from src.app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/pipelines/test_org/runs")
            assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_cross_tenant_access_blocked(self):
        """Test that cross-tenant access is blocked."""
        with patch("src.app.routers.pipeline_logs.get_current_org") as mock_get_org:
            mock_context = {"org_slug": "org_a", "status": "ACTIVE"}
            mock_get_org.return_value = mock_context

            from src.app.main import app
            transport = ASGITransport(app=app)

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/v1/pipelines/org_b/runs",
                    headers={"X-API-Key": "test-key"}
                )
                assert response.status_code == 403


# ============================================
# List Pipeline Runs Tests
# ============================================

class TestListPipelineRuns:
    """Tests for GET /pipelines/{org_slug}/runs endpoint."""

    @pytest.mark.asyncio
    async def test_list_runs_success(self, test_client, mock_bq_client):
        """Test successful listing of pipeline runs."""
        # Mock BigQuery responses
        mock_bq_client.query.side_effect = [
            # Count query result
            [{"total": 2}],
            # Runs query result
            [
                {
                    "pipeline_logging_id": "run-001",
                    "pipeline_id": "openai/cost/usage_cost",
                    "status": "COMPLETED",
                    "trigger_type": "api",
                    "trigger_by": "admin@test.com",
                    "start_time": datetime(2025, 1, 15, 10, 0),
                    "end_time": datetime(2025, 1, 15, 10, 5),
                    "duration_ms": 300000,
                    "run_date": date(2025, 1, 15),
                    "error_message": None,
                    "parameters": '{"date": "2025-01-14"}'
                },
                {
                    "pipeline_logging_id": "run-002",
                    "pipeline_id": "gcp/cost/billing",
                    "status": "FAILED",
                    "trigger_type": "scheduler",
                    "trigger_by": None,
                    "start_time": datetime(2025, 1, 15, 11, 0),
                    "end_time": datetime(2025, 1, 15, 11, 1),
                    "duration_ms": 60000,
                    "run_date": date(2025, 1, 15),
                    "error_message": "BigQuery quota exceeded",
                    "parameters": None
                }
            ]
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["runs"]) == 2
        assert data["runs"][0]["status"] == "COMPLETED"
        assert data["runs"][1]["status"] == "FAILED"

    @pytest.mark.asyncio
    async def test_list_runs_with_filters(self, test_client, mock_bq_client):
        """Test listing runs with status filter."""
        mock_bq_client.query.side_effect = [
            [{"total": 1}],
            [{
                "pipeline_logging_id": "run-002",
                "pipeline_id": "gcp/cost/billing",
                "status": "FAILED",
                "trigger_type": "scheduler",
                "trigger_by": None,
                "start_time": datetime(2025, 1, 15, 11, 0),
                "end_time": datetime(2025, 1, 15, 11, 1),
                "duration_ms": 60000,
                "run_date": date(2025, 1, 15),
                "error_message": "Error",
                "parameters": None
            }]
        ]

        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs",
            params={"status_filter": "FAILED"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["runs"][0]["status"] == "FAILED"

    @pytest.mark.asyncio
    async def test_list_runs_pagination(self, test_client, mock_bq_client):
        """Test pagination parameters."""
        mock_bq_client.query.side_effect = [
            [{"total": 100}],
            [{
                "pipeline_logging_id": "run-050",
                "pipeline_id": "test/pipeline",
                "status": "COMPLETED",
                "trigger_type": "api",
                "trigger_by": None,
                "start_time": datetime(2025, 1, 15, 10, 0),
                "end_time": datetime(2025, 1, 15, 10, 5),
                "duration_ms": 300000,
                "run_date": date(2025, 1, 15),
                "error_message": None,
                "parameters": None
            }]
        ]

        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs",
            params={"limit": 10, "offset": 50}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 10
        assert data["offset"] == 50
        assert data["total"] == 100

    @pytest.mark.asyncio
    async def test_list_runs_empty(self, test_client, mock_bq_client):
        """Test empty result set."""
        mock_bq_client.query.side_effect = [
            [{"total": 0}],
            []
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["runs"] == []


# ============================================
# Get Pipeline Run Detail Tests
# ============================================

class TestGetPipelineRunDetail:
    """Tests for GET /pipelines/{org_slug}/runs/{pipeline_logging_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_run_detail_success(self, test_client, mock_bq_client):
        """Test successful retrieval of run details with steps."""
        mock_bq_client.query.side_effect = [
            # Run query result
            [{
                "pipeline_logging_id": "run-001",
                "pipeline_id": "openai/cost/usage_cost",
                "status": "COMPLETED",
                "trigger_type": "api",
                "trigger_by": "admin@test.com",
                "start_time": datetime(2025, 1, 15, 10, 0),
                "end_time": datetime(2025, 1, 15, 10, 5),
                "duration_ms": 300000,
                "run_date": date(2025, 1, 15),
                "error_message": None,
                "parameters": '{"date": "2025-01-14"}',
                "run_metadata": '{"version": "1.0"}'
            }],
            # Steps query result
            [
                {
                    "step_logging_id": "step-001",
                    "step_name": "Extract Usage Data",
                    "step_type": "openai.api_extractor",
                    "step_index": 1,
                    "status": "COMPLETED",
                    "start_time": datetime(2025, 1, 15, 10, 0),
                    "end_time": datetime(2025, 1, 15, 10, 2),
                    "duration_ms": 120000,
                    "rows_processed": 1500,
                    "error_message": None,
                    "metadata": None
                },
                {
                    "step_logging_id": "step-002",
                    "step_name": "Calculate Costs",
                    "step_type": "openai.cost_calculator",
                    "step_index": 2,
                    "status": "COMPLETED",
                    "start_time": datetime(2025, 1, 15, 10, 2),
                    "end_time": datetime(2025, 1, 15, 10, 5),
                    "duration_ms": 180000,
                    "rows_processed": 1500,
                    "error_message": None,
                    "metadata": '{"total_cost": 150.50}'
                }
            ]
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs/run-001")

        assert response.status_code == 200
        data = response.json()
        assert data["pipeline_logging_id"] == "run-001"
        assert data["status"] == "COMPLETED"
        assert len(data["steps"]) == 2
        assert data["steps"][0]["step_name"] == "Extract Usage Data"

    @pytest.mark.asyncio
    async def test_get_run_detail_not_found(self, test_client, mock_bq_client):
        """Test 404 for non-existent run."""
        mock_bq_client.query.return_value = []

        response = await test_client.get("/api/v1/pipelines/test_org/runs/nonexistent")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_run_detail_failed_run(self, test_client, mock_bq_client):
        """Test retrieval of failed run with error details."""
        mock_bq_client.query.side_effect = [
            [{
                "pipeline_logging_id": "run-002",
                "pipeline_id": "gcp/cost/billing",
                "status": "FAILED",
                "trigger_type": "scheduler",
                "trigger_by": None,
                "start_time": datetime(2025, 1, 15, 11, 0),
                "end_time": datetime(2025, 1, 15, 11, 1),
                "duration_ms": 60000,
                "run_date": date(2025, 1, 15),
                "error_message": "BigQuery quota exceeded",
                "parameters": None,
                "run_metadata": None
            }],
            [{
                "step_logging_id": "step-001",
                "step_name": "Extract Billing Data",
                "step_type": "gcp.bq_extractor",
                "step_index": 1,
                "status": "FAILED",
                "start_time": datetime(2025, 1, 15, 11, 0),
                "end_time": datetime(2025, 1, 15, 11, 1),
                "duration_ms": 60000,
                "rows_processed": 0,
                "error_message": "Quota exceeded for BigQuery",
                "metadata": None
            }]
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs/run-002")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FAILED"
        assert data["error_message"] == "BigQuery quota exceeded"
        assert data["steps"][0]["status"] == "FAILED"


# ============================================
# Get Step Logs Tests
# ============================================

class TestGetStepLogs:
    """Tests for GET /pipelines/{org_slug}/runs/{pipeline_logging_id}/steps endpoint."""

    @pytest.mark.asyncio
    async def test_get_step_logs_success(self, test_client, mock_bq_client):
        """Test successful retrieval of step logs."""
        mock_bq_client.query.side_effect = [
            [{"total": 3}],
            [
                {
                    "step_logging_id": "step-001",
                    "step_name": "Step 1",
                    "step_type": "type.a",
                    "step_index": 1,
                    "status": "COMPLETED",
                    "start_time": datetime(2025, 1, 15, 10, 0),
                    "end_time": datetime(2025, 1, 15, 10, 1),
                    "duration_ms": 60000,
                    "rows_processed": 500,
                    "error_message": None,
                    "metadata": None
                },
                {
                    "step_logging_id": "step-002",
                    "step_name": "Step 2",
                    "step_type": "type.b",
                    "step_index": 2,
                    "status": "COMPLETED",
                    "start_time": datetime(2025, 1, 15, 10, 1),
                    "end_time": datetime(2025, 1, 15, 10, 2),
                    "duration_ms": 60000,
                    "rows_processed": 500,
                    "error_message": None,
                    "metadata": None
                },
                {
                    "step_logging_id": "step-003",
                    "step_name": "Step 3",
                    "step_type": "type.c",
                    "step_index": 3,
                    "status": "COMPLETED",
                    "start_time": datetime(2025, 1, 15, 10, 2),
                    "end_time": datetime(2025, 1, 15, 10, 3),
                    "duration_ms": 60000,
                    "rows_processed": 500,
                    "error_message": None,
                    "metadata": None
                }
            ]
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs/run-001/steps")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["steps"]) == 3

    @pytest.mark.asyncio
    async def test_get_step_logs_with_status_filter(self, test_client, mock_bq_client):
        """Test step logs with status filter."""
        mock_bq_client.query.side_effect = [
            [{"total": 1}],
            [{
                "step_logging_id": "step-003",
                "step_name": "Failed Step",
                "step_type": "type.c",
                "step_index": 3,
                "status": "FAILED",
                "start_time": datetime(2025, 1, 15, 10, 2),
                "end_time": datetime(2025, 1, 15, 10, 3),
                "duration_ms": 60000,
                "rows_processed": 0,
                "error_message": "Step failed",
                "metadata": None
            }]
        ]

        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs/run-001/steps",
            params={"status_filter": "FAILED"}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["steps"]) == 1
        assert data["steps"][0]["status"] == "FAILED"


# ============================================
# Retry Pipeline Run Tests
# ============================================

class TestRetryPipelineRun:
    """Tests for POST /pipelines/{org_slug}/runs/{pipeline_logging_id}/retry endpoint."""

    @pytest.mark.asyncio
    async def test_retry_failed_run_success(self, test_client, mock_bq_client):
        """Test successful retry of a failed run."""
        mock_bq_client.query.return_value = [{
            "pipeline_id": "openai/cost/usage_cost",
            "status": "FAILED",
            "parameters": '{"date": "2025-01-14"}'
        }]

        response = await test_client.post("/api/v1/pipelines/test_org/runs/run-002/retry")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["original_pipeline_logging_id"] == "run-002"

    @pytest.mark.asyncio
    async def test_retry_running_run_fails(self, test_client, mock_bq_client):
        """Test that retrying a running pipeline fails."""
        mock_bq_client.query.return_value = [{
            "pipeline_id": "openai/cost/usage_cost",
            "status": "RUNNING",
            "parameters": None
        }]

        response = await test_client.post("/api/v1/pipelines/test_org/runs/run-001/retry")

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_retry_nonexistent_run_fails(self, test_client, mock_bq_client):
        """Test that retrying a non-existent run fails."""
        mock_bq_client.query.return_value = []

        response = await test_client.post("/api/v1/pipelines/test_org/runs/nonexistent/retry")

        assert response.status_code == 404


# ============================================
# Download Pipeline Logs Tests
# ============================================

class TestDownloadPipelineLogs:
    """Tests for GET /pipelines/{org_slug}/runs/{pipeline_logging_id}/download endpoint."""

    @pytest.mark.asyncio
    async def test_download_json_format(self, test_client, mock_bq_client):
        """Test downloading logs in JSON format."""
        mock_bq_client.query.side_effect = [
            [{
                "pipeline_logging_id": "run-001",
                "pipeline_id": "openai/cost/usage_cost",
                "status": "COMPLETED",
                "trigger_type": "api",
                "trigger_by": "admin@test.com",
                "start_time": datetime(2025, 1, 15, 10, 0),
                "end_time": datetime(2025, 1, 15, 10, 5),
                "duration_ms": 300000,
                "run_date": date(2025, 1, 15),
                "error_message": None,
                "parameters": None,
                "run_metadata": None
            }],
            []  # No steps
        ]

        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs/run-001/download",
            params={"format": "json"}
        )

        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")
        assert "attachment" in response.headers.get("content-disposition", "")

    @pytest.mark.asyncio
    async def test_download_csv_format(self, test_client, mock_bq_client):
        """Test downloading logs in CSV format."""
        mock_bq_client.query.side_effect = [
            [{
                "pipeline_logging_id": "run-001",
                "pipeline_id": "openai/cost/usage_cost",
                "status": "COMPLETED",
                "trigger_type": "api",
                "trigger_by": "admin@test.com",
                "start_time": datetime(2025, 1, 15, 10, 0),
                "end_time": datetime(2025, 1, 15, 10, 5),
                "duration_ms": 300000,
                "run_date": date(2025, 1, 15),
                "error_message": None,
                "parameters": None,
                "run_metadata": None
            }],
            []  # No steps
        ]

        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs/run-001/download",
            params={"format": "csv"}
        )

        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_download_invalid_format(self, test_client, mock_bq_client):
        """Test that invalid download format returns error."""
        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs/run-001/download",
            params={"format": "xml"}
        )

        assert response.status_code == 400


# ============================================
# Error Handling Tests
# ============================================

class TestPipelineLogsErrorHandling:
    """Tests for error handling in pipeline logs API."""

    @pytest.mark.asyncio
    async def test_bigquery_error(self, test_client, mock_bq_client):
        """Test handling of BigQuery errors."""
        mock_bq_client.query.side_effect = Exception("BigQuery connection failed")

        response = await test_client.get("/api/v1/pipelines/test_org/runs")

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_invalid_json_in_parameters(self, test_client, mock_bq_client):
        """Test handling of invalid JSON in parameters field."""
        mock_bq_client.query.side_effect = [
            [{"total": 1}],
            [{
                "pipeline_logging_id": "run-001",
                "pipeline_id": "test/pipeline",
                "status": "COMPLETED",
                "trigger_type": "api",
                "trigger_by": None,
                "start_time": datetime(2025, 1, 15, 10, 0),
                "end_time": datetime(2025, 1, 15, 10, 5),
                "duration_ms": 300000,
                "run_date": date(2025, 1, 15),
                "error_message": None,
                "parameters": "invalid json {"  # Invalid JSON
            }]
        ]

        response = await test_client.get("/api/v1/pipelines/test_org/runs")

        # Should handle gracefully
        assert response.status_code == 200
        data = response.json()
        assert data["runs"][0]["parameters"]["raw"] == "invalid json {"


# ============================================
# Input Validation Tests
# ============================================

class TestPipelineLogsInputValidation:
    """Tests for input validation on pipeline logs endpoints."""

    @pytest.mark.asyncio
    async def test_pagination_limit_validation(self, test_client, mock_bq_client):
        """Test pagination limit validation."""
        # Limit > 100 should be rejected
        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs",
            params={"limit": 200}
        )
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_offset_validation(self, test_client, mock_bq_client):
        """Test offset validation."""
        # Negative offset should be rejected
        response = await test_client.get(
            "/api/v1/pipelines/test_org/runs",
            params={"offset": -1}
        )
        assert response.status_code == 422  # Validation error
