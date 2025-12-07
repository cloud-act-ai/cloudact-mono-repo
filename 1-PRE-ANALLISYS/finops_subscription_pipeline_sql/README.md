# FinOps Subscription → Daily Costs → Standardized Cost Table (v1.2 column set)

This bundle creates:

- `subscription_plans` (master)
- `subscription_plan_costs_daily` (derived daily costs)
- `cost_data_standard_1_2` (neutral standardized costs table with the complete v1.2 column set + internal fields)

## Stage flow diagram

```text
+-----------------------------------------------------------------------------------+
| STEP 1: Source Table                                                              |
| gac-prod-471220.procedure_testsing.subscription_plans                             |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
| STEP 2: Stored Procedure (Stage 1)                                                |
| sp_calculate_subscription_plan_costs_daily.sql                                    |
|                                                                                   |
| INPUTS:                                                                           |
|  • start_date        (e.g., '2024-01-01')                                         |
|  • end_date          (e.g., '2024-01-31')                                         |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
           +----------------------------------------------------------+
           | 2A: GENERATE DATE SPINE & CROSS JOIN                     |
           | Filter by active Plans                                   |
           | -> Expand each plan to daily rows                        |
           +----------------------------------------------------------+
                                        |
                                        v
           +----------------------------------------------------------+
           | 2B: CALCULATE DAILY COST                                 |
           | • Monthly: Cost / Days in Month                          |
           | • Annual:  Cost / Days in Year (Leap year aware)         |
           +----------------------------------------------------------+
                                        |
                                        v
           +----------------------------------------------------------+
           | 2C: INSERT INTO DAILY TABLE                              |
           | subscription_plan_costs_daily                            |
           | -> Partitioned by cost_date, Clustered by org_id         |
           +----------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
| STEP 3: Stored Procedure (Stage 2)                                                |
| sp_convert_subscription_costs_daily_to_standard_1_2.sql                           |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
           +----------------------------------------------------------+
           | 3A: READ & MAP TO FOCUS 1.2                              |
           | • Map organization_id -> SubAccountId                    |
           | • Map quantity -> ConsumedQuantity                       |
           | • Set ChargeCategory = 'Subscription'                    |
           +----------------------------------------------------------+
                                        |
                                        v
           +----------------------------------------------------------+
           | 3B: IDEMPOTENCY CLEANUP & INSERT                         |
           | Delete existing rows for date range -> Insert new        |
           | -> Output: cost_data_standard_1_2                        |
           +----------------------------------------------------------+
```

## How to run (examples)

### 1. Daily Run (All Customers)

Refreshes data for **ALL** tenants for the given date range.

```sql
CALL `gac-prod-471220.procedure_testsing`.sp_run_subscription_costs_pipeline(
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
  NULL
);
```

### 2. Ad-hoc Run (Specific Customer)

Refreshes data **ONLY** for `guru_inc_123` without touching others.

```sql
CALL `gac-prod-471220.procedure_testsing`.sp_run_subscription_costs_pipeline(
  DATE('2025-12-01'),
  DATE('2025-12-31'),
  'guru_inc_123'
);
```

## Notes on "constraints"

BigQuery does not support CHECK constraints like Postgres.
We enforce required fields using:

- NOT NULL columns in `subscription_plans`
- ASSERT guardrails inside procedures

## Logic & Usage Guide

### 1. Handling Cancellations

To cancel a subscription:

- Do **not** delete the row.
- Set the `end_date` to the last valid day of the subscription.
- The pipeline will automatically calculate costs up to that date and stop effectively the next day.
- _Example_: `end_date = '2025-12-07'` means usage is calculated for Dec 7th, but is $0 from Dec 8th.

### 2. Changing Seats (SCD Type 2)

To increase/decrease seats (e.g., 10 -> 2):

1.  **Close the old row**: Set `end_date` to today.
2.  **Create a new row**: Insert a new record with `start_date` = tomorrow and the new seat count.

This preserves historical cost accuracy.

### 3. Leap Year Logic

- Annual plans are calculated as `Price / DaysInYear`.
- In a leap year (e.g., 2024, 2028), the denominator is **366**.
- This ensures daily costs are precise and you are not "over-billed" by missing Feb 29th.

### 4. Pricing Models

- **PER_SEAT** (Default): `DailyCost = (UnitPrice * Seats) / DaysInCycle`
- **FLAT_FEE**: `DailyCost = UnitPrice / DaysInCycle` (Seats are ignored for price, but tracked for quantity).

## CSV Data Entry Guide

How to format rows in `default_subscription_plans.csv` for different models:

### 1. Per Seat Subscription (e.g. ChatGPT, GitHub)

- **pricing_model**: `PER_SEAT` (or leave empty, defaulting to this)
- **seats**: The number of licenses (e.g., `10`)
- **unit_price_usd**: The price **PER USER** (e.g., `30.00`)
- _Resulting Cost_: $30 \* 10 = $300/month.

### 2. Flat Fee Subscription (e.g. Platform Fee, 1Password Family)

- **pricing_model**: `FLAT_FEE`
- **seats**: The number of users (e.g., `50`). _Used for reporting only._
- **unit_price_usd**: The **TOTAL** price for the plan (e.g., `199.00`)
- _Resulting Cost_: $199/month (regardless of seat count).
