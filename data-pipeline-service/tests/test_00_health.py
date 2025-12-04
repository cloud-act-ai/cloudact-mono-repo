"""
Health Check Tests - Basic API Endpoint Validation

Tests public health endpoints that don't require authentication.
These tests verify the application is running and basic endpoints are accessible.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from src.app.main import app


@pytest.mark.asyncio
async def test_root_endpoint():
    """
    Test root endpoint returns basic API information.

    Endpoint: GET /
    Auth: None required
    Expected: 200 OK with API info
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")

        assert response.status_code == 200
        data = response.json()

        # Verify response structure - actual API returns message, environment, docs, openapi
        assert "message" in data
        assert "environment" in data
        assert "docs" in data
        assert "openapi" in data

        # Verify expected values
        assert "data-pipeline-service" in data["message"]
        assert isinstance(data["environment"], str)


@pytest.mark.asyncio
async def test_health_endpoint():
    """
    Test health check endpoint returns healthy status.

    Endpoint: GET /health
    Auth: None required
    Expected: 200 OK with status: healthy
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()

        # Verify response structure - actual API returns status, service, version, environment
        assert "status" in data
        assert "service" in data
        assert "version" in data
        assert "environment" in data

        # Verify healthy status
        assert data["status"] == "healthy"
        assert data["service"] == "data-pipeline-service"
        assert isinstance(data["version"], str)


@pytest.mark.asyncio
async def test_cors_headers():
    """
    Test CORS headers are present in responses.

    Verifies that CORS middleware is properly configured.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send request with Origin header
        response = await client.get(
            "/health",
            headers={"Origin": "http://localhost:3000"}
        )

        assert response.status_code == 200

        # Verify CORS headers are present
        headers = response.headers
        assert "access-control-allow-origin" in headers


@pytest.mark.asyncio
async def test_openapi_docs():
    """
    Test OpenAPI documentation endpoint is accessible.

    Endpoint: GET /docs
    Auth: None required
    Expected: 200 OK (HTML response)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/docs")

        assert response.status_code == 200

        # Verify it's HTML content
        assert "text/html" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_openapi_json():
    """
    Test OpenAPI JSON schema is accessible.

    Endpoint: GET /openapi.json
    Auth: None required
    Expected: 200 OK with OpenAPI schema
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")

        assert response.status_code == 200

        # Verify it's JSON content
        assert "application/json" in response.headers["content-type"]

        data = response.json()

        # Verify OpenAPI structure
        assert "openapi" in data
        assert "info" in data
        assert "paths" in data

        # Verify API info (actual title is lowercase kebab-case)
        assert data["info"]["title"] == "data-pipeline-service"


@pytest.mark.asyncio
async def test_nonexistent_endpoint():
    """
    Test 404 response for nonexistent endpoints.

    Endpoint: GET /nonexistent
    Auth: None required
    Expected: 404 Not Found
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/nonexistent")

        assert response.status_code == 404
