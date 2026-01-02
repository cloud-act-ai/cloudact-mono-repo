"""
Root conftest.py - Sets environment variables before any module imports.

This file is loaded by pytest before any test modules, ensuring environment
variables are set before the settings module is imported.

Multi-Environment Support:
- Set TEST_ENV to switch between environments (local, stage, prod)
- Set TEST_ORG_SLUG to use a specific org for testing
- Set TEST_ORG_API_KEY to use a specific API key

Multi-User/Multi-Currency Support:
- Fixtures for USD, INR, EUR orgs
- Fixtures for different fiscal year configurations
- Parameterized test support for cross-org testing
"""

import os
from typing import Dict, Any, List
from dataclasses import dataclass
from datetime import date

# ============================================
# Environment Configuration
# ============================================

# Default environment settings - can be overridden via env vars
# Environments: local (native), development (docker), stage (Cloud Run), prod (Cloud Run)
TEST_ENV = os.environ.get("TEST_ENV", "local")

# Environment-specific configurations
ENV_CONFIGS = {
    # Local: Running services natively (python -m uvicorn)
    "local": {
        "api_base_url": os.environ.get("API_SERVICE_URL", "http://localhost:8000"),
        "pipeline_base_url": os.environ.get("PIPELINE_SERVICE_URL", "http://localhost:8001"),
        "frontend_base_url": os.environ.get("FRONTEND_URL", "http://localhost:3000"),
        "gcp_project_id": os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1"),
        "ca_root_api_key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-dev-32chars-min"),
        "dataset_suffix": "_local",
        "description": "Local development (native Python/Node)",
    },
    # Development: Running via Docker Compose
    "development": {
        "api_base_url": os.environ.get("API_SERVICE_URL", "http://localhost:8000"),
        "pipeline_base_url": os.environ.get("PIPELINE_SERVICE_URL", "http://localhost:8001"),
        "frontend_base_url": os.environ.get("FRONTEND_URL", "http://localhost:3000"),
        "gcp_project_id": os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1"),
        "ca_root_api_key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-dev-32chars-min"),
        "dataset_suffix": "_local",
        "description": "Docker Compose development environment",
    },
    # Stage: Cloud Run staging environment
    "stage": {
        "api_base_url": os.environ.get("STAGE_API_URL", ""),  # Set via STAGE_API_URL env var
        "pipeline_base_url": os.environ.get("STAGE_PIPELINE_URL", ""),  # Set via STAGE_PIPELINE_URL env var
        "frontend_base_url": os.environ.get("STAGE_FRONTEND_URL", "https://cloudact-stage.vercel.app"),
        "gcp_project_id": os.environ.get("STAGE_GCP_PROJECT", "cloudact-stage"),
        "ca_root_api_key": os.environ.get("STAGE_CA_ROOT_API_KEY", ""),
        "dataset_suffix": "_stage",
        "description": "Cloud Run staging environment",
    },
    # Prod: Cloud Run production environment
    "prod": {
        "api_base_url": os.environ.get("PROD_API_URL", "https://api.cloudact.ai"),
        "pipeline_base_url": os.environ.get("PROD_PIPELINE_URL", "https://pipeline.cloudact.ai"),
        "frontend_base_url": os.environ.get("PROD_FRONTEND_URL", "https://cloudact.ai"),
        "gcp_project_id": os.environ.get("PROD_GCP_PROJECT", "cloudact-prod"),
        "ca_root_api_key": os.environ.get("PROD_CA_ROOT_API_KEY", ""),
        "dataset_suffix": "_prod",
        "description": "Cloud Run production environment",
    },
}

# Alias docker to development
ENV_CONFIGS["docker"] = ENV_CONFIGS["development"]

def get_env_config(env: str = None) -> Dict[str, str]:
    """Get configuration for the specified environment."""
    env = env or TEST_ENV
    return ENV_CONFIGS.get(env, ENV_CONFIGS["local"])


# Set environment variables BEFORE any imports that might load settings
# These must be set before src.app.config is imported anywhere
env_config = get_env_config()
os.environ["GCP_PROJECT_ID"] = env_config["gcp_project_id"]
os.environ["ENVIRONMENT"] = "development"
os.environ["KMS_KEY_NAME"] = "projects/test/locations/global/keyRings/test/cryptoKeys/test"
os.environ["CA_ROOT_API_KEY"] = env_config["ca_root_api_key"]
os.environ["DISABLE_AUTH"] = "true"

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import MagicMock, patch


