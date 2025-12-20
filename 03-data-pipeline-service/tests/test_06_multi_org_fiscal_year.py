"""
Multi-Organization, Multi-Currency, and Fiscal Year Integration Tests

Tests for:
1. Multi-currency cost calculations (USD, INR, EUR, AED, AUD, JPY)
2. Fiscal year configurations (Calendar, India/UK/Japan Apr-Mar, Australia Jul-Jun)
3. Cross-org isolation and data integrity
4. Currency conversion audit trail

Test Categories:
- MULTI-ORG-01: Organization isolation
- MULTI-CURRENCY-01: Currency-specific calculations
- FISCAL-01: Fiscal year calculations
- FISCAL-02: Fiscal quarter calculations
- FISCAL-03: Fiscal half-year calculations

Prerequisites:
- Running services on localhost:8000 (API) and localhost:8001 (Pipeline)
- BigQuery access with appropriate permissions
- Test organizations created via onboarding

To run:
    # All multi-org tests
    RUN_E2E_TESTS=true pytest tests/test_06_multi_org_fiscal_year.py -v

    # Specific test class
    RUN_E2E_TESTS=true pytest tests/test_06_multi_org_fiscal_year.py::TestFiscalYearCalculations -v

    # Run for specific environment
    TEST_ENV=stage RUN_E2E_TESTS=true pytest tests/test_06_multi_org_fiscal_year.py -v
"""

import pytest
import os
import httpx
from datetime import date, timedelta
from typing import Dict, Any, List
import calendar

# Mark as E2E/Integration tests
pytestmark = [
    pytest.mark.e2e,
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("RUN_E2E_TESTS", "").lower() != "true",
        reason="E2E tests require running server. Set RUN_E2E_TESTS=true to run."
    )
]


# ============================================
# Fiscal Year Unit Tests (No External Dependencies)
# ============================================

