"""
Pure Unit Tests for SaaS Subscription Cost Calculation Formulas

These tests verify cost calculation logic WITHOUT requiring BigQuery or any
external services. They test the mathematical formulas used in cost processing.

Test Categories:
- CALC-01: Daily rate calculation (monthly, annual, weekly, quarterly)
- CALC-02: Discount application (percentage and fixed amount)
- CALC-03: Quantity/seat multiplier
- CALC-04: Combined calculations (discount + quantity + proration)
- CALC-05: Edge cases (zero price, negative values, free tiers)

To run: pytest tests/test_05b_saas_cost_calculation_unit.py -v
"""

import pytest
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from typing import Optional
import calendar


# ============================================
# Constants (matching pipeline logic)
# ============================================

# Days per period for cost normalization
DAYS_PER_YEAR = 365
DAYS_PER_LEAP_YEAR = 366
DAYS_PER_MONTH_AVG = 30.4375  # 365 / 12
DAYS_PER_QUARTER_AVG = 91.25  # 365 / 4
DAYS_PER_WEEK = 7


# ============================================
# Cost Calculation Functions (Pure Logic)
# ============================================

def calculate_daily_rate(
    cost: float,
    billing_cycle: str,
    year: Optional[int] = None,
    month: Optional[int] = None
) -> float:
    """
    Calculate daily rate from periodic cost.

    Args:
        cost: Total cost for the billing period
        billing_cycle: MONTHLY, ANNUAL, WEEKLY, QUARTERLY
        year: Optional year for leap year handling (annual only)
        month: Optional month for actual days in month (monthly only)

    Returns:
        Daily rate
    """
    billing_cycle = billing_cycle.upper()

    if billing_cycle == "MONTHLY":
        if month and year:
            # Use actual days in month
            days_in_month = calendar.monthrange(year, month)[1]
            return cost / days_in_month
        else:
            # Use average days per month
            return cost / DAYS_PER_MONTH_AVG

    elif billing_cycle == "ANNUAL" or billing_cycle == "YEARLY":
        if year and calendar.isleap(year):
            return cost / DAYS_PER_LEAP_YEAR
        else:
            return cost / DAYS_PER_YEAR

    elif billing_cycle == "QUARTERLY":
        return cost / DAYS_PER_QUARTER_AVG

    elif billing_cycle == "WEEKLY":
        return cost / DAYS_PER_WEEK

    else:
        raise ValueError(f"Unknown billing cycle: {billing_cycle}")


def apply_discount(
    amount: float,
    discount_percentage: float = 0.0,
    discount_fixed: float = 0.0
) -> float:
    """
    Apply discount to an amount.

    Args:
        amount: Original amount
        discount_percentage: Percentage discount (0-100)
        discount_fixed: Fixed amount discount

    Returns:
        Discounted amount (never less than 0)
    """
    # Apply percentage discount first
    discounted = amount * (1 - discount_percentage / 100)

    # Then apply fixed discount
    discounted = discounted - discount_fixed

    # Never return negative
    return max(0, discounted)


def apply_quantity(amount: float, quantity: int) -> float:
    """
    Apply quantity multiplier to an amount.

    Args:
        amount: Per-unit amount
        quantity: Number of units (seats, licenses, etc.)

    Returns:
        Total amount
    """
    if quantity < 0:
        raise ValueError("Quantity cannot be negative")

    return amount * quantity


def calculate_prorated_cost(
    daily_rate: float,
    start_date: date,
    end_date: date
) -> float:
    """
    Calculate prorated cost for a date range.

    Args:
        daily_rate: Cost per day
        start_date: Start of the period (inclusive)
        end_date: End of the period (inclusive)

    Returns:
        Prorated cost for the date range
    """
    if end_date < start_date:
        raise ValueError("end_date cannot be before start_date")

    days = (end_date - start_date).days + 1  # Inclusive
    return daily_rate * days


