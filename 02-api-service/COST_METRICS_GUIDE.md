# Cost Metrics Guide

Quick reference for understanding cost summary fields returned by the cost service API.

## Summary Fields

| Field | Description | Formula | Use Case |
|-------|-------------|---------|----------|
| `total_daily_cost` | Current daily rate | Sum of latest day's BilledCost per resource | "Your daily spending is $X" |
| `total_monthly_cost` | Month-to-date actual | Sum of BilledCost from month start to today | "You've spent $X this month" |
| `total_annual_cost` | Year forecast | YTD actual + (daily rate × remaining days) | "You're projected to spend $X this year" |
| `total_billed_cost` | Total in date range | Sum of all BilledCost in query date range | "Total cost from {start} to {end}" |
| `ytd_cost` | Year-to-date actual | Sum of BilledCost from Jan 1 to today | "You've spent $X so far this year" |
| `mtd_cost` | Month-to-date actual | Sum of BilledCost from month start to today | "You've spent $X so far this month" |
| `forecast_monthly_cost` | Month forecast | Daily rate × days in current month | "At current rate, this month will cost $X" |
| `forecast_annual_cost` | Year forecast | YTD + (daily rate × remaining days) | "At current rate, this year will cost $X" |

## Examples

### Scenario 1: Mid-Month Check (Dec 10, 2025)

```json
{
  "total_daily_cost": 10.00,         // Currently spending $10/day
  "total_monthly_cost": 100.00,      // Spent $100 so far in December (10 days × $10)
  "total_annual_cost": 1220.00,      // Projected year: $1000 (Jan-Dec 9) + $220 (Dec 10-31)
  "ytd_cost": 1000.00,               // Spent $1000 from Jan 1 - Dec 9
  "mtd_cost": 100.00,                // Spent $100 from Dec 1 - Dec 10
  "forecast_monthly_cost": 310.00,   // Projected December: $10 × 31 days
  "forecast_annual_cost": 1220.00    // Projected 2025: $1000 + ($10 × 22 days)
}
```

**Analysis:**
- Daily rate: $10/day
- Days in December: 31
- Days remaining in year: 22 (Dec 10-31)
- MTD spending is on track (10 days × $10 = $100)

### Scenario 2: Subscription Downgrade (4 seats → 1 seat)

**Before Downgrade (Jan 1 - Jun 30):**
- Daily rate: $40/day (4 seats × $10/seat)
- 180 days × $40 = $7,200

**After Downgrade (Jul 1 - Dec 10):**
- Daily rate: $10/day (1 seat × $10/seat)
- 163 days × $10 = $1,630

**Dec 10 Summary:**
```json
{
  "total_daily_cost": 10.00,         // Current rate (1 seat)
  "ytd_cost": 8830.00,               // $7,200 (before) + $1,630 (after)
  "forecast_annual_cost": 9050.00,   // $8,830 + ($10 × 22 days)
  "total_annual_cost": 9050.00       // Same as forecast_annual_cost
}
```

**Key Point:** YTD includes costs at both rates, but forecast uses only current rate.

### Scenario 3: Price Increase (Nov 1)

**Before Price Increase (Jan 1 - Oct 31):**
- Daily rate: $8/day
- 304 days × $8 = $2,432

**After Price Increase (Nov 1 - Dec 10):**
- Daily rate: $12/day
- 40 days × $12 = $480

**Dec 10 Summary:**
```json
{
  "total_daily_cost": 12.00,         // Current rate (new price)
  "ytd_cost": 2912.00,               // $2,432 (old price) + $480 (new price)
  "forecast_annual_cost": 3176.00,   // $2,912 + ($12 × 22 days)
  "total_annual_cost": 3176.00       // Same as forecast_annual_cost
}
```

**Key Point:** Forecast reflects new pricing, but YTD includes historical costs at old pricing.

## Frontend Display Recommendations

### Dashboard Card: Monthly Costs