class TestFiscalYearCalculations:
    """
    Unit tests for fiscal year calculation logic.

    Tests different fiscal year configurations:
    - Calendar year (fiscal_year_start_month = 1): Jan 1 - Dec 31
    - India/UK/Japan (fiscal_year_start_month = 4): Apr 1 - Mar 31
    - Australia (fiscal_year_start_month = 7): Jul 1 - Jun 30
    """

    def test_fiscal_quarter_calendar_year(self):
        """
        FISCAL-01: Test fiscal quarter calculation for calendar year.

        Calendar year quarters:
        - Q1: Jan, Feb, Mar
        - Q2: Apr, May, Jun
        - Q3: Jul, Aug, Sep
        - Q4: Oct, Nov, Dec
        """
        from tests.conftest import get_fiscal_quarter

        fiscal_start = 1  # Calendar year

        # Q1 tests
        assert get_fiscal_quarter(date(2025, 1, 15), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 2, 28), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 3, 31), fiscal_start) == 1

        # Q2 tests
        assert get_fiscal_quarter(date(2025, 4, 1), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 5, 15), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 6, 30), fiscal_start) == 2

        # Q3 tests
        assert get_fiscal_quarter(date(2025, 7, 1), fiscal_start) == 3
        assert get_fiscal_quarter(date(2025, 8, 15), fiscal_start) == 3
        assert get_fiscal_quarter(date(2025, 9, 30), fiscal_start) == 3

        # Q4 tests
        assert get_fiscal_quarter(date(2025, 10, 1), fiscal_start) == 4
        assert get_fiscal_quarter(date(2025, 11, 15), fiscal_start) == 4
        assert get_fiscal_quarter(date(2025, 12, 31), fiscal_start) == 4

        print("Calendar year fiscal quarters verified")

    def test_fiscal_quarter_india_fiscal_year(self):
        """
        FISCAL-02: Test fiscal quarter calculation for India fiscal year (Apr-Mar).

        India fiscal year quarters:
        - FQ1: Apr, May, Jun
        - FQ2: Jul, Aug, Sep
        - FQ3: Oct, Nov, Dec
        - FQ4: Jan, Feb, Mar
        """
        from tests.conftest import get_fiscal_quarter

        fiscal_start = 4  # India/UK/Japan

        # FQ1 tests (Apr-Jun)
        assert get_fiscal_quarter(date(2025, 4, 1), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 5, 15), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 6, 30), fiscal_start) == 1

        # FQ2 tests (Jul-Sep)
        assert get_fiscal_quarter(date(2025, 7, 1), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 8, 15), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 9, 30), fiscal_start) == 2

        # FQ3 tests (Oct-Dec)
        assert get_fiscal_quarter(date(2025, 10, 1), fiscal_start) == 3
        assert get_fiscal_quarter(date(2025, 11, 15), fiscal_start) == 3
        assert get_fiscal_quarter(date(2025, 12, 31), fiscal_start) == 3

        # FQ4 tests (Jan-Mar) - This is in the NEXT calendar year
        assert get_fiscal_quarter(date(2026, 1, 1), fiscal_start) == 4
        assert get_fiscal_quarter(date(2026, 2, 15), fiscal_start) == 4
        assert get_fiscal_quarter(date(2026, 3, 31), fiscal_start) == 4

        print("India fiscal year quarters verified (Apr-Mar)")

    def test_fiscal_quarter_australia_fiscal_year(self):
        """
        FISCAL-03: Test fiscal quarter calculation for Australia fiscal year (Jul-Jun).

        Australia fiscal year quarters:
        - FQ1: Jul, Aug, Sep
        - FQ2: Oct, Nov, Dec
        - FQ3: Jan, Feb, Mar
        - FQ4: Apr, May, Jun
        """
        from tests.conftest import get_fiscal_quarter

        fiscal_start = 7  # Australia

        # FQ1 tests (Jul-Sep)
        assert get_fiscal_quarter(date(2025, 7, 1), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 8, 15), fiscal_start) == 1
        assert get_fiscal_quarter(date(2025, 9, 30), fiscal_start) == 1

        # FQ2 tests (Oct-Dec)
        assert get_fiscal_quarter(date(2025, 10, 1), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 11, 15), fiscal_start) == 2
        assert get_fiscal_quarter(date(2025, 12, 31), fiscal_start) == 2

        # FQ3 tests (Jan-Mar) - Next calendar year
        assert get_fiscal_quarter(date(2026, 1, 1), fiscal_start) == 3
        assert get_fiscal_quarter(date(2026, 2, 15), fiscal_start) == 3
        assert get_fiscal_quarter(date(2026, 3, 31), fiscal_start) == 3

        # FQ4 tests (Apr-Jun) - Next calendar year
        assert get_fiscal_quarter(date(2026, 4, 1), fiscal_start) == 4
        assert get_fiscal_quarter(date(2026, 5, 15), fiscal_start) == 4
        assert get_fiscal_quarter(date(2026, 6, 30), fiscal_start) == 4

        print("Australia fiscal year quarters verified (Jul-Jun)")

    def test_fiscal_year_number_india(self):
        """
        FISCAL-04: Test fiscal year number calculation for India.

        For India (Apr-Mar):
        - Apr 2025 - Mar 2026 = FY 2025
        - Jan 2026 is part of FY 2025
        """
        from tests.conftest import get_fiscal_year

        fiscal_start = 4  # India

        # FY 2025 (Apr 2025 - Mar 2026)
        assert get_fiscal_year(date(2025, 4, 1), fiscal_start) == 2025
        assert get_fiscal_year(date(2025, 7, 15), fiscal_start) == 2025
        assert get_fiscal_year(date(2025, 12, 31), fiscal_start) == 2025
        assert get_fiscal_year(date(2026, 1, 1), fiscal_start) == 2025  # Jan 2026 is FY 2025
        assert get_fiscal_year(date(2026, 3, 31), fiscal_start) == 2025  # Mar 2026 is FY 2025

        # FY 2026 starts Apr 2026
        assert get_fiscal_year(date(2026, 4, 1), fiscal_start) == 2026

        print("India fiscal year numbers verified")

    def test_fiscal_year_number_australia(self):
        """
        FISCAL-05: Test fiscal year number calculation for Australia.

        For Australia (Jul-Jun):
        - Jul 2025 - Jun 2026 = FY 2025
        - Jan 2026 is part of FY 2025
        """
        from tests.conftest import get_fiscal_year

        fiscal_start = 7  # Australia

        # FY 2025 (Jul 2025 - Jun 2026)
        assert get_fiscal_year(date(2025, 7, 1), fiscal_start) == 2025
        assert get_fiscal_year(date(2025, 10, 15), fiscal_start) == 2025
        assert get_fiscal_year(date(2026, 1, 1), fiscal_start) == 2025  # Jan 2026 is FY 2025
        assert get_fiscal_year(date(2026, 6, 30), fiscal_start) == 2025  # Jun 2026 is FY 2025

        # FY 2026 starts Jul 2026
        assert get_fiscal_year(date(2026, 7, 1), fiscal_start) == 2026

        print("Australia fiscal year numbers verified")