# ============================================
# Multi-Org Test Configurations
# ============================================

@dataclass
class OrgTestConfig:
    """Configuration for a test organization."""
    org_slug: str
    company_name: str
    admin_email: str
    default_currency: str
    default_timezone: str
    default_country: str
    fiscal_year_start_month: int  # 1=Jan, 4=Apr (India), 7=Jul (Australia)
    subscription_plan: str = "PROFESSIONAL"
    api_key: str = ""  # Set during test setup


# Pre-defined org configurations for different regions/currencies
ORG_CONFIGS = {
    "us_corp": OrgTestConfig(
        org_slug="us_corp_test",
        company_name="US Corporation Test",
        admin_email="admin@uscorp.test",
        default_currency="USD",
        default_timezone="America/New_York",
        default_country="US",
        fiscal_year_start_month=1,  # Calendar year
    ),
    "india_corp": OrgTestConfig(
        org_slug="india_corp_test",
        company_name="India Corporation Test",
        admin_email="admin@indiacorp.test",
        default_currency="INR",
        default_timezone="Asia/Kolkata",
        default_country="IN",
        fiscal_year_start_month=4,  # April fiscal year
    ),
    "eu_corp": OrgTestConfig(
        org_slug="eu_corp_test",
        company_name="EU Corporation Test",
        admin_email="admin@eucorp.test",
        default_currency="EUR",
        default_timezone="Europe/Berlin",
        default_country="DE",
        fiscal_year_start_month=1,  # Calendar year
    ),
    "uae_corp": OrgTestConfig(
        org_slug="uae_corp_test",
        company_name="UAE Corporation Test",
        admin_email="admin@uaecorp.test",
        default_currency="AED",
        default_timezone="Asia/Dubai",
        default_country="AE",
        fiscal_year_start_month=1,  # Calendar year
    ),
    "australia_corp": OrgTestConfig(
        org_slug="australia_corp_test",
        company_name="Australia Corporation Test",
        admin_email="admin@aucorp.test",
        default_currency="AUD",
        default_timezone="Australia/Sydney",
        default_country="AU",
        fiscal_year_start_month=7,  # July fiscal year
    ),
    "japan_corp": OrgTestConfig(
        org_slug="japan_corp_test",
        company_name="Japan Corporation Test",
        admin_email="admin@jpcorp.test",
        default_currency="JPY",
        default_timezone="Asia/Tokyo",
        default_country="JP",
        fiscal_year_start_month=4,  # April fiscal year
    ),
}


# ============================================
# Multi-Currency Sample Data
# ============================================

def get_sample_subscriptions_for_currency(currency: str) -> List[Dict[str, Any]]:
    """
    Get sample subscription data for a specific currency.

    Returns realistic subscription data with currency-appropriate pricing.
    """
    # Exchange rates (approximate, for testing)
    exchange_rates = {
        "USD": 1.0,
        "INR": 83.50,
        "EUR": 0.92,
        "AED": 3.67,
        "AUD": 1.55,
        "JPY": 150.0,
        "GBP": 0.79,
    }

    rate = exchange_rates.get(currency, 1.0)

    # Base USD prices
    base_subscriptions = [
        {
            "provider": "chatgpt_plus",
            "plan_name": "TEAM",
            "billing_cycle": "monthly",
            "base_price_usd": 25.00,
            "seats": 10,
            "pricing_model": "PER_SEAT",
        },
        {
            "provider": "slack",
            "plan_name": "BUSINESS",
            "billing_cycle": "quarterly",
            "base_price_usd": 150.00,  # Per quarter
            "seats": 50,
            "pricing_model": "PER_SEAT",
        },
        {
            "provider": "figma",
            "plan_name": "ENTERPRISE",
            "billing_cycle": "annual",
            "base_price_usd": 600.00,  # Per year
            "seats": 25,
            "pricing_model": "PER_SEAT",
        },
        {
            "provider": "notion",
            "plan_name": "TEAM",
            "billing_cycle": "semi-annual",
            "base_price_usd": 48.00,  # Per half-year
            "seats": 30,
            "pricing_model": "PER_SEAT",
        },
    ]

    # Convert to target currency
    result = []
    for sub in base_subscriptions:
        converted_price = round(sub["base_price_usd"] * rate, 2)
        result.append({
            "provider": sub["provider"],
            "plan_name": sub["plan_name"],
            "billing_cycle": sub["billing_cycle"],
            "currency": currency,
            "unit_price": converted_price,
            "seats": sub["seats"],
            "pricing_model": sub["pricing_model"],
            "source_currency": "USD",
            "source_price": sub["base_price_usd"],
            "exchange_rate_used": rate,
        })

    return result


