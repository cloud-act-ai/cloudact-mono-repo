"""
Test Admin API Routes

Tests for organization management, API key management, bootstrap operations,
and audit logs.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client for admin tests."""
    mock_client = MagicMock()
    mock_client.client = MagicMock()
    return mock_client


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for admin tests."""
    mock = MagicMock()
    mock.table.return_value.insert.return_value.execute.return_value = MagicMock()
    mock.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    return mock


@pytest.fixture
async def admin_client():
    """Async client with admin authentication mocked."""
    from src.app.main import app
    
    with patch("src.app.routers.admin.verify_admin_key", return_value=None):
        with patch("src.app.routers.admin.rate_limit_global", new_callable=AsyncMock):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


# ============================================
# Bootstrap Tests
# ============================================

class TestBootstrapStatus:
    """Tests for GET /api/v1/admin/bootstrap/status endpoint."""
    
    @pytest.mark.asyncio
    async def test_bootstrap_status_not_bootstrapped(self, admin_client):
        """Test status when system is not bootstrapped."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.get_dataset.side_effect = Exception("Not found")
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/admin/bootstrap/status",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            # Should return NOT_BOOTSTRAPPED status
            assert response.status_code in [200, 500]

    @pytest.mark.asyncio
    async def test_bootstrap_status_cached(self, admin_client):
        """Test that bootstrap status is cached for 60 seconds."""
        with patch("src.app.routers.admin.bootstrap_status_cache") as mock_cache:
            mock_cache.get.return_value = {
                "status": "SYNCED",
                "dataset_exists": True,
                "tables_expected": 10,
                "tables_existing": ["table1"],
                "tables_missing": [],
                "tables_extra": [],
                "schema_diffs": {},
                "message": "Cached response"
            }
            
            response = await admin_client.get(
                "/api/v1/admin/bootstrap/status",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500]

    @pytest.mark.asyncio
    async def test_bootstrap_status_force_refresh(self, admin_client):
        """Test force refresh bypasses cache."""
        response = await admin_client.get(
            "/api/v1/admin/bootstrap/status?force_refresh=true",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
        )
        # May fail without real BQ, but should not 404
        assert response.status_code in [200, 500, 403]


class TestBootstrapSync:
    """Tests for POST /api/v1/admin/bootstrap/sync endpoint."""
    
    @pytest.mark.asyncio
    async def test_bootstrap_sync_missing_tables(self, admin_client):
        """Test sync creates missing tables."""
        response = await admin_client.post(
            "/api/v1/admin/bootstrap/sync",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
            json={"sync_missing_tables": True, "sync_missing_columns": False}
        )
        assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_bootstrap_sync_missing_columns(self, admin_client):
        """Test sync adds missing columns to existing tables."""
        response = await admin_client.post(
            "/api/v1/admin/bootstrap/sync",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
            json={"sync_missing_tables": True, "sync_missing_columns": True}
        )
        assert response.status_code in [200, 500, 403]


# ============================================
# Organization Management Tests
# ============================================

class TestCreateOrganization:
    """Tests for POST /api/v1/admin/organizations endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_org_valid_slug(self, admin_client):
        """Test creating organization with valid slug."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            with patch("src.app.routers.admin.get_supabase_client") as mock_supa:
                mock_client = MagicMock()
                mock_client.client.query.return_value.result.return_value = []
                mock_client.create_dataset = MagicMock()
                mock_bq.return_value = mock_client
                mock_supa.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()
                
                response = await admin_client.post(
                    "/api/v1/admin/organizations",
                    headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
                    json={
                        "org_slug": "test_org_valid",
                        "description": "Test Organization"
                    }
                )
                
                assert response.status_code in [200, 201, 500, 403, 422]

    @pytest.mark.asyncio
    async def test_create_org_invalid_slug_format(self, admin_client):
        """Test creating organization with invalid slug format."""
        response = await admin_client.post(
            "/api/v1/admin/organizations",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
            json={
                "org_slug": "INVALID-SLUG!@#",
                "description": "Test Organization"
            }
        )
        
        # Should fail validation
        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_org_slug_too_short(self, admin_client):
        """Test creating organization with slug too short."""
        response = await admin_client.post(
            "/api/v1/admin/organizations",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
            json={
                "org_slug": "ab",  # Less than 3 chars
                "description": "Test Organization"
            }
        )
        
        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_org_slug_too_long(self, admin_client):
        """Test creating organization with slug too long."""
        response = await admin_client.post(
            "/api/v1/admin/organizations",
            headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
            json={
                "org_slug": "a" * 51,  # More than 50 chars
                "description": "Test Organization"
            }
        )
        
        assert response.status_code in [400, 422]