class TestFiscalDayCalculations:
    """
    Tests for fiscal period day calculations.

    Verifies correct day counts for:
    - Annual (365/366 days)
    - Quarterly (89-92 days depending on quarter)
    - Semi-annual (181-184 days)
    """

    def test_annual_days_calendar_year(self):
        """
        FISCAL-06: Test days in fiscal year for calendar year.

        2025 is not a leap year: 365 days
        2024 was a leap year: 366 days
        """
        # Non-leap year 2025
        fy_2025_start = date(2025, 1, 1)
        fy_2025_end = date(2026, 1, 1)
        days_2025 = (fy_2025_end - fy_2025_start).days
        assert days_2025 == 365, f"Expected 365 days in 2025, got {days_2025}"

        # Leap year 2024
        fy_2024_start = date(2024, 1, 1)
        fy_2024_end = date(2025, 1, 1)
        days_2024 = (fy_2024_end - fy_2024_start).days
        assert days_2024 == 366, f"Expected 366 days in 2024, got {days_2024}"

        print("Calendar year days verified (365/366)")

    def test_annual_days_india_fiscal_year(self):
        """
        FISCAL-07: Test days in fiscal year for India (Apr-Mar).

        FY 2025: Apr 1, 2025 - Mar 31, 2026
        Contains Feb 2026 (28 days) = 365 days total
        """
        fy_start = date(2025, 4, 1)
        fy_end = date(2026, 4, 1)
        days = (fy_end - fy_start).days
        assert days == 365, f"Expected 365 days in India FY 2025, got {days}"

        print("India fiscal year days verified (365)")

    def test_quarterly_days_india_q1(self):
        """
        FISCAL-08: Test days in India Q1 (Apr-Jun).

        Q1: Apr (30) + May (31) + Jun (30) = 91 days
        """
        q1_start = date(2025, 4, 1)
        q1_end = date(2025, 7, 1)
        days = (q1_end - q1_start).days
        assert days == 91, f"Expected 91 days in India Q1, got {days}"

        print("India Q1 days verified (91)")

    def test_quarterly_days_india_q2(self):
        """
        FISCAL-09: Test days in India Q2 (Jul-Sep).

        Q2: Jul (31) + Aug (31) + Sep (30) = 92 days
        """
        q2_start = date(2025, 7, 1)
        q2_end = date(2025, 10, 1)
        days = (q2_end - q2_start).days
        assert days == 92, f"Expected 92 days in India Q2, got {days}"

        print("India Q2 days verified (92)")

    def test_semi_annual_days_india_h1(self):
        """
        FISCAL-10: Test days in India H1 (Apr-Sep).

        H1: Apr (30) + May (31) + Jun (30) + Jul (31) + Aug (31) + Sep (30) = 183 days
        """
        h1_start = date(2025, 4, 1)
        h1_end = date(2025, 10, 1)
        days = (h1_end - h1_start).days
        assert days == 183, f"Expected 183 days in India H1, got {days}"

        print("India H1 days verified (183)")


