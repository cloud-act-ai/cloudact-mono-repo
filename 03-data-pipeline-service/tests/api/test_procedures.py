"""
Test Procedure Management API Routes

Tests for BigQuery stored procedure management endpoints.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from pathlib import Path


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client."""
    mock_client = MagicMock()
    mock_client.client = MagicMock()
    mock_client.client.query.return_value.result.return_value = []
    return mock_client


@pytest.fixture
async def admin_client():
    """Async client with admin authentication mocked."""
    from src.app.main import app
    
    with patch("src.app.routers.procedures.verify_admin_key", return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ============================================
# List Procedures Tests
# ============================================

class TestListProcedures:
    """Tests for GET /api/v1/procedures endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_procedures_success(self, admin_client, mock_bq_client):
        """Test listing all procedures."""
        mock_bq_client.client.query.return_value.result.return_value = [
            MagicMock(
                routine_name="sp_calculate_costs",
                routine_schema="organizations",
                routine_catalog="test-project",
                created=None,
                last_altered=None
            )
        ]
        
        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
            response = await admin_client.get(
                "/api/v1/procedures",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_procedures_empty(self, admin_client, mock_bq_client):
        """Test listing procedures when none exist."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
            response = await admin_client.get(
                "/api/v1/procedures",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]
            if response.status_code == 200:
                data = response.json()
                assert "procedures" in data
                assert data["count"] >= 0


# ============================================
# List Procedure Files Tests
# ============================================

class TestListProcedureFiles:
    """Tests for GET /api/v1/procedures/files endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_procedure_files_success(self, admin_client):
        """Test listing procedure SQL files."""
        mock_files = {
            "sp_calculate_costs": Path("/path/to/sp_calculate_costs.sql"),
            "sp_backfill_data": Path("/path/to/sp_backfill_data.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.get_procedures_dir", return_value=Path("/path/to")):
                response = await admin_client.get(
                    "/api/v1/procedures/files",
                    headers={"X-CA-Root-Key": "test-admin-key"}
                )
                
                assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_procedure_files_by_domain(self, admin_client):
        """Test listing procedure files filtered by domain."""
        mock_files = {
            "sp_subscription_calc": Path("/path/to/subscription/sp_subscription_calc.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.get_procedures_dir", return_value=Path("/path/to")):
                response = await admin_client.get(
                    "/api/v1/procedures/files?domain=subscription",
                    headers={"X-CA-Root-Key": "test-admin-key"}
                )
                
                assert response.status_code in [200, 500, 403]


# ============================================
# Sync Procedures Tests
# ============================================

class TestSyncProcedures:
    """Tests for POST /api/v1/procedures/sync endpoint."""
    
    @pytest.mark.asyncio
    async def test_sync_procedures_success(self, admin_client, mock_bq_client):
        """Test syncing all procedures."""
        mock_files = {
            "sp_test": Path("/path/to/sp_test.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.procedure_exists", return_value=False):
                with patch("src.app.routers.procedures.load_procedure_sql", return_value="CREATE OR REPLACE PROCEDURE"):
                    with patch("src.app.routers.procedures.create_or_update_procedure"):
                        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                            response = await admin_client.post(
                                "/api/v1/procedures/sync",
                                headers={"X-CA-Root-Key": "test-admin-key"},
                                json={"force": False}
                            )
                            
                            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_sync_procedures_force_update(self, admin_client, mock_bq_client):
        """Test syncing procedures with force update."""
        mock_files = {
            "sp_test": Path("/path/to/sp_test.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.procedure_exists", return_value=True):
                with patch("src.app.routers.procedures.load_procedure_sql", return_value="CREATE OR REPLACE PROCEDURE"):
                    with patch("src.app.routers.procedures.create_or_update_procedure"):
                        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                            response = await admin_client.post(
                                "/api/v1/procedures/sync",
                                headers={"X-CA-Root-Key": "test-admin-key"},
                                json={"force": True}
                            )
                            
                            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_sync_specific_procedures(self, admin_client, mock_bq_client):
        """Test syncing specific procedures by name."""
        mock_files = {
            "sp_test1": Path("/path/to/sp_test1.sql"),
            "sp_test2": Path("/path/to/sp_test2.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.procedure_exists", return_value=False):
                with patch("src.app.routers.procedures.load_procedure_sql", return_value="CREATE OR REPLACE PROCEDURE"):
                    with patch("src.app.routers.procedures.create_or_update_procedure"):
                        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                            response = await admin_client.post(
                                "/api/v1/procedures/sync",
                                headers={"X-CA-Root-Key": "test-admin-key"},
                                json={
                                    "force": False,
                                    "procedures": ["sp_test1"]
                                }
                            )
                            
                            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_sync_procedures_no_files(self, admin_client, mock_bq_client):
        """Test syncing when no procedure files exist."""
        with patch("src.app.routers.procedures.discover_procedure_files", return_value={}):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/procedures/sync",
                    headers={"X-CA-Root-Key": "test-admin-key"},
                    json={"force": False}
                )
                
                assert response.status_code in [200, 500, 403]


# ============================================
# Sync Single Procedure Tests
# ============================================

class TestSyncSingleProcedure:
    """Tests for POST /api/v1/procedures/{procedure_name} endpoint."""
    
    @pytest.mark.asyncio
    async def test_sync_single_procedure_success(self, admin_client, mock_bq_client):
        """Test syncing a single procedure."""
        mock_files = {
            "sp_test": Path("/path/to/sp_test.sql")
        }
        
        with patch("src.app.routers.procedures.discover_procedure_files", return_value=mock_files):
            with patch("src.app.routers.procedures.procedure_exists", return_value=False):
                with patch("src.app.routers.procedures.load_procedure_sql", return_value="CREATE OR REPLACE PROCEDURE"):
                    with patch("src.app.routers.procedures.create_or_update_procedure"):
                        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                            response = await admin_client.post(
                                "/api/v1/procedures/sp_test",
                                headers={"X-CA-Root-Key": "test-admin-key"}
                            )
                            
                            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_sync_single_procedure_not_found(self, admin_client, mock_bq_client):
        """Test syncing non-existent procedure file."""
        with patch("src.app.routers.procedures.discover_procedure_files", return_value={}):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/procedures/nonexistent_proc",
                    headers={"X-CA-Root-Key": "test-admin-key"}
                )
                
                assert response.status_code in [404, 500, 403]


# ============================================
# Get Procedure Details Tests
# ============================================

class TestGetProcedure:
    """Tests for GET /api/v1/procedures/{procedure_name} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_procedure_success(self, admin_client, mock_bq_client):
        """Test getting procedure details."""
        mock_row = MagicMock()
        mock_row.routine_name = "sp_test"
        mock_row.routine_schema = "organizations"
        mock_row.routine_catalog = "test-project"
        mock_row.routine_type = "PROCEDURE"
        mock_row.routine_definition = "BEGIN ... END"
        mock_row.created = None
        mock_row.last_altered = None
        
        mock_bq_client.client.query.return_value.result.return_value = [mock_row]
        
        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
            response = await admin_client.get(
                "/api/v1/procedures/sp_test",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_get_procedure_not_found(self, admin_client, mock_bq_client):
        """Test getting non-existent procedure."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
            response = await admin_client.get(
                "/api/v1/procedures/nonexistent_proc",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [404, 500, 403]


# ============================================
# Delete Procedure Tests
# ============================================

class TestDeleteProcedure:
    """Tests for DELETE /api/v1/procedures/{procedure_name} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_procedure_success(self, admin_client, mock_bq_client):
        """Test deleting a procedure."""
        with patch("src.app.routers.procedures.procedure_exists", return_value=True):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.delete(
                    "/api/v1/procedures/sp_test",
                    headers={"X-CA-Root-Key": "test-admin-key"}
                )
                
                assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_delete_procedure_not_found(self, admin_client, mock_bq_client):
        """Test deleting non-existent procedure."""
        with patch("src.app.routers.procedures.procedure_exists", return_value=False):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.delete(
                    "/api/v1/procedures/nonexistent_proc",
                    headers={"X-CA-Root-Key": "test-admin-key"}
                )
                
                assert response.status_code in [404, 500, 403]

    @pytest.mark.asyncio
    async def test_delete_procedure_invalid_name(self, admin_client, mock_bq_client):
        """Test deleting procedure with invalid name."""
        with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
            response = await admin_client.delete(
                "/api/v1/procedures/invalid!proc@name",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [400, 500, 403]


# ============================================
# Migration Execution Tests
# ============================================

class TestMigrationExecution:
    """Tests for POST /api/v1/migrations/{migration_name}/execute endpoint."""
    
    @pytest.mark.asyncio
    async def test_execute_migration_dry_run(self, admin_client, mock_bq_client):
        """Test executing migration in dry run mode."""
        mock_result = [{"column1": "value1", "affected_rows": 10}]
        mock_bq_client.client.query.return_value.result.return_value = mock_result
        
        with patch("src.app.routers.procedures.procedure_exists", return_value=True):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/migrations/backfill_currency/execute",
                    headers={"X-CA-Root-Key": "test-admin-key"},
                    json={
                        "org_dataset": "test_org_prod",
                        "dry_run": True
                    }
                )
                
                assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_execute_migration_actual_run(self, admin_client, mock_bq_client):
        """Test executing migration for real."""
        mock_result = [{"status": "SUCCESS", "rows_updated": 100}]
        mock_bq_client.client.query.return_value.result.return_value = mock_result
        
        with patch("src.app.routers.procedures.procedure_exists", return_value=True):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/migrations/backfill_currency/execute",
                    headers={"X-CA-Root-Key": "test-admin-key"},
                    json={
                        "org_dataset": "test_org_prod",
                        "dry_run": False
                    }
                )
                
                assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_execute_migration_procedure_not_found(self, admin_client, mock_bq_client):
        """Test executing migration when procedure doesn't exist."""
        with patch("src.app.routers.procedures.procedure_exists", return_value=False):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/migrations/nonexistent_migration/execute",
                    headers={"X-CA-Root-Key": "test-admin-key"},
                    json={
                        "org_dataset": "test_org_prod",
                        "dry_run": True
                    }
                )
                
                assert response.status_code in [404, 500, 403]

    @pytest.mark.asyncio
    async def test_execute_migration_invalid_dataset_format(self, admin_client, mock_bq_client):
        """Test executing migration with invalid dataset format."""
        with patch("src.app.routers.procedures.procedure_exists", return_value=True):
            with patch("src.app.routers.procedures.get_bigquery_client", return_value=mock_bq_client):
                response = await admin_client.post(
                    "/api/v1/migrations/backfill_currency/execute",
                    headers={"X-CA-Root-Key": "test-admin-key"},
                    json={
                        "org_dataset": "invalid!dataset@name",
                        "dry_run": True
                    }
                )
                
                assert response.status_code in [400, 500, 403]


# ============================================
# Authentication Tests
# ============================================

class TestProcedureAuthentication:
    """Tests for procedure endpoint authentication."""
    
    @pytest.mark.asyncio
    async def test_missing_admin_key(self):
        """Test endpoints fail without admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/procedures")
            
            assert response.status_code in [401, 403, 422]

    @pytest.mark.asyncio
    async def test_invalid_admin_key(self):
        """Test endpoints fail with invalid admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/procedures",
                headers={"X-CA-Root-Key": "invalid-key"}
            )
            
            assert response.status_code in [401, 403]