# ============================================
# Fiscal Year Test Data
# ============================================

FISCAL_YEAR_CONFIGS = {
    "calendar": {
        "fiscal_year_start_month": 1,
        "description": "Calendar Year (Jan-Dec)",
        "q1_months": [1, 2, 3],
        "q2_months": [4, 5, 6],
        "q3_months": [7, 8, 9],
        "q4_months": [10, 11, 12],
    },
    "india_uk_japan": {
        "fiscal_year_start_month": 4,
        "description": "India/UK/Japan Fiscal Year (Apr-Mar)",
        "q1_months": [4, 5, 6],
        "q2_months": [7, 8, 9],
        "q3_months": [10, 11, 12],
        "q4_months": [1, 2, 3],
    },
    "australia": {
        "fiscal_year_start_month": 7,
        "description": "Australia Fiscal Year (Jul-Jun)",
        "q1_months": [7, 8, 9],
        "q2_months": [10, 11, 12],
        "q3_months": [1, 2, 3],
        "q4_months": [4, 5, 6],
    },
}


def get_fiscal_quarter(date_obj: date, fiscal_year_start_month: int) -> int:
    """Calculate fiscal quarter for a given date."""
    month = date_obj.month
    # Normalize month to fiscal year (0-11)
    fiscal_month = (month - fiscal_year_start_month + 12) % 12
    return (fiscal_month // 3) + 1


def get_fiscal_year(date_obj: date, fiscal_year_start_month: int) -> int:
    """Calculate fiscal year for a given date."""
    if date_obj.month >= fiscal_year_start_month:
        return date_obj.year
    else:
        return date_obj.year - 1


# ============================================
# FastAPI Test Client
# ============================================

@pytest.fixture
async def async_client():
    """
    Async HTTP client for testing FastAPI endpoints.

    Uses httpx.AsyncClient with ASGITransport for testing FastAPI.
    Mocks authentication to bypass X-API-Key validation in tests.
    """
    # Import app here to ensure env vars are set first
    from src.app.main import app

    # Mock the get_current_org dependency to return a test org
    def mock_get_current_org():
        return {
            "org_slug": "test_org_123",
            "company_name": "Test Organization",
            "admin_email": "admin@test.com",
            "status": "ACTIVE",
            "default_currency": "USD",
            "default_timezone": "UTC",
            "fiscal_year_start_month": 1,
            "subscription": {
                "plan_name": "ENTERPRISE",
                "status": "ACTIVE",
                "max_pipelines_per_day": 999999,
                "max_pipelines_per_month": 999999,
                "max_concurrent_pipelines": 999999
            },
            "org_api_key_id": "test-key-123"
        }

    # Mock BigQuery client
    with patch("src.app.dependencies.auth.get_bigquery_client") as mock_bq_client:
        mock_client = MagicMock()
        mock_bq_client.return_value = mock_client

        # Mock get_current_org to return test org
        with patch("src.app.dependencies.auth.get_current_org", return_value=mock_get_current_org()):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


# ============================================
# Multi-Org Test Fixtures
# ============================================

@pytest.fixture(params=["us_corp", "india_corp", "eu_corp"])
def multi_org_config(request) -> OrgTestConfig:
    """
    Parameterized fixture for testing across multiple org configurations.

    Tests decorated with this fixture will run once for each org config.
    """
    return ORG_CONFIGS[request.param]


@pytest.fixture
def us_org_config() -> OrgTestConfig:
    """US organization configuration (USD, calendar fiscal year)."""
    return ORG_CONFIGS["us_corp"]


@pytest.fixture
def india_org_config() -> OrgTestConfig:
    """India organization configuration (INR, April fiscal year)."""
    return ORG_CONFIGS["india_corp"]


@pytest.fixture
def eu_org_config() -> OrgTestConfig:
    """EU organization configuration (EUR, calendar fiscal year)."""
    return ORG_CONFIGS["eu_corp"]


@pytest.fixture
def australia_org_config() -> OrgTestConfig:
    """Australia organization configuration (AUD, July fiscal year)."""
    return ORG_CONFIGS["australia_corp"]


@pytest.fixture(params=[1, 4, 7])
def fiscal_year_start_month(request) -> int:
    """
    Parameterized fixture for testing different fiscal year configurations.

    - 1: Calendar year (Jan-Dec)
    - 4: India/UK/Japan (Apr-Mar)
    - 7: Australia (Jul-Jun)
    """
    return request.param


@pytest.fixture
def sample_subscriptions_usd() -> List[Dict[str, Any]]:
    """Sample subscription data in USD."""
    return get_sample_subscriptions_for_currency("USD")


@pytest.fixture
def sample_subscriptions_inr() -> List[Dict[str, Any]]:
    """Sample subscription data in INR."""
    return get_sample_subscriptions_for_currency("INR")


@pytest.fixture
def sample_subscriptions_eur() -> List[Dict[str, Any]]:
    """Sample subscription data in EUR."""
    return get_sample_subscriptions_for_currency("EUR")


@pytest.fixture(params=["USD", "INR", "EUR", "AED", "AUD"])
def multi_currency_subscriptions(request) -> List[Dict[str, Any]]:
    """
    Parameterized fixture for testing across multiple currencies.

    Tests decorated with this fixture will run once for each currency.
    """
    return get_sample_subscriptions_for_currency(request.param)


# ============================================
# Environment-Specific Fixtures
# ============================================

@pytest.fixture
def env_config() -> Dict[str, str]:
    """Get current environment configuration."""
    return get_env_config()


@pytest.fixture
def api_base_url(env_config) -> str:
    """API service base URL for current environment."""
    return env_config["api_base_url"]


@pytest.fixture
def pipeline_base_url(env_config) -> str:
    """Pipeline service base URL for current environment."""
    return env_config["pipeline_base_url"]


@pytest.fixture
def gcp_project_id(env_config) -> str:
    """GCP project ID for current environment."""
    return env_config["gcp_project_id"]


@pytest.fixture
def ca_root_api_key(env_config) -> str:
    """CA Root API key for current environment."""
    return env_config["ca_root_api_key"]


# ============================================
# Mock Settings
# ============================================

@pytest.fixture
def mock_settings():
    """Mock application settings for tests."""
    with patch("src.app.config.get_settings") as mock_get_settings:
        settings = MagicMock()
        settings.gcp_project_id = "test-project"
        settings.environment = "development"
        settings.kms_key_name = "projects/test/locations/global/keyRings/test/cryptoKeys/test"
        settings.ca_root_api_key = "test-ca-root-key-secure-32chars"
        settings.disable_auth = True
        settings.default_org_slug = "test_org_123"
        settings.is_development = True

        mock_get_settings.return_value = settings
        yield settings


# ============================================
# Helper Functions for Tests
# ============================================

def calculate_expected_daily_cost(
    cycle_cost: float,
    billing_cycle: str,
    fiscal_year_start_month: int = 1,
    cost_date: date = None
) -> float:
    """
    Calculate expected daily cost based on billing cycle and fiscal year.

    Args:
        cycle_cost: Total cost for the billing period
        billing_cycle: monthly, quarterly, semi-annual, annual
        fiscal_year_start_month: Month when fiscal year starts (1-12)
        cost_date: Date for which to calculate (for month-specific calculations)

    Returns:
        Expected daily cost
    """
    import calendar

    cost_date = cost_date or date.today()

    if billing_cycle in ("monthly", "month"):
        days_in_month = calendar.monthrange(cost_date.year, cost_date.month)[1]
        return cycle_cost / days_in_month

    elif billing_cycle in ("annual", "yearly", "year"):
        # Fiscal year days
        fy = get_fiscal_year(cost_date, fiscal_year_start_month)
        fy_start = date(fy, fiscal_year_start_month, 1)
        fy_end = date(fy + 1, fiscal_year_start_month, 1)
        days_in_fy = (fy_end - fy_start).days
        return cycle_cost / days_in_fy

    elif billing_cycle in ("quarterly", "quarter"):
        # Fiscal quarter days
        fq = get_fiscal_quarter(cost_date, fiscal_year_start_month)
        fy = get_fiscal_year(cost_date, fiscal_year_start_month)

        # Calculate quarter start month
        quarter_start_month = ((fq - 1) * 3 + fiscal_year_start_month - 1) % 12 + 1
        quarter_start_year = fy if quarter_start_month >= fiscal_year_start_month else fy + 1

        fq_start = date(quarter_start_year, quarter_start_month, 1)
        next_quarter_month = (quarter_start_month + 2) % 12 + 1
        next_quarter_year = quarter_start_year if next_quarter_month > quarter_start_month else quarter_start_year + 1
        fq_end = date(next_quarter_year, next_quarter_month, 1)

        days_in_fq = (fq_end - fq_start).days
        return cycle_cost / days_in_fq if days_in_fq > 0 else cycle_cost / 91

    elif billing_cycle in ("semi-annual", "semi_annual", "biannual", "half-yearly"):
        # Fiscal half days (approximately 183 days)
        return cycle_cost / 183

    elif billing_cycle in ("weekly", "week"):
        return cycle_cost / 7

    else:
        # Default fallback
        return cycle_cost / 30


# ============================================
# Dynamic Org & Subscription Creation
# ============================================

import uuid
import httpx


def create_test_org(
    env: str = None,
    org_config: OrgTestConfig = None,
    org_slug_suffix: str = None
) -> Dict[str, Any]:
    """
    Dynamically create a test organization via API.

    Args:
        env: Environment to create org in (local, development, stage, prod)
        org_config: OrgTestConfig with org details, or use defaults
        org_slug_suffix: Optional suffix to make org_slug unique

    Returns:
        Dict with org_slug, api_key, and other org details
    """
    config = get_env_config(env)

    if org_config is None:
        org_config = ORG_CONFIGS["us_corp"]

    # Generate unique org_slug
    suffix = org_slug_suffix or uuid.uuid4().hex[:8]
    org_slug = f"{org_config.org_slug}_{suffix}"

    # Create org via API
    api_url = config["api_base_url"]
    ca_root_key = config["ca_root_api_key"]

    if not ca_root_key:
        raise ValueError(f"CA_ROOT_API_KEY not set for environment: {env}")

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{api_url}/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": ca_root_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": org_slug,
                "company_name": org_config.company_name,
                "admin_email": org_config.admin_email.replace("@", f"_{suffix}@"),
                "subscription_plan": org_config.subscription_plan,
                "default_currency": org_config.default_currency,
                "default_timezone": org_config.default_timezone,
            }
        )

        if response.status_code != 200:
            raise Exception(f"Failed to create org: {response.status_code} {response.text}")

        data = response.json()

        # Set fiscal year if needed
        if org_config.fiscal_year_start_month != 1:
            # Update fiscal year via BigQuery (API doesn't support this yet)
            pass

        return {
            "org_slug": org_slug,
            "api_key": data.get("api_key", ""),
            "default_currency": data.get("default_currency"),
            "default_timezone": data.get("default_timezone"),
            "dataset_name": f"{org_slug}{config['dataset_suffix']}",
            "env": env or TEST_ENV,
        }


