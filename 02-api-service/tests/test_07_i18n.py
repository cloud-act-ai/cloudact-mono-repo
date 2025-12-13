"""
Test Suite for i18n (Internationalization) Endpoints

Tests organization locale management:
- POST /api/v1/organizations/onboard - Create org with currency/timezone
- GET /api/v1/organizations/{org_slug}/locale - Get locale settings
- PUT /api/v1/organizations/{org_slug}/locale - Update locale settings
- Currency/timezone validation
- Auto-inference of country from currency

These are ZERO-MOCK integration tests that use real BigQuery.
Run with: pytest tests/test_07_i18n.py -v --run-integration
"""

import os
import pytest
import uuid
from httpx import AsyncClient, ASGITransport

# Set environment variables BEFORE importing app
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("CA_ROOT_API_KEY", "test-root-key-for-testing-only-32chars")
os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")

from src.app.main import app


# ============================================
# Test Configuration
# ============================================

ROOT_API_KEY = "test-root-key-for-testing-only-32chars"


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def unique_org_slug():
    """Generate a unique org slug for each test."""
    unique_id = str(uuid.uuid4())[:8]
    return f"i18ntest_{unique_id}"


@pytest.fixture
def root_headers():
    """Headers with root API key for admin operations."""
    return {
        "X-CA-Root-Key": ROOT_API_KEY,
        "Content-Type": "application/json"
    }


# ============================================
# Test: Create Organization with AED Currency and Asia/Dubai Timezone
# ============================================

@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_org_with_aed_and_dubai_timezone(root_headers, unique_org_slug):
    """
    Test creating organization with AED currency and Asia/Dubai timezone.

    Flow:
    1. Onboard org with default_currency=AED, default_timezone=Asia/Dubai
    2. Verify org profile includes correct i18n settings
    3. Verify auto-inferred country is AE (from AED)
    4. Verify default_language is en (default)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create org with AED currency and Dubai timezone
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Dubai Test Company",
                "admin_email": "admin@dubaitest.com",
                "subscription_plan": "STARTER",
                "default_currency": "AED",
                "default_timezone": "Asia/Dubai"
            }
        )

        # Should succeed (200 or 201)
        assert response.status_code in [200, 201], f"Unexpected status: {response.status_code}, body: {response.text}"

        data = response.json()

        # Verify i18n fields
        assert data["org_profile"]["default_currency"] == "AED"
        assert data["org_profile"]["default_timezone"] == "Asia/Dubai"
        assert data["org_profile"]["default_country"] == "AE"  # Auto-inferred from AED
        assert data["org_profile"]["default_language"] == "en"  # Default


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_org_with_jpy_and_tokyo_timezone(root_headers, unique_org_slug):
    """
    Test creating organization with JPY currency and Asia/Tokyo timezone.

    JPY is special: 0 decimal places (not 2).
    Country should be auto-inferred as JP.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Tokyo Test Company",
                "admin_email": "admin@tokyotest.com",
                "subscription_plan": "STARTER",
                "default_currency": "JPY",
                "default_timezone": "Asia/Tokyo"
            }
        )

        assert response.status_code in [200, 201]
        data = response.json()

        assert data["org_profile"]["default_currency"] == "JPY"
        assert data["org_profile"]["default_timezone"] == "Asia/Tokyo"
        assert data["org_profile"]["default_country"] == "JP"
        assert data["org_profile"]["default_language"] == "en"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_org_with_kwd_currency(root_headers, unique_org_slug):
    """
    Test creating organization with KWD (Kuwaiti Dinar).

    KWD is special: 3 decimal places (not 2).
    Country should be auto-inferred as KW.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Kuwait Test Company",
                "admin_email": "admin@kuwittest.com",
                "subscription_plan": "STARTER",
                "default_currency": "KWD",
                "default_timezone": "Asia/Riyadh"
            }
        )

        assert response.status_code in [200, 201]
        data = response.json()

        assert data["org_profile"]["default_currency"] == "KWD"
        assert data["org_profile"]["default_country"] == "KW"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_org_defaults_to_usd_utc(root_headers, unique_org_slug):
    """
    Test that omitting currency/timezone defaults to USD/UTC.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Default Test Company",
                "admin_email": "admin@defaulttest.com",
                "subscription_plan": "STARTER"
                # No default_currency or default_timezone
            }
        )

        assert response.status_code in [200, 201]
        data = response.json()

        # Should use defaults
        assert data["org_profile"]["default_currency"] == "USD"
        assert data["org_profile"]["default_timezone"] == "UTC"
        assert data["org_profile"]["default_country"] == "US"
        assert data["org_profile"]["default_language"] == "en"


# ============================================
# Test: GET /organizations/{org_slug}/locale
# ============================================

