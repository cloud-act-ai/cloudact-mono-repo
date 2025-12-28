"""
Test Suite for i18n Models in Pipeline Service

Tests i18n models and validators:
- Currency enums and metadata
- Language enums and metadata
- Timezone validation
- Country validation
- Pydantic validators
- OrgProfileResponse with i18n fields

These are unit tests that don't require BigQuery.
Run with: pytest tests/test_i18n_models.py -v
"""

import pytest
from pydantic import ValidationError

from src.app.models import (
    # Currency
    SupportedCurrency,
    CURRENCY_METADATA,
    get_country_from_currency,
    get_currency_decimals,
    get_currency_symbol,

    # Language
    SupportedLanguage,
    LANGUAGE_METADATA,

    # Timezone & Country
    SUPPORTED_TIMEZONES,
    SUPPORTED_COUNTRIES,

    # Defaults
    DEFAULT_CURRENCY,
    DEFAULT_LANGUAGE,
    DEFAULT_TIMEZONE,
    DEFAULT_COUNTRY,

    # Validators
    validate_currency,
    validate_timezone,
    validate_country,
    validate_language,
    currency_validator,
    timezone_validator,
    country_validator,
    language_validator,

    # Org models
    OrgProfileResponse,
)


# ============================================
# Test: Currency Enums and Metadata
# ============================================

def test_currency_enum_values():
    """Test currency enum contains expected values."""
    expected_currencies = [
        "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "SGD",
        "AED", "SAR", "QAR", "KWD", "BHD", "OMR"
    ]
    actual_currencies = [c.value for c in SupportedCurrency]
    assert set(actual_currencies) == set(expected_currencies)


def test_currency_metadata_completeness():
    """Test all currency enums have metadata."""
    for currency in SupportedCurrency:
        assert currency.value in CURRENCY_METADATA
        meta = CURRENCY_METADATA[currency.value]
        assert "symbol" in meta
        assert "name" in meta
        assert "decimals" in meta
        assert "country" in meta


def test_get_currency_symbol():
    """Test currency symbol retrieval.

    Note: JPY and CNY use prefixed symbols (JP¥, CN¥) to avoid ambiguity.
    """
    assert get_currency_symbol("USD") == "$"
    assert get_currency_symbol("EUR") == "€"
    assert get_currency_symbol("GBP") == "£"
    assert get_currency_symbol("JPY") == "JP¥"  # Prefixed to distinguish from CNY
    assert get_currency_symbol("CNY") == "CN¥"  # Prefixed to distinguish from JPY
    assert get_currency_symbol("AED") == "د.إ"
    assert get_currency_symbol("UNKNOWN") == "$"  # Default


def test_get_currency_decimals():
    """Test currency decimal places."""
    assert get_currency_decimals("USD") == 2
    assert get_currency_decimals("EUR") == 2
    assert get_currency_decimals("JPY") == 0  # Special case
    assert get_currency_decimals("KWD") == 3  # Special case
    assert get_currency_decimals("BHD") == 3  # Special case
    assert get_currency_decimals("UNKNOWN") == 2  # Default


def test_get_country_from_currency():
    """Test country inference from currency."""
    assert get_country_from_currency("USD") == "US"
    assert get_country_from_currency("EUR") == "DE"  # Default to Germany
    assert get_country_from_currency("AED") == "AE"
    assert get_country_from_currency("SAR") == "SA"
    assert get_country_from_currency("UNKNOWN") == "US"  # Default


# ============================================
# Test: Language Enums and Metadata
# ============================================

def test_language_enum_values():
    """Test language enum contains expected values."""
    expected_languages = ["en", "ar", "de", "fr", "ja", "zh", "hi", "es", "pt", "ko"]
    actual_languages = [lang.value for lang in SupportedLanguage]
    assert set(actual_languages) == set(expected_languages)


def test_language_metadata_completeness():
    """Test all language enums have metadata."""
    for language in SupportedLanguage:
        assert language.value in LANGUAGE_METADATA
        meta = LANGUAGE_METADATA[language.value]
        assert "name" in meta
        assert "native_name" in meta
        assert "rtl" in meta


def test_rtl_languages():
    """Test RTL (right-to-left) language detection."""
    assert LANGUAGE_METADATA["ar"]["rtl"] is True  # Arabic is RTL
    assert LANGUAGE_METADATA["en"]["rtl"] is False
    assert LANGUAGE_METADATA["fr"]["rtl"] is False


# ============================================
# Test: Timezone and Country Lists
# ============================================

def test_supported_timezones_contains_utc():
    """Test timezone list includes UTC and major zones."""
    assert "UTC" in SUPPORTED_TIMEZONES
    assert "America/New_York" in SUPPORTED_TIMEZONES
    assert "Asia/Dubai" in SUPPORTED_TIMEZONES
    assert "Asia/Tokyo" in SUPPORTED_TIMEZONES


def test_supported_countries_contains_major_regions():
    """Test country list includes major regions."""
    assert "US" in SUPPORTED_COUNTRIES
    assert "AE" in SUPPORTED_COUNTRIES  # UAE
    assert "SA" in SUPPORTED_COUNTRIES  # Saudi Arabia
    assert "JP" in SUPPORTED_COUNTRIES
    assert "GB" in SUPPORTED_COUNTRIES


# ============================================
# Test: Default Values
# ============================================

def test_default_values():
    """Test default i18n values."""
    assert DEFAULT_CURRENCY == SupportedCurrency.USD
    assert DEFAULT_LANGUAGE == SupportedLanguage.EN
    assert DEFAULT_TIMEZONE == "UTC"
    assert DEFAULT_COUNTRY == "US"


# ============================================
# Test: Validators
# ============================================

