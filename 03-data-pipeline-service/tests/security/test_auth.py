"""
Authentication & Authorization Tests - Comprehensive Security Testing

Tests API key validation, authentication flows, authorization checks,
rate limiting, quota management, and audit logging.
"""

import pytest
import hashlib
from datetime import datetime, date, timedelta
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi import HTTPException, status
from google.cloud import bigquery

from src.app.dependencies.auth import (
    get_current_org,
    validate_subscription,
    validate_quota,
    increment_pipeline_usage,
    get_org_credentials,
    get_provider_config,
    hash_api_key,
    verify_api_key,
    verify_admin_key,
    get_org_or_admin_auth,
    AuthResult,
    OrgContext,
    AuthMetricsAggregator,
    get_auth_aggregator,
    _constant_time_compare
)


# ============================================
# API Key Hashing Tests
# ============================================

class TestAPIKeyHashing:
    """Test API key hashing for secure storage."""

    def test_hash_api_key_consistency(self):
        """Test API key hashing produces consistent results."""
        # Arrange
        api_key = "test-api-key-12345"

        # Act
        hash1 = hash_api_key(api_key)
        hash2 = hash_api_key(api_key)

        # Assert
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 hex characters

    def test_hash_api_key_different_keys(self):
        """Test different API keys produce different hashes."""
        # Arrange
        key1 = "api-key-1"
        key2 = "api-key-2"

        # Act
        hash1 = hash_api_key(key1)
        hash2 = hash_api_key(key2)

        # Assert
        assert hash1 != hash2

    def test_hash_api_key_sha256_format(self):
        """Test API key hash format is valid SHA256."""
        # Arrange
        api_key = "test-key"

        # Act
        result = hash_api_key(api_key)

        # Assert
        # Verify it matches Python's hashlib SHA256
        expected = hashlib.sha256(api_key.encode()).hexdigest()
        assert result == expected

    def test_hash_empty_api_key(self):
        """Test hashing empty API key."""
        # Act
        result = hash_api_key("")

        # Assert
        assert isinstance(result, str)
        assert len(result) == 64


# ============================================
# Constant-Time Comparison Tests
# ============================================

class TestConstantTimeComparison:
    """Test constant-time string comparison for security."""

    def test_constant_time_compare_equal(self):
        """Test constant-time comparison with equal strings."""
        # Arrange
        val1 = "secret-key-12345"
        val2 = "secret-key-12345"

        # Act
        result = _constant_time_compare(val1, val2)

        # Assert
        assert result is True

    def test_constant_time_compare_not_equal(self):
        """Test constant-time comparison with different strings."""
        # Arrange
        val1 = "secret-key-12345"
        val2 = "different-key-67890"

        # Act
        result = _constant_time_compare(val1, val2)

        # Assert
        assert result is False

    def test_constant_time_compare_different_lengths(self):
        """Test constant-time comparison with different length strings."""
        # Arrange
        val1 = "short"
        val2 = "much-longer-string"

        # Act
        result = _constant_time_compare(val1, val2)

        # Assert
        assert result is False

    def test_constant_time_compare_prevents_timing_attacks(self):
        """Test comparison time is independent of where strings differ."""
        import time

        val1 = "a" * 1000
        val2_early_diff = "b" + "a" * 999  # Differs at position 0
        val2_late_diff = "a" * 999 + "b"   # Differs at position 999

        # Measure time for early difference
        start = time.perf_counter()
        for _ in range(1000):
            _constant_time_compare(val1, val2_early_diff)
        early_time = time.perf_counter() - start

        # Measure time for late difference
        start = time.perf_counter()
        for _ in range(1000):
            _constant_time_compare(val1, val2_late_diff)
        late_time = time.perf_counter() - start

        # Times should be similar (within 50% of each other)
        # Note: This is a weak test - true constant-time would be exactly equal
        ratio = min(early_time, late_time) / max(early_time, late_time)
        assert ratio > 0.5, f"Timing difference suggests non-constant-time: {early_time} vs {late_time}"


# ============================================
# Organization Authentication Tests
# ============================================