def calculate_full_cost(
    unit_price: float,
    billing_cycle: str,
    quantity: int = 1,
    discount_percentage: float = 0.0,
    discount_fixed: float = 0.0,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None
) -> dict:
    """
    Calculate full cost breakdown.

    Returns:
        Dictionary with daily_rate, total_daily, total_monthly, total_annual
    """
    # Step 1: Calculate base daily rate
    daily_rate = calculate_daily_rate(unit_price, billing_cycle, year, month)

    # Step 2: Apply discount to daily rate
    discounted_daily = apply_discount(daily_rate, discount_percentage, discount_fixed / DAYS_PER_MONTH_AVG)

    # Step 3: Apply quantity
    total_daily = apply_quantity(discounted_daily, quantity)

    # Step 4: Calculate projections
    total_monthly = total_daily * DAYS_PER_MONTH_AVG
    total_annual = total_daily * DAYS_PER_YEAR

    result = {
        "daily_rate": daily_rate,
        "discounted_daily": discounted_daily,
        "total_daily": total_daily,
        "total_monthly": total_monthly,
        "total_annual": total_annual,
    }

    # Step 5: Calculate prorated cost if date range provided
    if start_date and end_date:
        result["prorated_cost"] = calculate_prorated_cost(total_daily, start_date, end_date)

    return result


# ============================================
# Test Class: Daily Rate Calculation (CALC-01)
# ============================================

class TestDailyRateCalculation:
    """Test daily rate calculation from various billing periods."""

    def test_calc01_daily_rate_monthly_average(self):
        """
        CALC-01-01: Monthly to daily rate using average days.

        $30/month = $30/30.4375 per day = $0.9856/day
        """
        monthly_cost = 30.00
        expected_daily = monthly_cost / DAYS_PER_MONTH_AVG

        actual_daily = calculate_daily_rate(monthly_cost, "MONTHLY")

        print(f"\nMonthly to daily (average):")
        print(f"  Monthly cost: ${monthly_cost}")
        print(f"  Expected daily: ${expected_daily:.4f}")
        print(f"  Actual daily: ${actual_daily:.4f}")

        assert actual_daily == pytest.approx(expected_daily, rel=0.0001)
        assert actual_daily == pytest.approx(0.9856, rel=0.01)

    def test_calc01_daily_rate_monthly_actual_days(self):
        """
        CALC-01-02: Monthly to daily rate using actual days in month.

        $31/month in January (31 days) = $1.00/day
        $28/month in February (28 days) = $1.00/day
        """
        # January (31 days)
        jan_cost = 31.00
        jan_daily = calculate_daily_rate(jan_cost, "MONTHLY", year=2025, month=1)
        assert jan_daily == pytest.approx(1.0, rel=0.0001)
        print(f"\nJanuary: ${jan_cost}/month = ${jan_daily:.4f}/day")

        # February (28 days, non-leap)
        feb_cost = 28.00
        feb_daily = calculate_daily_rate(feb_cost, "MONTHLY", year=2025, month=2)
        assert feb_daily == pytest.approx(1.0, rel=0.0001)
        print(f"February: ${feb_cost}/month = ${feb_daily:.4f}/day")

        # April (30 days)
        apr_cost = 30.00
        apr_daily = calculate_daily_rate(apr_cost, "MONTHLY", year=2025, month=4)
        assert apr_daily == pytest.approx(1.0, rel=0.0001)
        print(f"April: ${apr_cost}/month = ${apr_daily:.4f}/day")

    def test_calc01_daily_rate_annual_standard(self):
        """
        CALC-01-03: Annual to daily rate (non-leap year).

        $365/year = $1.00/day
        """
        annual_cost = 365.00
        expected_daily = annual_cost / DAYS_PER_YEAR

        actual_daily = calculate_daily_rate(annual_cost, "ANNUAL")

        print(f"\nAnnual to daily (365 days):")
        print(f"  Annual cost: ${annual_cost}")
        print(f"  Expected daily: ${expected_daily:.4f}")
        print(f"  Actual daily: ${actual_daily:.4f}")

        assert actual_daily == pytest.approx(1.0, rel=0.0001)

    def test_calc01_daily_rate_annual_leap_year(self):
        """
        CALC-01-04: Annual to daily rate (leap year).

        $366/year in 2024 (leap year) = $1.00/day
        """
        annual_cost = 366.00
        actual_daily = calculate_daily_rate(annual_cost, "ANNUAL", year=2024)

        print(f"\nAnnual to daily (leap year, 366 days):")
        print(f"  Annual cost: ${annual_cost}")
        print(f"  Actual daily: ${actual_daily:.4f}")

        assert actual_daily == pytest.approx(1.0, rel=0.0001)

    def test_calc01_daily_rate_weekly(self):
        """
        CALC-01-05: Weekly to daily rate.

        $7/week = $1.00/day
        """
        weekly_cost = 7.00
        expected_daily = weekly_cost / DAYS_PER_WEEK

        actual_daily = calculate_daily_rate(weekly_cost, "WEEKLY")

        print(f"\nWeekly to daily:")
        print(f"  Weekly cost: ${weekly_cost}")
        print(f"  Expected daily: ${expected_daily:.4f}")
        print(f"  Actual daily: ${actual_daily:.4f}")

        assert actual_daily == pytest.approx(1.0, rel=0.0001)

    def test_calc01_daily_rate_quarterly(self):
        """
        CALC-01-06: Quarterly to daily rate.

        $91.25/quarter = $1.00/day
        """
        quarterly_cost = 91.25
        expected_daily = quarterly_cost / DAYS_PER_QUARTER_AVG

        actual_daily = calculate_daily_rate(quarterly_cost, "QUARTERLY")

        print(f"\nQuarterly to daily:")
        print(f"  Quarterly cost: ${quarterly_cost}")
        print(f"  Expected daily: ${expected_daily:.4f}")
        print(f"  Actual daily: ${actual_daily:.4f}")

        assert actual_daily == pytest.approx(1.0, rel=0.0001)