def create_test_subscriptions(
    org_slug: str,
    api_key: str,
    currency: str = "USD",
    env: str = None,
    subscriptions: List[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Dynamically create test subscription plans for an org.

    Args:
        org_slug: Organization slug
        api_key: Org API key
        currency: Currency for subscriptions
        env: Environment
        subscriptions: List of subscription dicts, or use defaults

    Returns:
        List of created subscription records
    """
    config = get_env_config(env)
    api_url = config["api_base_url"]

    if subscriptions is None:
        subscriptions = get_sample_subscriptions_for_currency(currency)

    created = []
    with httpx.Client(timeout=60.0) as client:
        for sub in subscriptions:
            # Enable provider first
            provider = sub["provider"]
            client.post(
                f"{api_url}/api/v1/subscriptions/{org_slug}/providers/{provider}/enable",
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={}
            )

            # Create plan
            response = client.post(
                f"{api_url}/api/v1/subscriptions/{org_slug}/providers/{provider}/plans",
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "plan_name": sub["plan_name"],
                    "currency": sub["currency"],
                    "unit_price": sub["unit_price"],
                    "seats": sub["seats"],
                    "pricing_model": sub["pricing_model"],
                    "billing_cycle": sub["billing_cycle"],
                    "effective_date": date.today().isoformat(),
                }
            )

            if response.status_code == 200:
                created.append(response.json())
            else:
                # Log but continue
                print(f"Warning: Failed to create {provider}/{sub['plan_name']}: {response.status_code}")

    return created


def run_cost_pipeline(
    org_slug: str,
    api_key: str,
    start_date: str = None,
    end_date: str = None,
    env: str = None
) -> Dict[str, Any]:
    """
    Run the SaaS cost calculation pipeline for an org.

    Args:
        org_slug: Organization slug
        api_key: Org API key
        start_date: Start date (YYYY-MM-DD), defaults to start of month
        end_date: End date (YYYY-MM-DD), defaults to today
        env: Environment

    Returns:
        Pipeline execution result
    """
    config = get_env_config(env)
    pipeline_url = config["pipeline_base_url"]

    body = {}
    if start_date:
        body["start_date"] = start_date
    if end_date:
        body["end_date"] = end_date

    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            f"{pipeline_url}/api/v1/pipelines/run/{org_slug}/subscription/costs/subscription_cost",
            headers={
                "X-API-Key": api_key,
                "Content-Type": "application/json"
            },
            json=body
        )

        return {
            "status_code": response.status_code,
            "data": response.json() if response.status_code == 200 else None,
            "error": response.text if response.status_code != 200 else None,
        }


@pytest.fixture
def dynamic_test_org(request):
    """
    Fixture to dynamically create a test org for the current test.

    Usage:
        def test_something(dynamic_test_org):
            org = dynamic_test_org(org_config=india_org_config)
            # org["org_slug"], org["api_key"], etc.

    The org is created fresh for each test that uses this fixture.
    """
    created_orgs = []

    def _create_org(org_config: OrgTestConfig = None, env: str = None):
        org = create_test_org(env=env, org_config=org_config)
        created_orgs.append(org)
        return org

    yield _create_org

    # Cleanup: Could delete orgs here if needed
    # For now, we leave them for debugging


@pytest.fixture
def dynamic_subscriptions():
    """
    Fixture to dynamically create subscriptions for a test org.

    Usage:
        def test_something(dynamic_test_org, dynamic_subscriptions):
            org = dynamic_test_org()
            subs = dynamic_subscriptions(org["org_slug"], org["api_key"])
    """
    def _create_subs(
        org_slug: str,
        api_key: str,
        currency: str = "USD",
        env: str = None,
        subscriptions: List[Dict[str, Any]] = None
    ):
        return create_test_subscriptions(
            org_slug=org_slug,
            api_key=api_key,
            currency=currency,
            env=env,
            subscriptions=subscriptions
        )

    return _create_subs


@pytest.fixture
def run_pipeline():
    """
    Fixture to run the cost pipeline for a test org.

    Usage:
        def test_something(dynamic_test_org, run_pipeline):
            org = dynamic_test_org()
            result = run_pipeline(org["org_slug"], org["api_key"])
    """
    def _run_pipeline(
        org_slug: str,
        api_key: str,
        start_date: str = None,
        end_date: str = None,
        env: str = None
    ):
        return run_cost_pipeline(
            org_slug=org_slug,
            api_key=api_key,
            start_date=start_date,
            end_date=end_date,
            env=env
        )

    return _run_pipeline


# ============================================
# Pre-configured Test Orgs (for quick testing)
# ============================================

# These can be set via environment variables for quick local testing
# without needing to create new orgs each time
TEST_ORGS = {
    "us": {
        "org_slug": os.environ.get("TEST_US_ORG_SLUG", "guru_inc_12012025"),
        "api_key": os.environ.get("TEST_US_ORG_API_KEY", ""),
        "currency": "USD",
        "fiscal_year_start_month": 1,
    },
    "india": {
        "org_slug": os.environ.get("TEST_INDIA_ORG_SLUG", "india_tech_corp"),
        "api_key": os.environ.get("TEST_INDIA_ORG_API_KEY", "india_tech_corp_api_ziLQ7A2sxesb9Brx"),
        "currency": "INR",
        "fiscal_year_start_month": 4,
    },
}


@pytest.fixture
def us_test_org() -> Dict[str, Any]:
    """Pre-configured US test org."""
    return TEST_ORGS["us"]


@pytest.fixture
def india_test_org() -> Dict[str, Any]:
    """Pre-configured India test org."""
    return TEST_ORGS["india"]


# Make helper functions available to all tests
pytest.calculate_expected_daily_cost = calculate_expected_daily_cost
pytest.get_fiscal_quarter = get_fiscal_quarter
pytest.get_fiscal_year = get_fiscal_year
pytest.get_sample_subscriptions_for_currency = get_sample_subscriptions_for_currency
pytest.ORG_CONFIGS = ORG_CONFIGS
pytest.FISCAL_YEAR_CONFIGS = FISCAL_YEAR_CONFIGS
pytest.ENV_CONFIGS = ENV_CONFIGS
pytest.TEST_ORGS = TEST_ORGS
pytest.create_test_org = create_test_org
pytest.create_test_subscriptions = create_test_subscriptions
pytest.run_cost_pipeline = run_cost_pipeline
