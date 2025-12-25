"""
Internationalization (i18n) Models and Constants

Org-level multi-tenant attributes for currency, timezone, country, language.
These are foundational settings like org_slug - set at signup, propagated everywhere.

Standards:
- Currency: ISO 4217
- Country: ISO 3166-1 alpha-2
- Language: BCP 47
- Timezone: IANA
"""

from enum import Enum
from typing import Dict, Any, Optional, List
import re


# ============================================
# CURRENCY (ISO 4217)
# ============================================

class SupportedCurrency(str, Enum):
    """
    ISO 4217 currency codes.
    Major 10 + Arab Countries (16 total).
    """
    # Major currencies
    USD = "USD"  # US Dollar
    EUR = "EUR"  # Euro
    GBP = "GBP"  # British Pound
    JPY = "JPY"  # Japanese Yen
    CHF = "CHF"  # Swiss Franc
    CAD = "CAD"  # Canadian Dollar
    AUD = "AUD"  # Australian Dollar
    CNY = "CNY"  # Chinese Yuan
    INR = "INR"  # Indian Rupee
    SGD = "SGD"  # Singapore Dollar
    # Arab countries
    AED = "AED"  # UAE Dirham
    SAR = "SAR"  # Saudi Riyal
    QAR = "QAR"  # Qatari Riyal
    KWD = "KWD"  # Kuwaiti Dinar
    BHD = "BHD"  # Bahraini Dinar
    OMR = "OMR"  # Omani Rial


# Currency metadata for display and formatting
# NOTE: JPY and CNY use distinct symbols (JP¥ and CN¥) to avoid ambiguity
CURRENCY_METADATA: Dict[str, Dict[str, Any]] = {
    "USD": {"symbol": "$", "name": "US Dollar", "decimals": 2, "country": "US"},
    "EUR": {"symbol": "€", "name": "Euro", "decimals": 2, "country": "DE"},
    "GBP": {"symbol": "£", "name": "British Pound", "decimals": 2, "country": "GB"},
    "JPY": {"symbol": "JP¥", "name": "Japanese Yen", "decimals": 0, "country": "JP"},
    "CHF": {"symbol": "Fr", "name": "Swiss Franc", "decimals": 2, "country": "CH"},
    "CAD": {"symbol": "C$", "name": "Canadian Dollar", "decimals": 2, "country": "CA"},
    "AUD": {"symbol": "A$", "name": "Australian Dollar", "decimals": 2, "country": "AU"},
    "CNY": {"symbol": "CN¥", "name": "Chinese Yuan", "decimals": 2, "country": "CN"},
    "INR": {"symbol": "₹", "name": "Indian Rupee", "decimals": 2, "country": "IN"},
    "SGD": {"symbol": "S$", "name": "Singapore Dollar", "decimals": 2, "country": "SG"},
    "AED": {"symbol": "د.إ", "name": "UAE Dirham", "decimals": 2, "country": "AE"},
    "SAR": {"symbol": "﷼", "name": "Saudi Riyal", "decimals": 2, "country": "SA"},
    "QAR": {"symbol": "ر.ق", "name": "Qatari Riyal", "decimals": 2, "country": "QA"},
    "KWD": {"symbol": "د.ك", "name": "Kuwaiti Dinar", "decimals": 3, "country": "KW"},
    "BHD": {"symbol": "د.ب", "name": "Bahraini Dinar", "decimals": 3, "country": "BH"},
    "OMR": {"symbol": "ر.ع", "name": "Omani Rial", "decimals": 3, "country": "OM"},
}


def get_country_from_currency(currency_code: str) -> str:
    """
    Get default country code from currency code.
    e.g., "AED" → "AE", "USD" → "US"
    """
    meta = CURRENCY_METADATA.get(currency_code)
    return meta["country"] if meta else "US"


def get_currency_decimals(currency_code: str) -> int:
    """Get decimal places for currency (JPY=0, KWD=3, most=2)."""
    meta = CURRENCY_METADATA.get(currency_code)
    return meta["decimals"] if meta else 2


def get_currency_symbol(currency_code: str) -> str:
    """Get currency symbol for display."""
    meta = CURRENCY_METADATA.get(currency_code)
    return meta["symbol"] if meta else "$"


# ============================================
# LANGUAGE (BCP 47)
# ============================================

class SupportedLanguage(str, Enum):
    """
    BCP 47 language tags.
    10 supported languages (only English active for now).
    """
    EN = "en"   # English
    AR = "ar"   # Arabic (RTL)
    DE = "de"   # German
    FR = "fr"   # French
    JA = "ja"   # Japanese
    ZH = "zh"   # Chinese
    HI = "hi"   # Hindi
    ES = "es"   # Spanish
    PT = "pt"   # Portuguese
    KO = "ko"   # Korean


# Language metadata
LANGUAGE_METADATA: Dict[str, Dict[str, Any]] = {
    "en": {"name": "English", "native_name": "English", "rtl": False},
    "ar": {"name": "Arabic", "native_name": "العربية", "rtl": True},
    "de": {"name": "German", "native_name": "Deutsch", "rtl": False},
    "fr": {"name": "French", "native_name": "Français", "rtl": False},
    "ja": {"name": "Japanese", "native_name": "日本語", "rtl": False},
    "zh": {"name": "Chinese", "native_name": "中文", "rtl": False},
    "hi": {"name": "Hindi", "native_name": "हिन्दी", "rtl": False},
    "es": {"name": "Spanish", "native_name": "Español", "rtl": False},
    "pt": {"name": "Portuguese", "native_name": "Português", "rtl": False},
    "ko": {"name": "Korean", "native_name": "한국어", "rtl": False},
}