@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_org_locale(root_headers, unique_org_slug):
    """
    Test GET /api/v1/organizations/{org_slug}/locale endpoint.

    Flow:
    1. Create org with AED/Asia/Dubai
    2. Fetch locale settings via GET endpoint
    3. Verify response includes currency metadata (symbol, name, decimals)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create org first
        create_response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Locale Test Company",
                "admin_email": "admin@localetest.com",
                "subscription_plan": "STARTER",
                "default_currency": "AED",
                "default_timezone": "Asia/Dubai"
            }
        )
        assert create_response.status_code in [200, 201]

        # Get locale settings
        locale_response = await client.get(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers
        )

        assert locale_response.status_code == 200
        locale_data = locale_response.json()

        # Verify all locale fields
        assert locale_data["org_slug"] == unique_org_slug
        assert locale_data["default_currency"] == "AED"
        assert locale_data["default_country"] == "AE"
        assert locale_data["default_language"] == "en"
        assert locale_data["default_timezone"] == "Asia/Dubai"

        # Verify currency metadata
        assert locale_data["currency_symbol"] == "د.إ"
        assert locale_data["currency_name"] == "UAE Dirham"
        assert locale_data["currency_decimals"] == 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_locale_for_jpy_org(root_headers, unique_org_slug):
    """
    Test GET locale for JPY org (should show 0 decimals).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create JPY org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "JPY Test",
                "admin_email": "admin@jpytest.com",
                "subscription_plan": "STARTER",
                "default_currency": "JPY",
                "default_timezone": "Asia/Tokyo"
            }
        )

        # Get locale
        response = await client.get(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers
        )

        assert response.status_code == 200
        data = response.json()

        assert data["default_currency"] == "JPY"
        assert data["currency_symbol"] == "¥"
        assert data["currency_decimals"] == 0  # JPY has 0 decimals


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_locale_for_kwd_org(root_headers, unique_org_slug):
    """
    Test GET locale for KWD org (should show 3 decimals).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create KWD org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "KWD Test",
                "admin_email": "admin@kwdtest.com",
                "subscription_plan": "STARTER",
                "default_currency": "KWD",
                "default_timezone": "Asia/Riyadh"
            }
        )

        # Get locale
        response = await client.get(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers
        )

        assert response.status_code == 200
        data = response.json()

        assert data["default_currency"] == "KWD"
        assert data["currency_symbol"] == "د.ك"
        assert data["currency_decimals"] == 3  # KWD has 3 decimals


# ============================================
# Test: PUT /organizations/{org_slug}/locale
# ============================================

@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_org_locale_currency_only(root_headers, unique_org_slug):
    """
    Test updating only the currency (timezone stays same).

    Flow:
    1. Create org with USD/UTC
    2. Update to EUR (timezone stays UTC)
    3. Verify country auto-inferred to DE
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create USD org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Update Test",
                "admin_email": "admin@updatetest.com",
                "subscription_plan": "STARTER",
                "default_currency": "USD",
                "default_timezone": "UTC"
            }
        )

        # Update currency to EUR
        update_response = await client.put(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers,
            json={
                "default_currency": "EUR"
                # No default_timezone (should stay UTC)
            }
        )

        assert update_response.status_code == 200
        data = update_response.json()

        assert data["default_currency"] == "EUR"
        assert data["default_country"] == "DE"  # Auto-inferred from EUR
        assert data["default_timezone"] == "UTC"  # Unchanged
        assert data["currency_symbol"] == "€"
        assert data["currency_decimals"] == 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_org_locale_timezone_only(root_headers, unique_org_slug):
    """
    Test updating only the timezone (currency stays same).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create USD/UTC org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "TZ Update Test",
                "admin_email": "admin@tztest.com",
                "subscription_plan": "STARTER",
                "default_currency": "USD",
                "default_timezone": "UTC"
            }
        )

        # Update timezone to America/New_York
        update_response = await client.put(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers,
            json={
                "default_timezone": "America/New_York"
                # No default_currency (should stay USD)
            }
        )

        assert update_response.status_code == 200
        data = update_response.json()

        assert data["default_currency"] == "USD"  # Unchanged
        assert data["default_timezone"] == "America/New_York"  # Updated


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_org_locale_both_fields(root_headers, unique_org_slug):
    """
    Test updating both currency and timezone together.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create USD/UTC org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Both Update Test",
                "admin_email": "admin@bothtest.com",
                "subscription_plan": "STARTER",
                "default_currency": "USD",
                "default_timezone": "UTC"
            }
        )

        # Update both to AED/Asia/Dubai
        update_response = await client.put(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers,
            json={
                "default_currency": "AED",
                "default_timezone": "Asia/Dubai"
            }
        )

        assert update_response.status_code == 200
        data = update_response.json()

        assert data["default_currency"] == "AED"
        assert data["default_country"] == "AE"
        assert data["default_timezone"] == "Asia/Dubai"
        assert data["currency_symbol"] == "د.إ"