class TestMultiCurrencyCalculations:
    """
    Tests for multi-currency cost calculations.

    Verifies currency conversion and audit trail fields.
    """

    def test_usd_to_inr_conversion(self, sample_subscriptions_inr):
        """
        MULTI-CURRENCY-01: Test USD to INR conversion.

        Exchange rate: 1 USD = 83.50 INR
        """
        chatgpt_sub = sample_subscriptions_inr[0]

        assert chatgpt_sub["currency"] == "INR"
        assert chatgpt_sub["source_currency"] == "USD"
        assert chatgpt_sub["exchange_rate_used"] == 83.50

        expected_inr_price = 25.00 * 83.50  # $25 * 83.50
        assert chatgpt_sub["unit_price"] == expected_inr_price

        print(f"USD to INR conversion verified: $25 -> ₹{expected_inr_price}")

    def test_usd_to_eur_conversion(self, sample_subscriptions_eur):
        """
        MULTI-CURRENCY-02: Test USD to EUR conversion.

        Exchange rate: 1 USD = 0.92 EUR
        """
        chatgpt_sub = sample_subscriptions_eur[0]

        assert chatgpt_sub["currency"] == "EUR"
        assert chatgpt_sub["source_currency"] == "USD"
        assert chatgpt_sub["exchange_rate_used"] == 0.92

        expected_eur_price = 25.00 * 0.92  # $25 * 0.92
        assert chatgpt_sub["unit_price"] == expected_eur_price

        print(f"USD to EUR conversion verified: $25 -> €{expected_eur_price}")

    def test_currency_audit_fields_present(self, sample_subscriptions_inr):
        """
        MULTI-CURRENCY-03: Test that all currency audit fields are present.

        Required fields:
        - source_currency
        - source_price
        - exchange_rate_used
        """
        for sub in sample_subscriptions_inr:
            assert "source_currency" in sub, "source_currency field missing"
            assert "source_price" in sub, "source_price field missing"
            assert "exchange_rate_used" in sub, "exchange_rate_used field missing"

            # Verify types
            assert isinstance(sub["source_currency"], str)
            assert isinstance(sub["source_price"], (int, float))
            assert isinstance(sub["exchange_rate_used"], (int, float))

        print("Currency audit fields verified")

    @pytest.mark.parametrize("currency,expected_rate", [
        ("USD", 1.0),
        ("INR", 83.50),
        ("EUR", 0.92),
        ("AED", 3.67),
        ("AUD", 1.55),
    ])
    def test_exchange_rates(self, currency, expected_rate):
        """
        MULTI-CURRENCY-04: Test exchange rates for different currencies.
        """
        from tests.conftest import get_sample_subscriptions_for_currency

        subs = get_sample_subscriptions_for_currency(currency)
        assert subs[0]["exchange_rate_used"] == expected_rate

        print(f"Exchange rate for {currency}: {expected_rate}")


class TestMultiOrgConfiguration:
    """
    Tests for multi-organization configuration.

    Verifies org-specific settings are correctly applied.
    """

    def test_org_configs_complete(self):
        """
        MULTI-ORG-01: Test that all org configs have required fields.
        """
        from tests.conftest import ORG_CONFIGS

        required_fields = [
            "org_slug",
            "company_name",
            "admin_email",
            "default_currency",
            "default_timezone",
            "default_country",
            "fiscal_year_start_month",
        ]

        for org_key, config in ORG_CONFIGS.items():
            for field in required_fields:
                assert hasattr(config, field), f"{org_key} missing {field}"

            # Verify fiscal_year_start_month is valid (1-12)
            assert 1 <= config.fiscal_year_start_month <= 12, \
                f"{org_key} has invalid fiscal_year_start_month"

        print(f"Verified {len(ORG_CONFIGS)} org configurations")

    def test_india_org_config(self, india_org_config):
        """
        MULTI-ORG-02: Test India organization configuration.
        """
        assert india_org_config.default_currency == "INR"
        assert india_org_config.default_timezone == "Asia/Kolkata"
        assert india_org_config.default_country == "IN"
        assert india_org_config.fiscal_year_start_month == 4  # April

        print("India org config verified")

    def test_australia_org_config(self, australia_org_config):
        """
        MULTI-ORG-03: Test Australia organization configuration.
        """
        assert australia_org_config.default_currency == "AUD"
        assert australia_org_config.default_timezone == "Australia/Sydney"
        assert australia_org_config.default_country == "AU"
        assert australia_org_config.fiscal_year_start_month == 7  # July

        print("Australia org config verified")