# ============================================
# TIMEZONE (IANA)
# ============================================

SUPPORTED_TIMEZONES: List[str] = [
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
]


# Timezone metadata for display
TIMEZONE_METADATA: Dict[str, Dict[str, str]] = {
    "UTC": {"label": "UTC (Coordinated Universal Time)", "offset": "+00:00"},
    "America/New_York": {"label": "Eastern Time (ET)", "offset": "-05:00"},
    "America/Chicago": {"label": "Central Time (CT)", "offset": "-06:00"},
    "America/Denver": {"label": "Mountain Time (MT)", "offset": "-07:00"},
    "America/Los_Angeles": {"label": "Pacific Time (PT)", "offset": "-08:00"},
    "Europe/London": {"label": "London (GMT/BST)", "offset": "+00:00"},
    "Europe/Paris": {"label": "Paris (CET)", "offset": "+01:00"},
    "Europe/Berlin": {"label": "Berlin (CET)", "offset": "+01:00"},
    "Asia/Dubai": {"label": "Dubai (GST)", "offset": "+04:00"},
    "Asia/Riyadh": {"label": "Riyadh (AST)", "offset": "+03:00"},
    "Asia/Kolkata": {"label": "India (IST)", "offset": "+05:30"},
    "Asia/Singapore": {"label": "Singapore (SGT)", "offset": "+08:00"},
    "Asia/Tokyo": {"label": "Tokyo (JST)", "offset": "+09:00"},
    "Asia/Shanghai": {"label": "Shanghai (CST)", "offset": "+08:00"},
    "Australia/Sydney": {"label": "Sydney (AEST)", "offset": "+10:00"},
}


# ============================================
# COUNTRY (ISO 3166-1 alpha-2)
# ============================================

SUPPORTED_COUNTRIES: List[str] = [
    "US", "GB", "DE", "FR", "JP", "CA", "AU", "CN", "IN", "SG", "CH",
    "AE", "SA", "QA", "KW", "BH", "OM", "EG", "JO", "LB",
]


COUNTRY_METADATA: Dict[str, str] = {
    "US": "United States",
    "GB": "United Kingdom",
    "DE": "Germany",
    "FR": "France",
    "JP": "Japan",
    "CA": "Canada",
    "AU": "Australia",
    "CN": "China",
    "IN": "India",
    "SG": "Singapore",
    "CH": "Switzerland",
    "AE": "United Arab Emirates",
    "SA": "Saudi Arabia",
    "QA": "Qatar",
    "KW": "Kuwait",
    "BH": "Bahrain",
    "OM": "Oman",
    "EG": "Egypt",
    "JO": "Jordan",
    "LB": "Lebanon",
}


# ============================================
# DEFAULTS
# ============================================

DEFAULT_CURRENCY = SupportedCurrency.USD
DEFAULT_LANGUAGE = SupportedLanguage.EN
DEFAULT_TIMEZONE = "UTC"
DEFAULT_COUNTRY = "US"


# ============================================
# VALIDATORS
# ============================================

def validate_currency(currency: str) -> bool:
    """Validate currency is in supported list."""
    try:
        SupportedCurrency(currency)
        return True
    except ValueError:
        return False


def validate_timezone(timezone: str) -> bool:
    """Validate timezone is in supported list."""
    return timezone in SUPPORTED_TIMEZONES


def validate_country(country: str) -> bool:
    """Validate country code format (2 uppercase letters)."""
    if not country:
        return False
    return bool(re.match(r'^[A-Z]{2}$', country.upper()))


def validate_language(language: str) -> bool:
    """Validate language is in supported list."""
    try:
        SupportedLanguage(language)
        return True
    except ValueError:
        return False


# ============================================
# PYDANTIC VALIDATORS (for use in models)
# ============================================

def currency_validator(v: str) -> str:
    """Pydantic validator for currency field."""
    if not validate_currency(v):
        supported = [c.value for c in SupportedCurrency]
        raise ValueError(f'Invalid currency: {v}. Supported: {", ".join(supported)}')
    return v


def timezone_validator(v: str) -> str:
    """Pydantic validator for timezone field."""
    if not validate_timezone(v):
        raise ValueError(f'Invalid timezone: {v}. Supported: {", ".join(SUPPORTED_TIMEZONES)}')
    return v


def country_validator(v: str) -> str:
    """Pydantic validator for country field."""
    if not v:
        return DEFAULT_COUNTRY
    v_upper = v.upper()
    if not validate_country(v_upper):
        raise ValueError(f'Invalid country code: {v}. Must be 2-letter ISO 3166-1 alpha-2 code')
    return v_upper


def language_validator(v: str) -> str:
    """Pydantic validator for language field."""
    if not v:
        return DEFAULT_LANGUAGE.value
    v_lower = v.lower()
    if not validate_language(v_lower):
        supported = [lang.value for lang in SupportedLanguage]
        raise ValueError(f'Invalid language: {v}. Supported: {", ".join(supported)}')
    return v_lower