# ============================================
# Test: Invalid Currency/Timezone Validation
# ============================================

@pytest.mark.asyncio
async def test_create_org_with_invalid_currency(root_headers, unique_org_slug):
    """
    Test that invalid currency is rejected with 422.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Invalid Currency Test",
                "admin_email": "admin@invalidcurrency.com",
                "subscription_plan": "STARTER",
                "default_currency": "XYZ"  # Invalid currency
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_create_org_with_invalid_timezone(root_headers, unique_org_slug):
    """
    Test that invalid timezone is rejected with 422.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Invalid TZ Test",
                "admin_email": "admin@invalidtz.com",
                "subscription_plan": "STARTER",
                "default_timezone": "Invalid/Timezone"  # Invalid
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_locale_with_invalid_currency(root_headers, unique_org_slug):
    """
    Test that updating to invalid currency is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create valid org first
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Update Invalid Test",
                "admin_email": "admin@updateinvalid.com",
                "subscription_plan": "STARTER"
            }
        )

        # Try to update to invalid currency
        response = await client.put(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers,
            json={
                "default_currency": "INVALID"
            }
        )

        assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_locale_with_invalid_timezone(root_headers, unique_org_slug):
    """
    Test that updating to invalid timezone is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create valid org
        await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "TZ Invalid Test",
                "admin_email": "admin@tzinvalid.com",
                "subscription_plan": "STARTER"
            }
        )

        # Try to update to invalid timezone
        response = await client.put(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers=root_headers,
            json={
                "default_timezone": "America/InvalidCity"
            }
        )

        assert response.status_code == 422


# ============================================
# Test: All Supported Currencies
# ============================================

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("currency,expected_country", [
    ("USD", "US"),
    ("EUR", "DE"),
    ("GBP", "GB"),
    ("JPY", "JP"),
    ("CHF", "CH"),
    ("CAD", "CA"),
    ("AUD", "AU"),
    ("CNY", "CN"),
    ("INR", "IN"),
    ("SGD", "SG"),
    ("AED", "AE"),
    ("SAR", "SA"),
    ("QAR", "QA"),
    ("KWD", "KW"),
    ("BHD", "BH"),
    ("OMR", "OM"),
])
async def test_all_supported_currencies(root_headers, currency, expected_country):
    """
    Test that all supported currencies are accepted and map to correct countries.
    """
    unique_slug = f"currency_{currency.lower()}_{str(uuid.uuid4())[:8]}"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_slug,
                "company_name": f"{currency} Test Company",
                "admin_email": f"admin@{currency.lower()}test.com",
                "subscription_plan": "STARTER",
                "default_currency": currency
            }
        )

        assert response.status_code in [200, 201], f"Failed for {currency}: {response.text}"
        data = response.json()

        assert data["org_profile"]["default_currency"] == currency
        assert data["org_profile"]["default_country"] == expected_country


# ============================================
# Test: All Supported Timezones
# ============================================

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("timezone", [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Riyadh",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
])
async def test_all_supported_timezones(root_headers, timezone):
    """
    Test that all supported timezones are accepted.
    """
    tz_slug = timezone.replace("/", "_").lower()
    unique_slug = f"tz_{tz_slug}_{str(uuid.uuid4())[:8]}"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_slug,
                "company_name": f"{timezone} Test Company",
                "admin_email": f"admin@{tz_slug}test.com",
                "subscription_plan": "STARTER",
                "default_timezone": timezone
            }
        )

        assert response.status_code in [200, 201], f"Failed for {timezone}: {response.text}"
        data = response.json()

        assert data["org_profile"]["default_timezone"] == timezone


# ============================================
# Test: Edge Cases
# ============================================

@pytest.mark.asyncio
async def test_locale_endpoint_requires_auth(unique_org_slug):
    """
    Test that locale endpoints require authentication.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # GET without auth
        response = await client.get(
            f"/api/v1/organizations/{unique_org_slug}/locale",
            headers={"Content-Type": "application/json"}
        )

        assert response.status_code in [401, 403]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_locale_for_nonexistent_org(root_headers):
    """
    Test GET locale for org that doesn't exist.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/organizations/nonexistent_org_12345/locale",
            headers=root_headers
        )

        # Should be 404 or 500 (org not found)
        assert response.status_code in [404, 500]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_locale_for_nonexistent_org(root_headers):
    """
    Test UPDATE locale for org that doesn't exist.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.put(
            "/api/v1/organizations/nonexistent_org_12345/locale",
            headers=root_headers,
            json={
                "default_currency": "EUR"
            }
        )

        assert response.status_code in [404, 500]
