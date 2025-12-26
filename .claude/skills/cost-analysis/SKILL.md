---
name: cost-analysis
description: |
  Cost analysis and calculation for CloudAct. Multi-currency support, FOCUS 1.3 compliance, cost allocation.
  Use when: analyzing costs, debugging cost calculations, working with multi-currency data,
  understanding cost allocation, FOCUS 1.3 format, or validating cost pipelines.
---

# Cost Analysis

## Overview
CloudAct tracks costs across cloud providers, LLM APIs, and SaaS subscriptions using FOCUS 1.3 standard.

## Key Locations
- **Cost Processors:** `03-data-pipeline-service/src/core/processors/`
- **Cost Schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/`
- **Cost Tests:** `03-data-pipeline-service/tests/test_05b_saas_cost_calculation_unit.py`
- **Cost Dashboard:** `01-fronted-system/app/[orgSlug]/cost-dashboards/`

## FOCUS 1.3 Standard
CloudAct implements FinOps FOCUS 1.3 specification for cost data:
```
cost_data_standard_1_3
├── BillingAccountId
├── BillingAccountName
├── BillingPeriodStart
├── BillingPeriodEnd
├── ChargeCategory (Usage, Purchase, Tax, Credit)
├── ChargeClass (Regular, Correction, Rounding)
├── ChargeDescription
├── ChargeFrequency (One-Time, Recurring, Usage-Based)
├── ChargePeriodStart
├── ChargePeriodEnd
├── CommitmentDiscountCategory
├── CommitmentDiscountId
├── CommitmentDiscountName
├── CommitmentDiscountStatus
├── CommitmentDiscountType
├── ConsumedQuantity
├── ConsumedUnit
├── ContractedCost
├── ContractedUnitPrice
├── EffectiveCost
├── InvoiceIssuerName
├── ListCost
├── ListUnitPrice
├── PricingCategory
├── PricingQuantity
├── PricingUnit
├── ProviderName
├── PublisherName
├── RegionId
├── RegionName
├── ResourceId
├── ResourceName
├── ResourceType
├── ServiceCategory
├── ServiceName
├── SkuId
├── SkuPriceId
├── SubAccountId
├── SubAccountName
├── Tags
└── CloudAct Extensions (hierarchy_dept_id, hierarchy_project_id, hierarchy_team_id)
```

## Multi-Currency Support
CloudAct supports 6 currencies with fixtures:
| Currency | Org Fixture | Exchange Rate (to USD) |
|----------|-------------|------------------------|
| USD | acme_us | 1.0000 |
| INR | acme_in | 0.0120 |
| EUR | acme_eu | 1.0850 |
| AED | acme_ae | 0.2723 |
| AUD | acme_au | 0.6550 |
| JPY | acme_jp | 0.0067 |

## Cost Calculation Patterns

### 1. LLM Token Costs
```python
# Token-based pricing
input_cost = input_tokens * (input_price_per_million / 1_000_000)
output_cost = output_tokens * (output_price_per_million / 1_000_000)
total_cost = input_cost + output_cost
```

### 2. SaaS Subscription Costs
```python
# Monthly to daily proration
if billing_cycle == "monthly":
    daily_cost = monthly_cost / days_in_month
elif billing_cycle == "annual":
    daily_cost = annual_cost / 365

# With quantity
total_daily = daily_cost * quantity
```

### 3. Cloud Provider Costs
```python
# From billing export
cost = billed_cost * (1 + tax_rate)
effective_cost = cost - credits - discounts
```

## Instructions

### 1. Analyze Org Costs
```sql
-- Total costs by provider
SELECT
    ProviderName,
    SUM(EffectiveCost) as total_cost,
    currency
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
WHERE BillingPeriodStart >= '2024-01-01'
GROUP BY ProviderName, currency
ORDER BY total_cost DESC;
```

### 2. Cost by Hierarchy
```sql
-- Costs by department
SELECT
    hierarchy_dept_name,
    SUM(EffectiveCost) as dept_cost
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
GROUP BY hierarchy_dept_name;
```

### 3. LLM Usage Costs
```sql
-- LLM costs by model
SELECT
    ResourceName as model,
    SUM(ConsumedQuantity) as total_tokens,
    SUM(EffectiveCost) as total_cost
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
WHERE ProviderName IN ('OpenAI', 'Anthropic', 'Google', 'DeepSeek')
GROUP BY model
ORDER BY total_cost DESC;
```

### 4. Validate Cost Calculations
```bash
# Run cost calculation tests
cd 03-data-pipeline-service
python -m pytest tests/test_05b_saas_cost_calculation_unit.py -v
```

## Fiscal Year Support
CloudAct supports multiple fiscal year patterns:
| Pattern | Start | Used By |
|---------|-------|---------|
| Calendar | Jan 1 | US companies |
| India/UK | Apr 1 | India, UK |
| Japan | Apr 1 | Japan |
| Australia | Jul 1 | Australia |

```python
# Fiscal year calculation
def get_fiscal_year(date, fiscal_start_month=1):
    if date.month >= fiscal_start_month:
        return date.year
    return date.year - 1
```

## Cost Dashboard Routes
| Route | Purpose |
|-------|---------|
| `/[orgSlug]/cost-dashboards` | Overview dashboard |
| `/[orgSlug]/cost-dashboards/overview` | Summary view |
| `/[orgSlug]/cost-dashboards/cloud-costs` | Cloud provider costs |
| `/[orgSlug]/cost-dashboards/genai-costs` | LLM/GenAI costs |
| `/[orgSlug]/cost-dashboards/subscription-costs` | SaaS costs |

## Validation Checklist
- [ ] Costs use correct currency
- [ ] Exchange rates applied correctly
- [ ] Proration logic for partial periods
- [ ] Tax calculations included
- [ ] Credits/discounts subtracted
- [ ] Hierarchy mapping correct
- [ ] FOCUS 1.3 fields populated

## Common Issues
| Issue | Solution |
|-------|----------|
| Currency mismatch | Check org default currency |
| Missing costs | Verify pipeline ran successfully |
| Wrong totals | Check proration logic |
| Hierarchy null | Map subscription to hierarchy |

## Example Prompts

```
# Analyzing Costs
"Show total costs by provider for this month"
"What are our LLM costs broken down by model?"
"Compare costs between departments"

# Multi-Currency
"Costs showing in wrong currency for acme_in"
"How do exchange rates work in CloudAct?"
"Convert USD costs to INR for reporting"

# FOCUS 1.3
"What FOCUS 1.3 fields are required?"
"Map our cost data to FOCUS standard"
"Explain EffectiveCost vs ListCost difference"

# Cost Allocation
"Allocate costs to the Engineering department"
"Show costs by hierarchy level"

# Troubleshooting
"Why are costs showing as zero?"
"Token costs don't match the invoice"
```

## Related Skills
- `pipeline-ops` - Run cost pipelines
- `hierarchy-ops` - Cost allocation setup
- `quota-mgmt` - Cost-based quotas