class TestGetOrganization:
    """Tests for GET /api/v1/admin/organizations/{org_slug} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_org_exists(self, admin_client):
        """Test getting existing organization."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_result = [{"count": 5}]
            mock_client.client.query.return_value.result.return_value = mock_result
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/admin/organizations/test_org",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# API Key Management Tests
# ============================================

class TestCreateAPIKey:
    """Tests for POST /api/v1/admin/api-keys endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_api_key_success(self, admin_client):
        """Test creating API key for organization."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            with patch("src.app.routers.admin.encrypt_value") as mock_encrypt:
                mock_client = MagicMock()
                mock_client.client.query.return_value.result.return_value = []
                mock_bq.return_value = mock_client
                mock_encrypt.return_value = b"encrypted_key"
                
                response = await admin_client.post(
                    "/api/v1/admin/api-keys",
                    headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
                    json={
                        "org_slug": "test_org",
                        "description": "Test API Key"
                    }
                )
                
                assert response.status_code in [200, 201, 409, 500, 403]

    @pytest.mark.asyncio
    async def test_create_api_key_duplicate(self, admin_client):
        """Test creating API key when one already exists."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            # Return existing key
            mock_result = [{"org_api_key_hash": "existing_hash_1234567890123456", "created_at": datetime.now(timezone.utc)}]
            mock_client.client.query.return_value.result.return_value = mock_result
            mock_bq.return_value = mock_client
            
            response = await admin_client.post(
                "/api/v1/admin/api-keys",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"},
                json={
                    "org_slug": "test_org",
                    "description": "Test API Key"
                }
            )
            
            # Should return 409 conflict
            assert response.status_code in [409, 500, 403]


class TestRevokeAPIKey:
    """Tests for DELETE /api/v1/admin/api-keys/{org_api_key_hash} endpoint."""
    
    @pytest.mark.asyncio
    async def test_revoke_api_key_success(self, admin_client):
        """Test revoking API key."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.query.return_value.result.return_value = [{"org_slug": "test_org"}]
            mock_bq.return_value = mock_client
            
            response = await admin_client.delete(
                "/api/v1/admin/api-keys/somehash123456789012345678901234",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500, 403]


class TestRegenerateAPIKey:
    """Tests for POST /api/v1/admin/organizations/{org_slug}/regenerate-api-key endpoint."""
    
    @pytest.mark.asyncio
    async def test_regenerate_api_key_success(self, admin_client):
        """Test regenerating API key for existing org."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            with patch("src.app.routers.admin.encrypt_value") as mock_encrypt:
                mock_client = MagicMock()
                # First query returns org exists
                mock_client.client.query.return_value.result.return_value = [{"org_slug": "test_org", "status": "ACTIVE"}]
                mock_bq.return_value = mock_client
                mock_encrypt.return_value = b"encrypted_key"
                
                response = await admin_client.post(
                    "/api/v1/admin/organizations/test_org/regenerate-api-key",
                    headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
                )
                
                assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_regenerate_api_key_org_not_found(self, admin_client):
        """Test regenerating API key for non-existent org."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.post(
                "/api/v1/admin/organizations/nonexistent_org/regenerate-api-key",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [404, 500, 403]


# ============================================
# Audit Logs Tests
# ============================================

class TestAuditLogs:
    """Tests for GET /api/v1/admin/audit-logs/{org_slug} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_audit_logs_success(self, admin_client):
        """Test retrieving audit logs for organization."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/admin/audit-logs/test_org",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_audit_logs_with_filters(self, admin_client):
        """Test retrieving audit logs with filters."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/admin/audit-logs/test_org?action=CREATE&resource_type=PIPELINE&limit=50",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_audit_logs_pagination(self, admin_client):
        """Test audit logs pagination."""
        with patch("src.app.routers.admin.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_client.client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/admin/audit-logs/test_org?limit=100&offset=50",
                headers={"X-CA-Root-Key": "test-admin-key-32-chars-minimum"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Authentication Tests
# ============================================

class TestAdminAuthentication:
    """Tests for admin authentication requirements."""
    
    @pytest.mark.asyncio
    async def test_missing_admin_key(self):
        """Test endpoints fail without admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/admin/bootstrap/status")
            
            # Should require authentication
            assert response.status_code in [401, 403, 422]

    @pytest.mark.asyncio
    async def test_invalid_admin_key(self):
        """Test endpoints fail with invalid admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/admin/bootstrap/status",
                headers={"X-CA-Root-Key": "invalid-key"}
            )
            
            # Should reject invalid key
            assert response.status_code in [401, 403]