class TestCostCalculationByFiscalYear:
    """
    Tests for cost calculations with different fiscal year configurations.
    """

    def test_annual_daily_rate_calendar_year(self):
        """
        FISCAL-CALC-01: Test annual daily rate for calendar year.

        $365/year / 365 days = $1/day
        """
        from tests.conftest import calculate_expected_daily_cost

        cycle_cost = 365.00
        daily_cost = calculate_expected_daily_cost(
            cycle_cost=cycle_cost,
            billing_cycle="annual",
            fiscal_year_start_month=1,
            cost_date=date(2025, 6, 15)
        )

        assert abs(daily_cost - 1.0) < 0.01, f"Expected $1/day, got ${daily_cost}"
        print(f"Calendar year annual: ${cycle_cost}/year = ${daily_cost:.4f}/day")

    def test_annual_daily_rate_india_fiscal_year(self):
        """
        FISCAL-CALC-02: Test annual daily rate for India fiscal year.

        ₹365/year / 365 days = ₹1/day (FY Apr-Mar)
        """
        from tests.conftest import calculate_expected_daily_cost

        cycle_cost = 365.00
        daily_cost = calculate_expected_daily_cost(
            cycle_cost=cycle_cost,
            billing_cycle="annual",
            fiscal_year_start_month=4,
            cost_date=date(2025, 6, 15)  # Within FY 2025 (Apr 2025 - Mar 2026)
        )

        assert abs(daily_cost - 1.0) < 0.01, f"Expected ₹1/day, got ₹{daily_cost}"
        print(f"India fiscal year annual: ₹{cycle_cost}/year = ₹{daily_cost:.4f}/day")

    def test_quarterly_daily_rate_india_q1(self):
        """
        FISCAL-CALC-03: Test quarterly daily rate for India Q1.

        ₹91/quarter / 91 days = ₹1/day (Q1: Apr-Jun = 91 days)
        """
        from tests.conftest import calculate_expected_daily_cost

        # Q1 has 91 days (Apr 30 + May 31 + Jun 30)
        cycle_cost = 91.00
        daily_cost = calculate_expected_daily_cost(
            cycle_cost=cycle_cost,
            billing_cycle="quarterly",
            fiscal_year_start_month=4,
            cost_date=date(2025, 5, 15)  # Within Q1 (Apr-Jun)
        )

        # Should be close to 1.0 (91/91)
        assert abs(daily_cost - 1.0) < 0.1, f"Expected ~₹1/day, got ₹{daily_cost}"
        print(f"India Q1 quarterly: ₹{cycle_cost}/quarter = ₹{daily_cost:.4f}/day")

    def test_semi_annual_daily_rate_india_h1(self):
        """
        FISCAL-CALC-04: Test semi-annual daily rate for India H1.

        ₹183/half-year / 183 days = ₹1/day (H1: Apr-Sep = 183 days)
        """
        from tests.conftest import calculate_expected_daily_cost

        cycle_cost = 183.00
        daily_cost = calculate_expected_daily_cost(
            cycle_cost=cycle_cost,
            billing_cycle="semi-annual",
            fiscal_year_start_month=4,
            cost_date=date(2025, 6, 15)  # Within H1 (Apr-Sep)
        )

        assert abs(daily_cost - 1.0) < 0.01, f"Expected ₹1/day, got ₹{daily_cost}"
        print(f"India H1 semi-annual: ₹{cycle_cost}/half-year = ₹{daily_cost:.4f}/day")