```tsx
<Card>
  <CardHeader>
    <CardTitle>This Month</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">
      ${summary.mtd_cost.toFixed(2)}
    </div>
    <p className="text-sm text-muted-foreground">
      Spent so far (${summary.total_daily_cost.toFixed(2)}/day)
    </p>
    <Progress
      value={(summary.mtd_cost / summary.forecast_monthly_cost) * 100}
      className="mt-2"
    />
    <p className="text-xs text-muted-foreground mt-1">
      Projected: ${summary.forecast_monthly_cost.toFixed(2)}
    </p>
  </CardContent>
</Card>
```

### Dashboard Card: Annual Costs

```tsx
<Card>
  <CardHeader>
    <CardTitle>This Year</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">
      ${summary.ytd_cost.toFixed(2)}
    </div>
    <p className="text-sm text-muted-foreground">
      Spent so far ({daysElapsed} days)
    </p>
    <Progress
      value={(summary.ytd_cost / summary.forecast_annual_cost) * 100}
      className="mt-2"
    />
    <p className="text-xs text-muted-foreground mt-1">
      Projected: ${summary.forecast_annual_cost.toFixed(2)}
    </p>
  </CardContent>
</Card>
```

### Cost Trend Indicator

```tsx
function CostTrend({ current, previous }: { current: number; previous: number }) {
  const change = ((current - previous) / previous) * 100
  const isUp = change > 0

  return (
    <div className={cn("flex items-center gap-1", isUp ? "text-red-600" : "text-green-600")}>
      {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      <span className="text-sm font-medium">
        {Math.abs(change).toFixed(1)}% vs last period
      </span>
    </div>
  )
}
```

## API Endpoints

All cost endpoints return the same summary structure:

```bash
# SaaS subscription costs
GET /api/v1/costs/{org}/saas-subscriptions?start_date=2025-01-01&end_date=2025-12-10

# Cloud costs (GCP, AWS, Azure)
GET /api/v1/costs/{org}/cloud-costs?start_date=2025-01-01&end_date=2025-12-10

# LLM API costs (OpenAI, Anthropic)
GET /api/v1/costs/{org}/llm-costs?start_date=2025-01-01&end_date=2025-12-10
```

## Common Patterns

### Budget Alert

```typescript
function checkBudgetAlert(summary: SaaSCostSummary, monthlyBudget: number) {
  const percentUsed = (summary.forecast_monthly_cost / monthlyBudget) * 100

  if (percentUsed > 100) {
    return {
      level: "error",
      message: `Projected to exceed budget by ${(percentUsed - 100).toFixed(1)}%`
    }
  } else if (percentUsed > 80) {
    return {
      level: "warning",
      message: `${percentUsed.toFixed(1)}% of budget used`
    }
  }

  return {
    level: "info",
    message: `${percentUsed.toFixed(1)}% of budget used`
  }
}
```

### Burn Rate

```typescript
function calculateBurnRate(summary: SaaSCostSummary) {
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysPassed = today.getDate()
  const daysRemaining = daysInMonth - daysPassed

  return {
    daily: summary.total_daily_cost,
    monthly: summary.forecast_monthly_cost,
    annual: summary.forecast_annual_cost,
    daysRemaining,
    projectedMonthEnd: summary.mtd_cost + (summary.total_daily_cost * daysRemaining)
  }
}
```

### Savings Calculator

```typescript
function calculateSavingsOpportunity(
  currentSummary: SaaSCostSummary,
  optimizedDailyRate: number
) {
  const today = new Date()
  const daysRemaining = 365 - Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24))

  const currentForecast = currentSummary.forecast_annual_cost
  const optimizedForecast = currentSummary.ytd_cost + (optimizedDailyRate * daysRemaining)
  const savings = currentForecast - optimizedForecast

  return {
    currentForecast,
    optimizedForecast,
    potentialSavings: savings,
    savingsPercent: (savings / currentForecast) * 100
  }
}
```

---

**Last Updated:** 2025-12-10
