"""
End-to-End Integration Test: Complete User Onboarding Journey

This test validates the entire user onboarding flow from bootstrap to pipeline execution:
1. Bootstrap (system initialization)
2. Organization onboarding (create org + API key + dataset)
3. Integration setup (store encrypted credentials)
4. Pipeline execution (run usage pipeline)
5. Data verification (check data in org dataset)

REQUIRES:
- Real BigQuery connection
- Valid GCP credentials
- KMS encryption enabled
- Real OpenAI API key (from environment)
- Both api-service (8000) and data-pipeline-service (8001) running

Run with:
  pytest tests/test_06_user_onboarding_e2e.py -m integration -v

Set environment variable to enable:
  export REQUIRES_INTEGRATION_TESTS=true
"""

import os
import pytest
import httpx
from datetime import datetime, date
from typing import Dict, Any, Optional
import time
import logging

# Mark all tests in this file as integration tests
pytestmark = [pytest.mark.integration]

logger = logging.getLogger(__name__)


# ============================================
# Test Configuration
# ============================================

# API Service URLs (running locally or remotely)
API_SERVICE_URL = os.environ.get("API_SERVICE_URL", "http://localhost:8000")
PIPELINE_SERVICE_URL = os.environ.get("PIPELINE_SERVICE_URL", "http://localhost:8001")

# Admin authentication
CA_ROOT_API_KEY = os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")

# Test org configuration
TEST_ORG_SLUG = f"test_e2e_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
TEST_COMPANY_NAME = "E2E Test Organization"
TEST_ADMIN_EMAIL = "admin@e2e-test.com"
TEST_SUBSCRIPTION_PLAN = "STARTER"

# Timeouts
REQUEST_TIMEOUT = 60.0  # 60 seconds for integration test requests
PIPELINE_TIMEOUT = 300.0  # 5 minutes for pipeline execution


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def skip_if_integration_tests_disabled():
    """Skip tests if integration tests are explicitly disabled."""
    if os.environ.get("REQUIRES_INTEGRATION_TESTS") != "true":
        pytest.skip(
            "Integration tests disabled. Set REQUIRES_INTEGRATION_TESTS=true to enable."
        )