class TestParameterizedMultiOrg:
    """
    Parameterized tests that run for multiple org configurations.
    """

    def test_subscription_currency_matches_org(self, multi_org_config):
        """
        MULTI-ORG-04: Test that subscriptions use org's default currency.
        """
        from tests.conftest import get_sample_subscriptions_for_currency

        currency = multi_org_config.default_currency
        subs = get_sample_subscriptions_for_currency(currency)

        for sub in subs:
            assert sub["currency"] == currency, \
                f"Subscription currency {sub['currency']} doesn't match org {currency}"

        print(f"Verified {len(subs)} subscriptions for {multi_org_config.org_slug} ({currency})")

    def test_fiscal_year_correctly_applied(self, multi_org_config):
        """
        MULTI-ORG-05: Test that fiscal year is correctly applied per org.
        """
        from tests.conftest import get_fiscal_quarter

        fiscal_start = multi_org_config.fiscal_year_start_month

        # Test that Q1 starts at fiscal_year_start_month
        q1_date = date(2025, fiscal_start, 15)
        assert get_fiscal_quarter(q1_date, fiscal_start) == 1, \
            f"Q1 should start in month {fiscal_start}"

        print(f"Verified fiscal year for {multi_org_config.org_slug} "
              f"(starts month {fiscal_start})")


class TestParameterizedFiscalYear:
    """
    Parameterized tests for different fiscal year configurations.
    """

    def test_q1_starts_at_fiscal_month(self, fiscal_year_start_month):
        """
        FISCAL-PARAM-01: Test Q1 starts at fiscal year start month.
        """
        from tests.conftest import get_fiscal_quarter

        q1_date = date(2025, fiscal_year_start_month, 15)
        quarter = get_fiscal_quarter(q1_date, fiscal_year_start_month)

        assert quarter == 1, f"Q1 should start in month {fiscal_year_start_month}"
        print(f"Verified Q1 for fiscal year starting month {fiscal_year_start_month}")

    def test_annual_calculation_correct(self, fiscal_year_start_month):
        """
        FISCAL-PARAM-02: Test annual calculation for different fiscal years.
        """
        from tests.conftest import calculate_expected_daily_cost

        # Use a date in the middle of the fiscal year
        if fiscal_year_start_month <= 6:
            test_date = date(2025, fiscal_year_start_month + 3, 15)
        else:
            test_date = date(2025, fiscal_year_start_month - 3, 15)

        daily_cost = calculate_expected_daily_cost(
            cycle_cost=365.00,
            billing_cycle="annual",
            fiscal_year_start_month=fiscal_year_start_month,
            cost_date=test_date
        )

        # Should be approximately $1/day
        assert abs(daily_cost - 1.0) < 0.01, \
            f"Expected ~$1/day for fiscal year starting month {fiscal_year_start_month}"

        print(f"Verified annual calculation for fiscal year starting month {fiscal_year_start_month}")


# ============================================
# Test Summary
# ============================================

def test_summary():
    """Print test summary."""
    print("\n" + "=" * 60)
    print("MULTI-ORG & FISCAL YEAR TESTS COMPLETE")
    print("=" * 60)
    print("\nTest Coverage:")
    print("  FISCAL-01: Calendar year quarters")
    print("  FISCAL-02: India fiscal year quarters (Apr-Mar)")
    print("  FISCAL-03: Australia fiscal year quarters (Jul-Jun)")
    print("  FISCAL-04: Fiscal year number (India)")
    print("  FISCAL-05: Fiscal year number (Australia)")
    print("  FISCAL-06: Annual days (calendar year)")
    print("  FISCAL-07: Annual days (India)")
    print("  FISCAL-08: Quarterly days (India Q1)")
    print("  FISCAL-09: Quarterly days (India Q2)")
    print("  FISCAL-10: Semi-annual days (India H1)")
    print("  MULTI-CURRENCY-01: USD to INR conversion")
    print("  MULTI-CURRENCY-02: USD to EUR conversion")
    print("  MULTI-CURRENCY-03: Currency audit fields")
    print("  MULTI-CURRENCY-04: Exchange rates")
    print("  MULTI-ORG-01: Org config completeness")
    print("  MULTI-ORG-02: India org config")
    print("  MULTI-ORG-03: Australia org config")
    print("  MULTI-ORG-04: Subscription currency matching")
    print("  MULTI-ORG-05: Fiscal year application")
    print("  FISCAL-CALC-01: Annual daily rate (calendar)")
    print("  FISCAL-CALC-02: Annual daily rate (India)")
    print("  FISCAL-CALC-03: Quarterly daily rate")
    print("  FISCAL-CALC-04: Semi-annual daily rate")
    print("=" * 60)
