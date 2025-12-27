# GenAI Costs - Usage Prompts

Example prompts for using the GenAI costs skill in different scenarios.

---

## Pricing Management

### View Current Pricing
```
Show me all GenAI pricing for {org_slug}
```

```
What is the current pricing for OpenAI GPT-4o in {org_slug}?
```

```
List all PAYG pricing with model details for {org_slug}
```

### Set Pricing Overrides
```
Set a custom pricing override for GPT-4o in {org_slug}: $2.00/1M input, $8.00/1M output (enterprise discount)
```

```
Apply 20% discount on Anthropic Claude pricing for {org_slug} effective January 1, 2025
```

```
Remove pricing override for Gemini Pro in {org_slug}
```

---

## Usage Analysis

### Daily Usage
```
Show me OpenAI usage for {org_slug} on December 25, 2025
```

```
What was the total token usage across all providers for {org_slug} last week?
```

```
Break down usage by model for {org_slug} in December 2025
```

### Team/Department Usage
```
Show GenAI usage by team for {org_slug} this month
```

```
Which department used the most tokens in {org_slug}?
```

```
Get usage for team TEAM-BACKEND in {org_slug} from December 1-25
```

### Usage Trends
```
Show usage trends for {org_slug} over the last 30 days
```

```
Compare OpenAI vs Anthropic usage for {org_slug}
```

---

## Cost Analysis

### Daily Costs
```
What were the GenAI costs for {org_slug} yesterday?
```

```
Show me cost breakdown by provider for {org_slug} on December 25
```

```
Get total GenAI spend for {org_slug} in December 2025
```

### Cost Breakdown
```
Break down GenAI costs by flow (PAYG, commitment, infrastructure) for {org_slug}
```

```
Show model-level cost breakdown for {org_slug} this month
```

```
What are the input vs output costs for OpenAI in {org_slug}?
```

### Team/Department Costs
```
Show GenAI costs by team for {org_slug} (chargeback report)
```

```
Which project has the highest GenAI spend in {org_slug}?
```

```
Generate chargeback report for department DEPT-ENGINEERING in {org_slug}
```

### Cost Comparison
```
Compare GenAI costs between OpenAI and Anthropic for {org_slug}
```

```
Show month-over-month GenAI cost change for {org_slug}
```

---

## Pipeline Operations

### Run Pipelines
```
Run the OpenAI PAYG pipeline for {org_slug} for December 25
```

```
Execute all GenAI pipelines for {org_slug} for yesterday
```

```
Run the consolidation pipeline for {org_slug}
```

### Pipeline Status
```
Check the status of GenAI pipelines for {org_slug}
```

```
Show me failed GenAI pipeline runs for {org_slug} in the last week
```

```
When was the last successful consolidation run for {org_slug}?
```

---

## Commitment & Infrastructure

### Commitment (PTU/GSU)
```
Show Azure PTU usage and costs for {org_slug}
```

```
What is our PTU utilization rate for {org_slug}?
```

```
Compare committed vs actual usage for GCP GSU in {org_slug}
```

### Infrastructure (GPU/TPU)
```
Show GPU infrastructure costs for {org_slug}
```

```
What GPU types are we using in {org_slug}?
```

```
Break down GPU costs by instance type for {org_slug}
```

---

## FOCUS 1.3 Reporting

### Generate FOCUS Reports
```
Convert GenAI costs to FOCUS 1.3 format for {org_slug}
```

```
Show FOCUS 1.3 compliant cost data for {org_slug} this month
```

```
Generate cross-domain cost report including GenAI for {org_slug}
```

---

## Troubleshooting

### Debug Missing Data
```
Why is there no OpenAI usage data for {org_slug} on December 25?
```

```
Check if OpenAI credentials are valid for {org_slug}
```

```
Show pipeline logs for GenAI pipelines in {org_slug}
```

### Cost Discrepancies
```
Why do my GenAI costs not match the OpenAI invoice for {org_slug}?
```

```
Check for pricing overrides that might affect costs in {org_slug}
```

```
Validate the pricing table data for {org_slug}
```

---

## Implementation & Setup

### Table Setup
```
What GenAI tables exist for {org_slug}?
```

```
Verify the GenAI table schemas are correct for {org_slug}
```

### Processor Status
```
List all GenAI pipeline processors
```

```
What ps_types are available for GenAI pipelines?
```

### Integration Status
```
Show the status of GenAI provider integrations for {org_slug}
```

```
Which GenAI providers are configured for {org_slug}?
```

---

## Quick Reference Commands

| Scenario | Prompt |
|----------|--------|
| View all pricing | `Show GenAI pricing for {org}` |
| Set override | `Set $X.XX/1M override for {model} in {org}` |
| Get usage | `Show GenAI usage for {org} on {date}` |
| Get costs | `Show GenAI costs for {org} from {start} to {end}` |
| Run pipeline | `Run {provider} pipeline for {org}` |
| Chargeback | `Generate chargeback report for {team} in {org}` |
| Troubleshoot | `Why is {provider} data missing for {org}?` |

---

## Provider-Specific Prompts

### OpenAI
```
Get OpenAI usage and costs for {org_slug} including GPT-4o and o1 models
```

### Anthropic
```
Show Anthropic Claude usage for {org_slug} with haiku vs sonnet breakdown
```

### Google Gemini
```
Get Gemini API costs for {org_slug} including 2.0 Flash Thinking
```

### Azure OpenAI
```
Show Azure OpenAI PTU utilization and costs for {org_slug}
```

### AWS Bedrock
```
Get AWS Bedrock provisioned throughput usage for {org_slug}
```

### GCP Vertex AI
```
Show Vertex AI GSU costs and GPU infrastructure for {org_slug}
```

---

## Multi-Provider Analysis

```
Compare costs across all 6 GenAI providers for {org_slug} this month
```

```
Which provider offers the best cost per token for {org_slug}?
```

```
Show total GenAI spend across PAYG, commitment, and infrastructure for {org_slug}
```

---

*Last Updated: 2025-12-26*