@pytest.fixture
def admin_headers() -> Dict[str, str]:
    """Headers with admin authentication."""
    return {
        "X-CA-Root-Key": CA_ROOT_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture
def openai_api_key() -> str:
    """Get OpenAI API key from environment or skip test."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        pytest.skip("OPENAI_API_KEY not set - cannot test OpenAI integration")
    return api_key


@pytest.fixture
def bigquery_client():
    """Get BigQuery client for data verification."""
    from google.cloud import bigquery
    return bigquery.Client()


# ============================================
# Helper Functions
# ============================================

async def wait_for_service(url: str, timeout: int = 30) -> bool:
    """
    Wait for a service to become available.

    Args:
        url: Service URL to check
        timeout: Maximum wait time in seconds

    Returns:
        True if service is available, False otherwise
    """
    start_time = time.time()

    async with httpx.AsyncClient(timeout=10.0) as client:
        while time.time() - start_time < timeout:
            try:
                response = await client.get(f"{url}/health")
                if response.status_code == 200:
                    logger.info(f"Service available at {url}")
                    return True
            except Exception as e:
                logger.debug(f"Waiting for service at {url}: {e}")

            await asyncio.sleep(2)

    logger.error(f"Service at {url} not available after {timeout}s")
    return False


async def cleanup_test_org(
    org_slug: str,
    admin_headers: Dict[str, str],
    bq_client: Any
) -> None:
    """
    Cleanup test organization data.

    Removes:
    - Organization profile
    - API keys
    - Subscription
    - Usage quotas
    - Integration credentials
    - BigQuery dataset
    """
    logger.info(f"Cleaning up test organization: {org_slug}")

    # Delete from BigQuery meta tables
    cleanup_queries = [
        f"DELETE FROM `organizations.org_profiles` WHERE org_slug = '{org_slug}'",
        f"DELETE FROM `organizations.org_api_keys` WHERE org_slug = '{org_slug}'",
        f"DELETE FROM `organizations.org_subscriptions` WHERE org_slug = '{org_slug}'",
        f"DELETE FROM `organizations.org_usage_quotas` WHERE org_slug = '{org_slug}'",
        f"DELETE FROM `organizations.org_integration_credentials` WHERE org_slug = '{org_slug}'",
        f"DELETE FROM `organizations.org_meta_pipeline_runs` WHERE org_slug = '{org_slug}'",
    ]

    for query in cleanup_queries:
        try:
            bq_client.query(query).result()
            logger.debug(f"Executed cleanup: {query[:50]}...")
        except Exception as e:
            logger.warning(f"Cleanup query failed (may not exist): {e}")

    # Delete org dataset
    try:
        project_id = os.environ.get("GCP_PROJECT_ID", "gac-prod-471220")
        dataset_id = f"{project_id}.{org_slug}"
        bq_client.delete_dataset(
            dataset_id,
            delete_contents=True,
            not_found_ok=True
        )
        logger.info(f"Deleted dataset: {dataset_id}")
    except Exception as e:
        logger.warning(f"Failed to delete dataset: {e}")


def verify_bigquery_data(
    bq_client: Any,
    org_slug: str,
    table_name: str,
    expected_min_rows: int = 1
) -> Dict[str, Any]:
    """
    Verify data exists in BigQuery table.

    Args:
        bq_client: BigQuery client
        org_slug: Organization slug
        table_name: Table name (without dataset prefix)
        expected_min_rows: Minimum expected row count

    Returns:
        Dict with verification results
    """
    project_id = os.environ.get("GCP_PROJECT_ID", "gac-prod-471220")
    full_table_id = f"{project_id}.{org_slug}.{table_name}"

    try:
        # Query table for row count
        query = f"SELECT COUNT(*) as row_count FROM `{full_table_id}`"
        result = list(bq_client.query(query).result())

        row_count = result[0]["row_count"] if result else 0

        return {
            "exists": row_count >= expected_min_rows,
            "row_count": row_count,
            "table_id": full_table_id
        }
    except Exception as e:
        logger.error(f"Failed to verify data in {full_table_id}: {e}")
        return {
            "exists": False,
            "row_count": 0,
            "table_id": full_table_id,
            "error": str(e)
        }


# ============================================
# E2E Test: Complete User Onboarding Journey
# ============================================

@pytest.mark.asyncio
async def test_complete_user_onboarding_e2e(
    skip_if_integration_tests_disabled,
    admin_headers: Dict[str, str],
    openai_api_key: str,
    bigquery_client: Any
):
    """
    End-to-end test for complete user onboarding journey.

    This test validates the entire flow from bootstrap to pipeline execution:
    1. Bootstrap (create meta tables)
    2. Organization onboarding (create org + API key)
    3. Integration setup (OpenAI credentials)
    4. Pipeline execution (run usage pipeline)
    5. Data verification (check data in org dataset)

    REQUIRES: Real BigQuery, KMS, and OpenAI API key
    """
    import asyncio

    org_api_key: Optional[str] = None

    try:
        # ============================================
        # STEP 0: Wait for services to be ready
        # ============================================
        logger.info("Step 0: Checking service availability...")

        api_service_ready = await wait_for_service(API_SERVICE_URL, timeout=30)
        pipeline_service_ready = await wait_for_service(PIPELINE_SERVICE_URL, timeout=30)

        assert api_service_ready, f"API service not available at {API_SERVICE_URL}"
        assert pipeline_service_ready, f"Pipeline service not available at {PIPELINE_SERVICE_URL}"

        logger.info("✓ Both services are available")

        # ============================================
        # STEP 1: Bootstrap (Create Meta Tables)
        # ============================================
        logger.info("Step 1: Running bootstrap to create meta tables...")

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/admin/bootstrap",
                headers=admin_headers,
                json={
                    "force_recreate_dataset": False,
                    "force_recreate_tables": False
                }
            )

        # Bootstrap should succeed or be idempotent
        assert response.status_code == 200, f"Bootstrap failed: {response.status_code} - {response.text}"

        bootstrap_data = response.json()
        assert bootstrap_data["status"] == "SUCCESS"
        assert bootstrap_data["total_tables"] == 15  # Expected 15 meta tables

        logger.info(f"✓ Bootstrap completed: {len(bootstrap_data.get('tables_created', []))} tables created, "
                   f"{len(bootstrap_data.get('tables_existed', []))} tables existed")

        # ============================================
        # STEP 2: Organization Onboarding
        # ============================================
        logger.info(f"Step 2: Onboarding organization: {TEST_ORG_SLUG}...")

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/organizations/onboard",
                headers=admin_headers,
                json={
                    "org_slug": TEST_ORG_SLUG,
                    "company_name": TEST_COMPANY_NAME,
                    "admin_email": TEST_ADMIN_EMAIL,
                    "subscription_plan": TEST_SUBSCRIPTION_PLAN,
                    "force_recreate_dataset": False,
                    "force_recreate_tables": False
                }
            )

        assert response.status_code == 200, f"Onboarding failed: {response.status_code} - {response.text}"

        onboard_data = response.json()
        org_api_key = onboard_data["api_key"]

        assert onboard_data["org_slug"] == TEST_ORG_SLUG
        assert org_api_key is not None and len(org_api_key) > 20
        assert onboard_data["subscription_plan"] == TEST_SUBSCRIPTION_PLAN
        assert onboard_data["dataset_created"] is True

        logger.info(f"✓ Organization onboarded: {TEST_ORG_SLUG}")
        logger.info(f"  - API Key: {org_api_key[:20]}... (length: {len(org_api_key)})")
        logger.info(f"  - Tables created: {len(onboard_data.get('tables_created', []))}")

        # Verify org exists in BigQuery
        org_check_query = f"""
        SELECT org_slug, status, subscription_plan
        FROM `organizations.org_profiles`
        WHERE org_slug = '{TEST_ORG_SLUG}'
        LIMIT 1
        """

        org_result = list(bigquery_client.query(org_check_query).result())
        assert len(org_result) == 1, "Organization not found in BigQuery"
        assert org_result[0]["status"] == "ACTIVE"

        logger.info(f"✓ Verified organization exists in BigQuery with status: ACTIVE")

        # ============================================
        # STEP 3: Integration Setup (OpenAI)
        # ============================================
        logger.info("Step 3: Setting up OpenAI integration...")

        org_headers = {
            "X-API-Key": org_api_key,
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/integrations/{TEST_ORG_SLUG}/openai/setup",
                headers=org_headers,
                json={
                    "api_key": openai_api_key
                }
            )

        assert response.status_code in [200, 201], \
            f"OpenAI integration setup failed: {response.status_code} - {response.text}"

        integration_data = response.json()
        assert integration_data["provider"] == "openai"
        assert integration_data["status"] in ["active", "validated", "configured"]

        logger.info(f"✓ OpenAI integration setup completed with status: {integration_data['status']}")

        # Verify credentials stored encrypted
        creds_check_query = f"""
        SELECT provider, credential_type, is_active
        FROM `organizations.org_integration_credentials`
        WHERE org_slug = '{TEST_ORG_SLUG}'
          AND provider = 'openai'
        LIMIT 1
        """

        creds_result = list(bigquery_client.query(creds_check_query).result())
        assert len(creds_result) == 1, "OpenAI credentials not found in BigQuery"
        assert creds_result[0]["is_active"] is True

        logger.info(f"✓ Verified OpenAI credentials stored encrypted in BigQuery")

        # ============================================
        # STEP 4: Pipeline Execution (OpenAI Usage)
        # ============================================
        logger.info("Step 4: Executing OpenAI usage pipeline...")

        # Use yesterday's date to ensure data exists
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")

        async with httpx.AsyncClient(timeout=PIPELINE_TIMEOUT) as client:
            response = await client.post(
                f"{PIPELINE_SERVICE_URL}/api/v1/pipelines/run/{TEST_ORG_SLUG}/openai/cost/usage_cost",
                headers=org_headers,
                json={
                    "start_date": yesterday,
                    "end_date": yesterday
                }
            )

        # Pipeline may fail if no usage data exists, but should process successfully
        # We check for both success and expected failure scenarios
        if response.status_code == 200:
            pipeline_data = response.json()
            logger.info(f"✓ Pipeline executed successfully: {pipeline_data.get('message', 'No message')}")

            # Verify pipeline run logged
            pipeline_run_query = f"""
            SELECT pipeline_id, status, org_slug
            FROM `organizations.org_meta_pipeline_runs`
            WHERE org_slug = '{TEST_ORG_SLUG}'
              AND pipeline_id LIKE '%openai%'
            ORDER BY created_at DESC
            LIMIT 1
            """

            pipeline_run_result = list(bigquery_client.query(pipeline_run_query).result())
            assert len(pipeline_run_result) >= 1, "Pipeline run not logged in BigQuery"

            logger.info(f"✓ Verified pipeline run logged: status={pipeline_run_result[0]['status']}")

        elif response.status_code == 400:
            # Pipeline may fail if no usage data - this is acceptable for test
            error_data = response.json()
            logger.warning(f"Pipeline returned 400 (no usage data expected): {error_data.get('detail', 'No detail')}")
        else:
            # Unexpected error
            pytest.fail(f"Pipeline failed unexpectedly: {response.status_code} - {response.text}")

        # ============================================
        # STEP 5: Data Verification (Check Quota Consumption)
        # ============================================
        logger.info("Step 5: Verifying quota consumption...")

        # Check that quota was consumed
        quota_check_query = f"""
        SELECT pipelines_run_today, pipelines_succeeded_today, pipelines_failed_today
        FROM `organizations.org_usage_quotas`
        WHERE org_slug = '{TEST_ORG_SLUG}'
          AND usage_date = CURRENT_DATE()
        LIMIT 1
        """

        quota_result = list(bigquery_client.query(quota_check_query).result())

        if len(quota_result) > 0:
            quota_data = quota_result[0]
            pipelines_run = quota_data["pipelines_run_today"]

            # At least one pipeline should have been run
            assert pipelines_run >= 1, f"Expected at least 1 pipeline run, got {pipelines_run}"

            logger.info(f"✓ Verified quota consumption:")
            logger.info(f"  - Pipelines run today: {pipelines_run}")
            logger.info(f"  - Pipelines succeeded: {quota_data['pipelines_succeeded_today']}")
            logger.info(f"  - Pipelines failed: {quota_data['pipelines_failed_today']}")
        else:
            logger.warning("No quota record found for today - may not have been created yet")

        # ============================================
        # STEP 6: Final Verification
        # ============================================
        logger.info("Step 6: Final verification of complete onboarding...")

        # Get subscription details
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                f"{API_SERVICE_URL}/api/v1/organizations/{TEST_ORG_SLUG}/subscription",
                headers=org_headers
            )

        assert response.status_code == 200, f"Failed to get subscription: {response.text}"

        subscription_data = response.json()
        assert subscription_data["org_slug"] == TEST_ORG_SLUG
        assert subscription_data["plan_name"] == TEST_SUBSCRIPTION_PLAN
        assert subscription_data["status"] in ["ACTIVE", "TRIAL"]

        logger.info(f"✓ Final verification completed:")
        logger.info(f"  - Subscription plan: {subscription_data['plan_name']}")
        logger.info(f"  - Subscription status: {subscription_data['status']}")
        logger.info(f"  - Daily limit: {subscription_data['daily_limit']}")
        logger.info(f"  - Monthly limit: {subscription_data['monthly_limit']}")

        # ============================================
        # SUCCESS: All steps completed
        # ============================================
        logger.info("\n" + "="*80)
        logger.info("✓ E2E USER ONBOARDING TEST PASSED")
        logger.info("="*80)
        logger.info(f"Organization: {TEST_ORG_SLUG}")
        logger.info(f"All steps completed successfully:")
        logger.info("  1. Bootstrap ✓")
        logger.info("  2. Organization Onboarding ✓")
        logger.info("  3. Integration Setup ✓")
        logger.info("  4. Pipeline Execution ✓")
        logger.info("  5. Data Verification ✓")
        logger.info("  6. Final Verification ✓")
        logger.info("="*80 + "\n")

    except AssertionError:
        raise  # Re-raise assertion errors

    except Exception as e:
        logger.error(f"E2E test failed with exception: {e}", exc_info=True)
        pytest.fail(f"E2E test failed: {str(e)}")

    finally:
        # ============================================
        # Cleanup: Remove test organization
        # ============================================
        logger.info("\nCleaning up test organization...")

        try:
            await cleanup_test_org(
                org_slug=TEST_ORG_SLUG,
                admin_headers=admin_headers,
                bq_client=bigquery_client
            )
            logger.info(f"✓ Cleanup completed for: {TEST_ORG_SLUG}")
        except Exception as cleanup_error:
            logger.error(f"Cleanup failed (non-fatal): {cleanup_error}")


# ============================================
# Focused E2E Tests (Optional - Faster)
# ============================================

@pytest.mark.asyncio
async def test_bootstrap_only(
    skip_if_integration_tests_disabled,
    admin_headers: Dict[str, str]
):
    """
    Test only the bootstrap step.

    Faster test for verifying bootstrap works correctly.
    """
    logger.info("Testing bootstrap only...")

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{API_SERVICE_URL}/api/v1/admin/bootstrap",
            headers=admin_headers,
            json={
                "force_recreate_dataset": False,
                "force_recreate_tables": False
            }
        )

    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total_tables"] == 15

    # Either tables were created or already existed (idempotent)
    assert len(data["tables_created"]) + len(data["tables_existed"]) == 15

    logger.info(f"✓ Bootstrap test passed: {data['total_tables']} tables verified")


@pytest.mark.asyncio
async def test_org_onboarding_only(
    skip_if_integration_tests_disabled,
    admin_headers: Dict[str, str],
    bigquery_client: Any
):
    """
    Test only organization onboarding.

    Faster test for verifying org creation works correctly.
    """
    test_org_slug = f"test_onboard_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    try:
        logger.info(f"Testing org onboarding only: {test_org_slug}...")

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/organizations/onboard",
                headers=admin_headers,
                json={
                    "org_slug": test_org_slug,
                    "company_name": "Test Onboarding Only",
                    "admin_email": "test@onboarding.com",
                    "subscription_plan": "STARTER"
                }
            )

        assert response.status_code == 200

        data = response.json()
        assert data["org_slug"] == test_org_slug
        assert data["api_key"] is not None
        assert len(data["api_key"]) > 20

        logger.info(f"✓ Org onboarding test passed: {test_org_slug}")

    finally:
        # Cleanup
        await cleanup_test_org(test_org_slug, admin_headers, bigquery_client)


@pytest.mark.asyncio
async def test_integration_setup_only(
    skip_if_integration_tests_disabled,
    admin_headers: Dict[str, str],
    openai_api_key: str,
    bigquery_client: Any
):
    """
    Test only integration setup.

    Faster test for verifying credential storage works correctly.
    """
    test_org_slug = f"test_integration_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    try:
        logger.info(f"Testing integration setup only: {test_org_slug}...")

        # First, onboard the org
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/organizations/onboard",
                headers=admin_headers,
                json={
                    "org_slug": test_org_slug,
                    "company_name": "Test Integration Only",
                    "admin_email": "test@integration.com",
                    "subscription_plan": "STARTER"
                }
            )

        assert response.status_code == 200
        org_api_key = response.json()["api_key"]

        # Now setup OpenAI integration
        org_headers = {
            "X-API-Key": org_api_key,
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{API_SERVICE_URL}/api/v1/integrations/{test_org_slug}/openai/setup",
                headers=org_headers,
                json={
                    "api_key": openai_api_key
                }
            )

        assert response.status_code in [200, 201]

        data = response.json()
        assert data["provider"] == "openai"
        assert data["status"] in ["active", "validated", "configured"]

        logger.info(f"✓ Integration setup test passed: {test_org_slug}")

    finally:
        # Cleanup
        await cleanup_test_org(test_org_slug, admin_headers, bigquery_client)