def test_validate_currency():
    """Test currency validation."""
    assert validate_currency("USD") is True
    assert validate_currency("AED") is True
    assert validate_currency("XXX") is False  # Invalid currency
    assert validate_currency("") is False
    assert validate_currency("usd") is False  # Case-sensitive


def test_validate_timezone():
    """Test timezone validation."""
    assert validate_timezone("UTC") is True
    assert validate_timezone("Asia/Dubai") is True
    assert validate_timezone("Invalid/Timezone") is False
    assert validate_timezone("") is False


def test_validate_country():
    """Test country code validation against supported list."""
    assert validate_country("US") is True
    assert validate_country("AE") is True
    assert validate_country("us") is True  # Case-insensitive
    assert validate_country("XX") is False  # Must be in SUPPORTED_COUNTRIES
    assert validate_country("USA") is False  # Must be 2 letters
    assert validate_country("1") is False
    assert validate_country("") is False


def test_validate_language():
    """Test language validation."""
    assert validate_language("en") is True
    assert validate_language("ar") is True
    assert validate_language("zz") is False  # Invalid language
    assert validate_language("EN") is False  # Case-sensitive
    assert validate_language("") is False


# ============================================
# Test: Pydantic Validators
# ============================================

def test_currency_validator_valid():
    """Test pydantic currency validator with valid input."""
    assert currency_validator("USD") == "USD"
    assert currency_validator("AED") == "AED"


def test_currency_validator_invalid():
    """Test pydantic currency validator with invalid input."""
    with pytest.raises(ValueError, match="Invalid currency"):
        currency_validator("XXX")


def test_timezone_validator_valid():
    """Test pydantic timezone validator with valid input."""
    assert timezone_validator("UTC") == "UTC"
    assert timezone_validator("Asia/Dubai") == "Asia/Dubai"


def test_timezone_validator_invalid():
    """Test pydantic timezone validator with invalid input."""
    with pytest.raises(ValueError, match="Invalid timezone"):
        timezone_validator("Invalid/Zone")


def test_country_validator_valid():
    """Test pydantic country validator with valid input."""
    assert country_validator("US") == "US"
    assert country_validator("us") == "US"  # Auto-uppercase
    assert country_validator("ae") == "AE"


def test_country_validator_invalid():
    """Test pydantic country validator with invalid input."""
    with pytest.raises(ValueError, match="Invalid country code"):
        country_validator("USA")  # Must be 2 letters

    # Empty string should return default
    assert country_validator("") == DEFAULT_COUNTRY


def test_language_validator_valid():
    """Test pydantic language validator with valid input."""
    assert language_validator("en") == "en"
    assert language_validator("ar") == "ar"


def test_language_validator_invalid():
    """Test pydantic language validator with invalid input."""
    with pytest.raises(ValueError, match="Invalid language"):
        language_validator("zz")

    # Empty string should return default
    assert language_validator("") == DEFAULT_LANGUAGE.value


# ============================================
# Test: OrgProfileResponse with i18n Fields
# ============================================

def test_org_profile_response_with_defaults():
    """Test OrgProfileResponse uses default i18n values."""
    from datetime import datetime

    profile = OrgProfileResponse(
        org_slug="test_org",
        company_name="Test Company",
        admin_email="admin@test.com",
        status="ACTIVE",
        subscription_plan="STARTER",
        org_dataset_id="test_org_prod",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    # Should use defaults
    assert profile.default_currency == DEFAULT_CURRENCY.value
    assert profile.default_country == DEFAULT_COUNTRY
    assert profile.default_language == DEFAULT_LANGUAGE.value
    assert profile.default_timezone == DEFAULT_TIMEZONE


def test_org_profile_response_with_custom_i18n():
    """Test OrgProfileResponse with custom i18n values."""
    from datetime import datetime

    profile = OrgProfileResponse(
        org_slug="test_org_uae",
        company_name="UAE Test Company",
        admin_email="admin@uae.com",
        status="ACTIVE",
        subscription_plan="PROFESSIONAL",
        org_dataset_id="test_org_uae_prod",
        default_currency="AED",
        default_country="AE",
        default_language="ar",
        default_timezone="Asia/Dubai",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    assert profile.default_currency == "AED"
    assert profile.default_country == "AE"
    assert profile.default_language == "ar"
    assert profile.default_timezone == "Asia/Dubai"


def test_org_profile_response_example():
    """Test OrgProfileResponse example matches expected structure."""
    example = OrgProfileResponse.model_config["json_schema_extra"]["example"]

    # Verify i18n fields are in example
    assert "default_currency" in example
    assert "default_country" in example
    assert "default_language" in example
    assert "default_timezone" in example

    # Verify example values
    assert example["default_currency"] == "USD"
    assert example["default_country"] == "US"
    assert example["default_language"] == "en"
    assert example["default_timezone"] == "UTC"


# ============================================
# Test: Integration of i18n Models
# ============================================

def test_all_currencies_have_country_mapping():
    """Test all currencies can be mapped to a country."""
    for currency in SupportedCurrency:
        country = get_country_from_currency(currency.value)
        assert country is not None
        assert len(country) == 2  # ISO 3166-1 alpha-2


def test_currency_metadata_consistency():
    """Test currency metadata is consistent across all currencies."""
    for currency_code, metadata in CURRENCY_METADATA.items():
        # Check required fields
        assert "symbol" in metadata
        assert "name" in metadata
        assert "decimals" in metadata
        assert "country" in metadata

        # Check decimals are valid
        assert metadata["decimals"] in [0, 2, 3]  # JPY=0, KWD/BHD/OMR=3, others=2

        # Check country code format
        assert len(metadata["country"]) == 2
        assert metadata["country"].isupper()