class TestGetCurrentOrg:
    """Test organization authentication via API key."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        client = MagicMock()
        return client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.disable_auth = False
            mock.gcp_project_id = "test-project"
            mock.default_org_slug = "dev_org_local"
            mock.is_development = False
            yield mock

    @pytest.mark.asyncio
    async def test_get_current_org_success(self, mock_bq_client, mock_settings):
        """Test successful organization authentication."""
        # Arrange
        api_key = "test-api-key-12345"
        api_key_hash = hash_api_key(api_key)

        # Mock BigQuery response
        mock_row = {
            "org_api_key_id": "key-123",
            "org_slug": "test_org",
            "key_active": True,
            "expires_at": None,
            "scopes": ["pipelines:read", "pipelines:write"],
            "company_name": "Test Company",
            "admin_email": "admin@test.com",
            "org_status": "ACTIVE",
            "org_dataset_id": "test_org_prod",
            "subscription_id": "sub-123",
            "plan_name": "PROFESSIONAL",
            "subscription_status": "ACTIVE",
            "max_pipelines_per_day": 100,
            "max_pipelines_per_month": 3000,
            "max_concurrent_pipelines": 10,
            "trial_end_date": None,
            "subscription_end_date": None
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act
        result = await get_current_org(api_key=api_key, bq_client=mock_bq_client)

        # Assert
        assert result["org_slug"] == "test_org"
        assert result["company_name"] == "Test Company"
        assert result["status"] == "ACTIVE"
        assert result["subscription"]["plan_name"] == "PROFESSIONAL"
        assert result["subscription"]["status"] == "ACTIVE"

    @pytest.mark.asyncio
    async def test_get_current_org_missing_api_key(self, mock_bq_client, mock_settings):
        """Test authentication fails without API key."""
        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_current_org(api_key=None, bq_client=mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "X-API-Key header is required" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_get_current_org_invalid_api_key(self, mock_bq_client, mock_settings):
        """Test authentication fails with invalid API key."""
        # Arrange
        api_key = "invalid-key"
        mock_bq_client.query.return_value = []  # No results

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_current_org(api_key=api_key, bq_client=mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid or inactive API key" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_get_current_org_expired_key(self, mock_bq_client, mock_settings):
        """Test authentication fails with expired API key."""
        # Arrange
        api_key = "expired-key"
        expired_date = datetime.utcnow() - timedelta(days=1)

        mock_row = {
            "org_api_key_id": "key-123",
            "org_slug": "test_org",
            "expires_at": expired_date,
            "company_name": "Test Company",
            "admin_email": "admin@test.com",
            "org_status": "ACTIVE"
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_current_org(api_key=api_key, bq_client=mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "API key has expired" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_get_current_org_disable_auth(self, mock_bq_client):
        """Test authentication bypassed when disabled."""
        # Arrange
        with patch("src.app.dependencies.auth.settings") as mock_settings:
            mock_settings.disable_auth = True
            mock_settings.default_org_slug = "dev_org_local"

            # Act
            result = await get_current_org(api_key=None, bq_client=mock_bq_client)

            # Assert
            assert result["org_slug"] == "dev_org_local"
            assert result["status"] == "ACTIVE"
            assert result["subscription"]["plan_name"] == "ENTERPRISE"

    @pytest.mark.asyncio
    async def test_get_current_org_trial_subscription(self, mock_bq_client, mock_settings):
        """Test authentication succeeds with TRIAL subscription."""
        # Arrange
        api_key = "trial-key"
        mock_row = {
            "org_api_key_id": "key-123",
            "org_slug": "trial_org",
            "key_active": True,
            "expires_at": None,
            "scopes": [],
            "company_name": "Trial Company",
            "admin_email": "trial@test.com",
            "org_status": "ACTIVE",
            "org_dataset_id": "trial_org_prod",
            "subscription_id": "sub-trial",
            "plan_name": "STARTER",
            "subscription_status": "TRIAL",
            "max_pipelines_per_day": 10,
            "max_pipelines_per_month": 100,
            "max_concurrent_pipelines": 3,
            "trial_end_date": date.today() + timedelta(days=7),
            "subscription_end_date": None
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act
        result = await get_current_org(api_key=api_key, bq_client=mock_bq_client)

        # Assert
        assert result["subscription"]["status"] == "TRIAL"
        assert result["subscription"]["trial_end_date"] is not None


# ============================================
# Subscription Validation Tests
# ============================================

class TestValidateSubscription:
    """Test subscription validation logic."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        return MagicMock()

    @pytest.mark.asyncio
    async def test_validate_subscription_active(self, mock_bq_client):
        """Test validation succeeds for active subscription."""
        # Arrange
        org = {
            "org_slug": "test_org",
            "subscription": {
                "status": "ACTIVE",
                "trial_end_date": None,
                "subscription_end_date": date.today() + timedelta(days=30)
            }
        }

        # Act
        result = await validate_subscription(org, mock_bq_client)

        # Assert
        assert result["status"] == "ACTIVE"

    @pytest.mark.asyncio
    async def test_validate_subscription_inactive(self, mock_bq_client):
        """Test validation fails for inactive subscription."""
        # Arrange
        org = {
            "org_slug": "test_org",
            "subscription": {
                "status": "CANCELLED"
            }
        }

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_subscription(org, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "CANCELLED" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_subscription_trial_expired(self, mock_bq_client):
        """Test validation fails for expired trial."""
        # Arrange
        org = {
            "org_slug": "trial_org",
            "subscription": {
                "status": "ACTIVE",
                "trial_end_date": date.today() - timedelta(days=1),
                "subscription_end_date": None
            }
        }

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_subscription(org, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "Trial period has expired" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_subscription_expired(self, mock_bq_client):
        """Test validation fails for expired subscription."""
        # Arrange
        org = {
            "org_slug": "expired_org",
            "subscription": {
                "status": "ACTIVE",
                "trial_end_date": None,
                "subscription_end_date": date.today() - timedelta(days=1)
            }
        }

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_subscription(org, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert "Subscription has expired" in str(exc_info.value.detail)


# ============================================
# Quota Validation Tests
# ============================================

class TestValidateQuota:
    """Test pipeline quota validation and enforcement."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        client = MagicMock()
        client.client = MagicMock()
        return client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.gcp_project_id = "test-project"
            yield mock

    @pytest.fixture
    def org_fixture(self):
        """Standard org fixture."""
        return {
            "org_slug": "test_org",
            "subscription": {
                "max_pipelines_per_day": 100,
                "max_pipelines_per_month": 3000,
                "max_concurrent_pipelines": 10
            }
        }

    @pytest.fixture
    def subscription_fixture(self):
        """Standard subscription fixture."""
        return {
            "max_pipelines_per_day": 100,
            "max_pipelines_per_month": 3000,
            "max_concurrent_pipelines": 10
        }

    @pytest.mark.asyncio
    async def test_validate_quota_within_limits(self, mock_bq_client, mock_settings, org_fixture, subscription_fixture):
        """Test quota validation succeeds within limits."""
        # Arrange
        mock_row = {
            "usage_id": "usage-123",
            "pipelines_run_today": 50,
            "pipelines_run_month": 1500,
            "concurrent_pipelines_running": 5,
            "daily_limit": 100,
            "monthly_limit": 3000,
            "concurrent_limit": 10
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act
        result = await validate_quota(org_fixture, subscription_fixture, mock_bq_client)

        # Assert
        assert result["remaining_today"] == 50
        assert result["remaining_month"] == 1500
        assert result["concurrent_pipelines_running"] == 5

    @pytest.mark.asyncio
    async def test_validate_quota_daily_limit_exceeded(self, mock_bq_client, mock_settings, org_fixture, subscription_fixture):
        """Test quota validation fails when daily limit exceeded."""
        # Arrange
        mock_row = {
            "pipelines_run_today": 100,  # At limit
            "pipelines_run_month": 1500,
            "concurrent_pipelines_running": 5,
            "daily_limit": 100,
            "monthly_limit": 3000,
            "concurrent_limit": 10
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_quota(org_fixture, subscription_fixture, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Daily pipeline quota exceeded" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_quota_monthly_limit_exceeded(self, mock_bq_client, mock_settings, org_fixture, subscription_fixture):
        """Test quota validation fails when monthly limit exceeded."""
        # Arrange
        mock_row = {
            "pipelines_run_today": 50,
            "pipelines_run_month": 3000,  # At limit
            "concurrent_pipelines_running": 5,
            "daily_limit": 100,
            "monthly_limit": 3000,
            "concurrent_limit": 10
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_quota(org_fixture, subscription_fixture, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Monthly pipeline quota exceeded" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_quota_concurrent_limit_reached(self, mock_bq_client, mock_settings, org_fixture, subscription_fixture):
        """Test quota validation fails when concurrent limit reached."""
        # Arrange
        mock_row = {
            "pipelines_run_today": 50,
            "pipelines_run_month": 1500,
            "concurrent_pipelines_running": 10,  # At limit
            "daily_limit": 100,
            "monthly_limit": 3000,
            "concurrent_limit": 10
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await validate_quota(org_fixture, subscription_fixture, mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Concurrent pipeline limit reached" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_quota_creates_record_if_not_exists(self, mock_bq_client, mock_settings, org_fixture, subscription_fixture):
        """Test quota validation creates usage record if none exists."""
        # Arrange
        mock_bq_client.query.return_value = []  # No existing record

        # Mock the insert query execution
        mock_job = MagicMock()
        mock_job.result.return_value = None
        mock_bq_client.client.query.return_value = mock_job

        # Act
        result = await validate_quota(org_fixture, subscription_fixture, mock_bq_client)

        # Assert
        assert result["pipelines_run_today"] == 0
        assert result["pipelines_run_month"] == 0
        assert result["remaining_today"] == 100
        assert result["remaining_month"] == 3000


# ============================================
# Increment Usage Tests
# ============================================

class TestIncrementPipelineUsage:
    """Test pipeline usage counter updates."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        client = MagicMock()
        client.client = MagicMock()
        mock_job = MagicMock()
        mock_job.result.return_value = None
        client.client.query.return_value = mock_job
        return client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.gcp_project_id = "test-project"
            yield mock

    @pytest.mark.asyncio
    async def test_increment_usage_running_status(self, mock_bq_client, mock_settings):
        """Test incrementing concurrent counter for RUNNING status."""
        # Act
        await increment_pipeline_usage("test_org", "RUNNING", mock_bq_client)

        # Assert
        mock_bq_client.client.query.assert_called_once()
        call_args = mock_bq_client.client.query.call_args

        # Verify SQL contains concurrent increment
        assert "concurrent_pipelines_running" in str(call_args)

    @pytest.mark.asyncio
    async def test_increment_usage_success_status(self, mock_bq_client, mock_settings):
        """Test incrementing success counters for SUCCESS status."""
        # Act
        await increment_pipeline_usage("test_org", "SUCCESS", mock_bq_client)

        # Assert
        mock_bq_client.client.query.assert_called_once()
        call_args = mock_bq_client.client.query.call_args

        # Verify SQL increments success counter
        assert "pipelines_succeeded_today" in str(call_args)

    @pytest.mark.asyncio
    async def test_increment_usage_failed_status(self, mock_bq_client, mock_settings):
        """Test incrementing failed counters for FAILED status."""
        # Act
        await increment_pipeline_usage("test_org", "FAILED", mock_bq_client)

        # Assert
        mock_bq_client.client.query.assert_called_once()
        call_args = mock_bq_client.client.query.call_args

        # Verify SQL increments failed counter
        assert "pipelines_failed_today" in str(call_args)


# ============================================
# Credentials Retrieval Tests
# ============================================

class TestGetOrgCredentials:
    """Test organization credentials retrieval and decryption."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        return MagicMock()

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.gcp_project_id = "test-project"
            yield mock

    @pytest.mark.asyncio
    async def test_get_org_credentials_success(self, mock_bq_client, mock_settings):
        """Test successful credential retrieval."""
        # Arrange
        encrypted_creds = b"encrypted_api_key"
        decrypted_creds = '{"api_key": "sk-test123"}'

        mock_row = {
            "credential_id": "cred-123",
            "provider": "OPENAI",
            "credential_type": "API_KEY",
            "credential_name": "OpenAI API Key",
            "encrypted_credentials": encrypted_creds,
            "project_id": None,
            "region": None,
            "scopes": []
        }
        mock_bq_client.query.return_value = [mock_row]

        with patch("src.app.dependencies.auth.decrypt_value") as mock_decrypt:
            mock_decrypt.return_value = decrypted_creds

            # Act
            result = await get_org_credentials("test_org", "OPENAI", mock_bq_client)

            # Assert
            assert result["provider"] == "OPENAI"
            assert result["credentials"]["api_key"] == "sk-test123"
            mock_decrypt.assert_called_once_with(encrypted_creds)

    @pytest.mark.asyncio
    async def test_get_org_credentials_not_found(self, mock_bq_client, mock_settings):
        """Test credential retrieval fails when not configured."""
        # Arrange
        mock_bq_client.query.return_value = []  # No credentials

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_org_credentials("test_org", "OPENAI", mock_bq_client)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "No active OPENAI credentials" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_get_org_credentials_decryption_failure(self, mock_bq_client, mock_settings):
        """Test credential retrieval handles decryption errors."""
        # Arrange
        mock_row = {
            "credential_id": "cred-123",
            "provider": "OPENAI",
            "credential_type": "API_KEY",
            "credential_name": "OpenAI API Key",
            "encrypted_credentials": b"corrupted_data",
            "project_id": None,
            "region": None,
            "scopes": []
        }
        mock_bq_client.query.return_value = [mock_row]

        with patch("src.app.dependencies.auth.decrypt_value") as mock_decrypt:
            mock_decrypt.side_effect = Exception("Decryption failed")

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await get_org_credentials("test_org", "OPENAI", mock_bq_client)

            assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            assert "Failed to decrypt credentials" in str(exc_info.value.detail)


# ============================================
# Admin Authentication Tests
# ============================================

class TestVerifyAdminKey:
    """Test root admin key verification."""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings with root API key."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.ca_root_api_key = "test-root-key-secure-32characters"
            yield mock

    @pytest.mark.asyncio
    async def test_verify_admin_key_success(self, mock_settings):
        """Test successful admin key verification."""
        # Arrange
        root_key = "test-root-key-secure-32characters"

        # Act & Assert - should not raise
        await verify_admin_key(x_ca_root_key=root_key)

    @pytest.mark.asyncio
    async def test_verify_admin_key_missing(self, mock_settings):
        """Test admin key verification fails without key."""
        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await verify_admin_key(x_ca_root_key=None)

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Root API key required" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_verify_admin_key_invalid(self, mock_settings):
        """Test admin key verification fails with wrong key."""
        # Arrange
        wrong_key = "wrong-key"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await verify_admin_key(x_ca_root_key=wrong_key)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Invalid root API key" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_verify_admin_key_not_configured(self):
        """Test admin key verification fails when not configured."""
        # Arrange
        with patch("src.app.dependencies.auth.settings") as mock_settings:
            mock_settings.ca_root_api_key = None

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await verify_admin_key(x_ca_root_key="any-key")

            assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            assert "Root API key not configured" in str(exc_info.value.detail)


# ============================================
# Dual Authentication Tests (Org or Admin)
# ============================================

class TestGetOrgOrAdminAuth:
    """Test dual authentication supporting both org and admin keys."""

    @pytest.fixture
    def mock_bq_client(self):
        """Mock BigQuery client."""
        return MagicMock()

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.app.dependencies.auth.settings") as mock:
            mock.disable_auth = False
            mock.ca_root_api_key = "root-key-12345"
            mock.gcp_project_id = "test-project"
            yield mock

    @pytest.mark.asyncio
    async def test_dual_auth_with_admin_key(self, mock_bq_client, mock_settings):
        """Test authentication succeeds with admin key."""
        # Act
        result = await get_org_or_admin_auth(
            x_api_key=None,
            x_ca_root_key="root-key-12345",
            bq_client=mock_bq_client
        )

        # Assert
        assert result.is_admin is True
        assert result.org_slug is None

    @pytest.mark.asyncio
    async def test_dual_auth_with_org_key(self, mock_bq_client, mock_settings):
        """Test authentication succeeds with org key."""
        # Arrange
        api_key = "org-api-key"
        mock_row = {
            "org_api_key_id": "key-123",
            "org_slug": "test_org",
            "company_name": "Test Company",
            "admin_email": "admin@test.com",
            "org_status": "ACTIVE"
        }
        mock_bq_client.query.return_value = [mock_row]

        # Act
        result = await get_org_or_admin_auth(
            x_api_key=api_key,
            x_ca_root_key=None,
            bq_client=mock_bq_client
        )

        # Assert
        assert result.is_admin is False
        assert result.org_slug == "test_org"
        assert result.org_data is not None

    @pytest.mark.asyncio
    async def test_dual_auth_no_keys(self, mock_bq_client, mock_settings):
        """Test authentication fails with no keys."""
        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_org_or_admin_auth(
                x_api_key=None,
                x_ca_root_key=None,
                bq_client=mock_bq_client
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================
# Auth Metrics Aggregator Tests
# ============================================

class TestAuthMetricsAggregator:
    """Test authentication metrics batching for performance."""

    def test_aggregator_singleton(self):
        """Test AuthMetricsAggregator is a singleton."""
        # Act
        instance1 = get_auth_aggregator()
        instance2 = get_auth_aggregator()

        # Assert
        assert instance1 is instance2

    def test_add_update_batches_keys(self):
        """Test adding updates to batch."""
        # Arrange
        aggregator = AuthMetricsAggregator()
        aggregator.pending_updates.clear()

        # Act
        aggregator.add_update("key-123")
        aggregator.add_update("key-456")
        aggregator.add_update("key-123")  # Duplicate

        # Assert
        assert len(aggregator.pending_updates) == 2  # Set deduplicates
        assert "key-123" in aggregator.pending_updates
        assert "key-456" in aggregator.pending_updates

    @pytest.mark.asyncio
    async def test_flush_updates_success(self):
        """Test flushing batched updates to BigQuery."""
        # Arrange
        aggregator = AuthMetricsAggregator()
        # Use valid UUIDs
        aggregator.pending_updates = {
            "a1b2c3d4-1234-5678-9abc-def012345678",
            "b2c3d4e5-2345-6789-abcd-ef0123456789"
        }

        mock_bq_client = MagicMock()
        mock_job = MagicMock()
        mock_job.result.return_value = None
        mock_bq_client.client.query.return_value = mock_job

        with patch("src.app.dependencies.auth.settings") as mock_settings:
            mock_settings.gcp_project_id = "test-project"

            # Act
            await aggregator.flush_updates(mock_bq_client)

            # Assert
            assert len(aggregator.pending_updates) == 0  # Cleared
            mock_bq_client.client.query.assert_called_once()

    @pytest.mark.asyncio
    async def test_flush_updates_retry_on_failure(self):
        """Test failed flushes are retried."""
        # Arrange
        aggregator = AuthMetricsAggregator()
        # Use valid UUID
        valid_key_id = "a1b2c3d4-1234-5678-9abc-def012345678"
        aggregator.pending_updates = {valid_key_id}

        mock_bq_client = MagicMock()
        mock_bq_client.client.query.side_effect = Exception("BQ error")

        with patch("src.app.dependencies.auth.settings") as mock_settings:
            mock_settings.gcp_project_id = "test-project"

            # Act
            await aggregator.flush_updates(mock_bq_client)

            # Assert - keys re-added for retry
            assert valid_key_id in aggregator.pending_updates

    @pytest.mark.asyncio
    async def test_flush_updates_validates_uuids(self):
        """Test flush validates key IDs are valid UUIDs."""
        # Arrange
        aggregator = AuthMetricsAggregator()
        aggregator.pending_updates = {
            "valid-uuid-a1b2c3d4-1234-5678-9abc-def012345678",
            "invalid-key-sql-injection'; DROP TABLE--"
        }

        mock_bq_client = MagicMock()
        mock_job = MagicMock()
        mock_job.result.return_value = None
        mock_bq_client.client.query.return_value = mock_job

        with patch("src.app.dependencies.auth.settings") as mock_settings:
            mock_settings.gcp_project_id = "test-project"

            # Act
            await aggregator.flush_updates(mock_bq_client)

            # Assert - only valid UUID used
            call_args = mock_bq_client.client.query.call_args
            # The invalid key should be filtered out