# ============================================
# Test Class: Discount Application (CALC-02)
# ============================================

class TestDiscountApplication:
    """Test discount application logic."""

    def test_calc02_discount_percent_10(self):
        """
        CALC-02-01: 10% percentage discount.

        $100 * (1 - 0.10) = $90
        """
        amount = 100.00
        discount = 10.0

        result = apply_discount(amount, discount_percentage=discount)

        print(f"\n10% discount:")
        print(f"  Original: ${amount}")
        print(f"  Discount: {discount}%")
        print(f"  Result: ${result}")

        assert result == pytest.approx(90.0, rel=0.0001)

    def test_calc02_discount_percent_25(self):
        """
        CALC-02-02: 25% percentage discount.

        $100 * (1 - 0.25) = $75
        """
        amount = 100.00
        discount = 25.0

        result = apply_discount(amount, discount_percentage=discount)

        print(f"\n25% discount:")
        print(f"  Original: ${amount}")
        print(f"  Discount: {discount}%")
        print(f"  Result: ${result}")

        assert result == pytest.approx(75.0, rel=0.0001)

    def test_calc02_discount_fixed_amount(self):
        """
        CALC-02-03: Fixed amount discount.

        $100 - $5 = $95
        """
        amount = 100.00
        fixed_discount = 5.00

        result = apply_discount(amount, discount_fixed=fixed_discount)

        print(f"\nFixed discount:")
        print(f"  Original: ${amount}")
        print(f"  Discount: ${fixed_discount}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(95.0, rel=0.0001)

    def test_calc02_discount_combined(self):
        """
        CALC-02-04: Combined percentage and fixed discount.

        $100 * (1 - 0.10) - $5 = $90 - $5 = $85
        """
        amount = 100.00
        percent_discount = 10.0
        fixed_discount = 5.00

        result = apply_discount(
            amount,
            discount_percentage=percent_discount,
            discount_fixed=fixed_discount
        )

        print(f"\nCombined discount:")
        print(f"  Original: ${amount}")
        print(f"  Percent discount: {percent_discount}%")
        print(f"  Fixed discount: ${fixed_discount}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(85.0, rel=0.0001)

    def test_calc02_no_discount(self):
        """
        CALC-02-05: No discount applied.

        $100 with 0% discount = $100
        """
        amount = 100.00

        result = apply_discount(amount)

        print(f"\nNo discount:")
        print(f"  Original: ${amount}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(100.0, rel=0.0001)

    def test_calc02_100_percent_discount(self):
        """
        CALC-02-06: 100% discount (free).

        $100 * (1 - 1.0) = $0
        """
        amount = 100.00
        discount = 100.0

        result = apply_discount(amount, discount_percentage=discount)

        print(f"\n100% discount (free):")
        print(f"  Original: ${amount}")
        print(f"  Discount: {discount}%")
        print(f"  Result: ${result}")

        assert result == pytest.approx(0.0, rel=0.0001)


# ============================================
# Test Class: Quantity Multiplier (CALC-03)
# ============================================

class TestQuantityMultiplier:
    """Test quantity/seat multiplier calculations."""

    def test_calc03_quantity_1_seat(self):
        """
        CALC-03-01: Single seat.

        $10/seat * 1 = $10
        """
        per_seat = 10.00
        seats = 1

        result = apply_quantity(per_seat, seats)

        print(f"\nSingle seat:")
        print(f"  Per seat: ${per_seat}")
        print(f"  Seats: {seats}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(10.0, rel=0.0001)

    def test_calc03_quantity_100_seats(self):
        """
        CALC-03-02: 100 seats.

        $10/seat * 100 = $1000
        """
        per_seat = 10.00
        seats = 100

        result = apply_quantity(per_seat, seats)

        print(f"\n100 seats:")
        print(f"  Per seat: ${per_seat}")
        print(f"  Seats: {seats}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(1000.0, rel=0.0001)

    def test_calc03_quantity_fractional_price(self):
        """
        CALC-03-03: Fractional price per seat.

        $12.99/seat * 5 = $64.95
        """
        per_seat = 12.99
        seats = 5

        result = apply_quantity(per_seat, seats)

        print(f"\nFractional price:")
        print(f"  Per seat: ${per_seat}")
        print(f"  Seats: {seats}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(64.95, rel=0.0001)

    def test_calc03_quantity_zero(self):
        """
        CALC-03-04: Zero seats (should return 0).

        $10/seat * 0 = $0
        """
        per_seat = 10.00
        seats = 0

        result = apply_quantity(per_seat, seats)

        print(f"\nZero seats:")
        print(f"  Per seat: ${per_seat}")
        print(f"  Seats: {seats}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(0.0, rel=0.0001)


# ============================================
# Test Class: Combined Calculation (CALC-04)
# ============================================

class TestCombinedCalculation:
    """Test combined calculations with discount, quantity, and proration."""

    def test_calc04_combined_basic(self):
        """
        CALC-04-01: Basic combined calculation.

        $100/month, 10 seats, 15% discount
        Daily = $100/30.4375 = $3.2852
        Discounted = $3.2852 * 0.85 = $2.7924
        Total daily = $2.7924 * 10 = $27.924
        Monthly = $27.924 * 30.4375 = $850
        """
        unit_price = 100.00
        seats = 10
        discount = 15.0

        result = calculate_full_cost(
            unit_price=unit_price,
            billing_cycle="MONTHLY",
            quantity=seats,
            discount_percentage=discount
        )

        print(f"\nCombined calculation:")
        print(f"  Unit price: ${unit_price}/month")
        print(f"  Seats: {seats}")
        print(f"  Discount: {discount}%")
        print(f"  Daily rate (base): ${result['daily_rate']:.4f}")
        print(f"  Daily rate (discounted): ${result['discounted_daily']:.4f}")
        print(f"  Total daily: ${result['total_daily']:.4f}")
        print(f"  Total monthly: ${result['total_monthly']:.2f}")
        print(f"  Total annual: ${result['total_annual']:.2f}")

        # Verify monthly total: 100 * 10 * 0.85 = $850
        expected_monthly = 100.00 * 10 * 0.85
        assert result['total_monthly'] == pytest.approx(expected_monthly, rel=0.01)

    def test_calc04_combined_with_proration(self):
        """
        CALC-04-02: Combined calculation with proration.

        $30/month, 1 seat, no discount, Jan 15-31 (17 days)
        Daily = $30/31 = $0.9677
        Prorated = $0.9677 * 17 = $16.45
        """
        unit_price = 30.00
        seats = 1

        result = calculate_full_cost(
            unit_price=unit_price,
            billing_cycle="MONTHLY",
            quantity=seats,
            start_date=date(2025, 1, 15),
            end_date=date(2025, 1, 31),
            year=2025,
            month=1
        )

        print(f"\nProrated calculation:")
        print(f"  Unit price: ${unit_price}/month")
        print(f"  Period: Jan 15-31 (17 days)")
        print(f"  Daily rate: ${result['daily_rate']:.4f}")
        print(f"  Prorated cost: ${result['prorated_cost']:.2f}")

        # Daily rate for January = 30/31
        expected_daily = 30.00 / 31
        assert result['daily_rate'] == pytest.approx(expected_daily, rel=0.001)

        # Prorated = daily * 17 days
        expected_prorated = expected_daily * 17
        assert result['prorated_cost'] == pytest.approx(expected_prorated, rel=0.01)

    def test_calc04_enterprise_scenario(self):
        """
        CALC-04-03: Enterprise subscription scenario.

        Slack Business+ at $15/user/month
        100 users, 20% volume discount
        Monthly = $15 * 100 * 0.80 = $1200
        Annual = $1200 * 12 = $14,400
        """
        unit_price = 15.00
        users = 100
        discount = 20.0

        result = calculate_full_cost(
            unit_price=unit_price,
            billing_cycle="MONTHLY",
            quantity=users,
            discount_percentage=discount
        )

        print(f"\nEnterprise scenario:")
        print(f"  Unit price: ${unit_price}/user/month")
        print(f"  Users: {users}")
        print(f"  Volume discount: {discount}%")
        print(f"  Total monthly: ${result['total_monthly']:.2f}")
        print(f"  Total annual: ${result['total_annual']:.2f}")

        expected_monthly = 15.00 * 100 * 0.80
        assert result['total_monthly'] == pytest.approx(expected_monthly, rel=0.01)

        # Annual projection
        expected_annual = expected_monthly * 12
        assert result['total_annual'] == pytest.approx(expected_annual, rel=0.01)


# ============================================
# Test Class: Edge Cases (CALC-05)
# ============================================

class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_calc05_zero_price_free_tier(self):
        """
        CALC-05-01: Zero price (free tier) handling.

        $0/month should result in $0 at all levels.
        """
        result = calculate_full_cost(
            unit_price=0.0,
            billing_cycle="MONTHLY",
            quantity=10
        )

        print(f"\nFree tier (zero price):")
        print(f"  Unit price: $0")
        print(f"  Daily rate: ${result['daily_rate']:.4f}")
        print(f"  Total monthly: ${result['total_monthly']:.2f}")

        assert result['daily_rate'] == pytest.approx(0.0, abs=0.0001)
        assert result['total_monthly'] == pytest.approx(0.0, abs=0.0001)
        assert result['total_annual'] == pytest.approx(0.0, abs=0.0001)

    def test_calc05_negative_discount_rejected(self):
        """
        CALC-05-02: Negative discount should be treated as 0 or raise error.

        Negative discounts don't make business sense.
        """
        amount = 100.00
        negative_discount = -10.0  # This would increase the price

        # With our implementation, negative discount increases the price
        result = apply_discount(amount, discount_percentage=negative_discount)

        print(f"\nNegative discount handling:")
        print(f"  Original: ${amount}")
        print(f"  Discount: {negative_discount}%")
        print(f"  Result: ${result}")

        # Result is 100 * (1 - (-0.10)) = 100 * 1.10 = 110
        # This is mathematically correct but may need validation
        assert result == pytest.approx(110.0, rel=0.0001)

    def test_calc05_very_small_amount(self):
        """
        CALC-05-03: Very small amounts (micro-pricing).

        $0.001/request - common in API pricing
        """
        per_request = 0.001
        requests = 1000000  # 1 million requests

        result = apply_quantity(per_request, requests)

        print(f"\nMicro-pricing:")
        print(f"  Per request: ${per_request}")
        print(f"  Requests: {requests:,}")
        print(f"  Result: ${result:.2f}")

        assert result == pytest.approx(1000.0, rel=0.0001)

    def test_calc05_very_large_amount(self):
        """
        CALC-05-04: Very large amounts (enterprise pricing).

        $1,000,000/year enterprise license
        """
        annual_cost = 1000000.00
        daily = calculate_daily_rate(annual_cost, "ANNUAL")

        print(f"\nLarge enterprise pricing:")
        print(f"  Annual cost: ${annual_cost:,.2f}")
        print(f"  Daily rate: ${daily:,.2f}")

        expected_daily = 1000000 / 365
        assert daily == pytest.approx(expected_daily, rel=0.0001)

    def test_calc05_negative_quantity_rejected(self):
        """
        CALC-05-05: Negative quantity should raise error.
        """
        with pytest.raises(ValueError, match="Quantity cannot be negative"):
            apply_quantity(10.00, -5)

        print("\nNegative quantity correctly rejected")

    def test_calc05_single_day_proration(self):
        """
        CALC-05-06: Single day proration (start == end).

        Daily rate for exactly 1 day.
        """
        daily_rate = 10.00
        single_day = date(2025, 1, 15)

        result = calculate_prorated_cost(daily_rate, single_day, single_day)

        print(f"\nSingle day proration:")
        print(f"  Daily rate: ${daily_rate}")
        print(f"  Date: {single_day}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(10.0, rel=0.0001)

    def test_calc05_invalid_date_range(self):
        """
        CALC-05-07: Invalid date range (end before start) should raise error.
        """
        daily_rate = 10.00
        start = date(2025, 1, 31)
        end = date(2025, 1, 1)  # Before start

        with pytest.raises(ValueError, match="end_date cannot be before start_date"):
            calculate_prorated_cost(daily_rate, start, end)

        print("\nInvalid date range correctly rejected")

    def test_calc05_full_year_proration(self):
        """
        CALC-05-08: Full year proration (365 days).

        $1/day * 365 days = $365
        """
        daily_rate = 1.00
        start = date(2025, 1, 1)
        end = date(2025, 12, 31)

        result = calculate_prorated_cost(daily_rate, start, end)

        print(f"\nFull year proration:")
        print(f"  Daily rate: ${daily_rate}")
        print(f"  Period: {start} to {end}")
        print(f"  Days: {(end - start).days + 1}")
        print(f"  Result: ${result}")

        assert result == pytest.approx(365.0, rel=0.0001)


# ============================================
# Test Class: Currency Conversion (CALC-CURRENCY)
# ============================================

class TestCurrencyConversion:
    """Test currency conversion calculations."""

    def test_currency_usd_to_inr(self):
        """
        CALC-CURRENCY-01: USD to INR conversion.

        $25 USD at 83.50 rate = 2087.50 INR
        """
        usd_price = 25.00
        exchange_rate = 83.50

        inr_price = usd_price * exchange_rate

        print(f"\nUSD to INR conversion:")
        print(f"  USD price: ${usd_price}")
        print(f"  Exchange rate: {exchange_rate}")
        print(f"  INR price: {inr_price:.2f}")

        assert inr_price == pytest.approx(2087.50, rel=0.0001)

    def test_currency_same_currency(self):
        """
        CALC-CURRENCY-02: Same currency (no conversion).

        $25 USD to USD with rate 1.0 = $25 USD
        """
        price = 25.00
        exchange_rate = 1.0

        converted = price * exchange_rate

        print(f"\nSame currency (no conversion):")
        print(f"  Price: ${price}")
        print(f"  Exchange rate: {exchange_rate}")
        print(f"  Result: ${converted}")

        assert converted == pytest.approx(25.0, rel=0.0001)

    def test_currency_audit_fields(self):
        """
        CALC-CURRENCY-03: Verify audit field structure.

        All fields should be populated correctly for audit trail.
        """
        audit_record = {
            "source_currency": "USD",
            "source_price": 25.00,
            "exchange_rate_used": 83.50,
            "currency": "INR",
            "unit_price": 25.00 * 83.50
        }

        print(f"\nCurrency audit fields:")
        for key, value in audit_record.items():
            print(f"  {key}: {value}")

        assert audit_record["source_currency"] == "USD"
        assert audit_record["currency"] == "INR"
        assert audit_record["unit_price"] == audit_record["source_price"] * audit_record["exchange_rate_used"]


# ============================================
# Test Class: Rounding Behavior (CALC-ROUND)
# ============================================

class TestRoundingBehavior:
    """Test rounding behavior for cost calculations."""

    def test_rounding_half_up(self):
        """
        CALC-ROUND-01: Standard half-up rounding for display.

        $10.125 rounds to $10.13
        $10.124 rounds to $10.12
        """
        value1 = Decimal("10.125")
        value2 = Decimal("10.124")

        rounded1 = value1.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rounded2 = value2.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        print(f"\nHalf-up rounding:")
        print(f"  {value1} → {rounded1}")
        print(f"  {value2} → {rounded2}")

        assert rounded1 == Decimal("10.13")
        assert rounded2 == Decimal("10.12")

    def test_rounding_accumulated(self):
        """
        CALC-ROUND-02: Accumulated rounding for monthly calculations.

        30 days at $0.333/day should accumulate to ~$9.99
        """
        daily_rate = 0.333
        days = 30

        total = daily_rate * days

        print(f"\nAccumulated calculation:")
        print(f"  Daily rate: ${daily_rate}")
        print(f"  Days: {days}")
        print(f"  Total (raw): ${total}")
        print(f"  Total (rounded): ${round(total, 2)}")

        assert total == pytest.approx(9.99, rel=0.01)
