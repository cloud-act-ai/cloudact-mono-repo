---
name: web-research
description: |
  Web research and analysis for CloudAct. LLM pricing lookup, provider comparisons, market analysis.
  Use when: checking current LLM pricing online, comparing provider costs, researching new providers,
  finding API documentation, analyzing market trends, or validating pricing data.
---

# Web Research & Analysis

## Overview
Use internet search to gather and analyze external data like LLM pricing, provider APIs, and market trends.

## Key Use Cases
- **LLM Pricing Research** - Current pricing for OpenAI, Anthropic, Google, etc.
- **Provider Comparison** - Compare features, costs, rate limits
- **API Documentation** - Find latest API docs and examples
- **Market Analysis** - Track pricing changes and trends
- **New Provider Research** - Evaluate new LLM/cloud providers

## LLM Pricing Sources

### Official Pricing Pages
| Provider | Pricing URL |
|----------|-------------|
| OpenAI | https://openai.com/pricing |
| Anthropic | https://anthropic.com/pricing |
| Google (Gemini) | https://ai.google.dev/pricing |
| DeepSeek | https://platform.deepseek.com/api-docs/pricing |
| Mistral | https://mistral.ai/technology/#pricing |
| Cohere | https://cohere.com/pricing |
| AWS Bedrock | https://aws.amazon.com/bedrock/pricing/ |
| Azure OpenAI | https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/ |

### Aggregator Sites
| Site | Purpose |
|------|---------|
| LLM Price Check | https://llmpricecheck.com |
| Artificial Analysis | https://artificialanalysis.ai |
| LLM Stats | https://llm-stats.com |

## Instructions

### 1. Research Current LLM Pricing
```
# Ask Claude to search for pricing
"What are the current OpenAI GPT-4o pricing rates?"
"Search for Anthropic Claude 3.5 Sonnet pricing"
"Find the latest Gemini Pro pricing per million tokens"
"Compare pricing between Claude and GPT-4"
```

### 2. Compare Multiple Providers
```
# Multi-provider comparison
"Compare LLM pricing across OpenAI, Anthropic, and Google"
"Which provider is cheapest for high-volume usage?"
"Compare input vs output token costs for top LLMs"
```

### 3. Research New Provider
```
# Evaluate new provider
"Research Mistral AI pricing and capabilities"
"Find DeepSeek API documentation and rate limits"
"What are Cohere's embedding model prices?"
```

### 4. Validate Existing Pricing Data
```
# Check if our data is current
"Verify our OpenAI pricing is up to date"
"Has Anthropic changed Claude pricing recently?"
"Check for any LLM pricing changes in December 2024"
```

### 5. Update CloudAct Pricing Table
After research, update the pricing data:
```python
# Path: 02-api-service/configs/llm/seed/data/default_pricing.csv
# Format:
provider,model_id,model_name,input_price_per_million,output_price_per_million,effective_date
openai,gpt-4o,GPT-4o,2.50,10.00,2024-12-01
anthropic,claude-3-5-sonnet,Claude 3.5 Sonnet,3.00,15.00,2024-12-01
```

## Pricing Data Structure

### CloudAct LLM Pricing Schema
```json
{
  "provider": "string",
  "model_id": "string",
  "model_name": "string",
  "input_price_per_million": "float",
  "output_price_per_million": "float",
  "context_window": "integer",
  "max_output_tokens": "integer",
  "effective_date": "date",
  "notes": "string"
}
```

### Current Known Pricing (as of Dec 2024)

#### OpenAI
| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| GPT-4 Turbo | $10.00 | $30.00 |
| o1 | $15.00 | $60.00 |
| o1-mini | $3.00 | $12.00 |

#### Anthropic
| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3.5 Haiku | $0.80 | $4.00 |
| Claude 3 Opus | $15.00 | $75.00 |

#### Google
| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Gemini 1.5 Pro | $1.25 | $5.00 |
| Gemini 1.5 Flash | $0.075 | $0.30 |
| Gemini 2.0 Flash | $0.10 | $0.40 |

#### DeepSeek
| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| DeepSeek-V3 | $0.27 | $1.10 |
| DeepSeek-V2.5 | $0.14 | $0.28 |

## Analysis Patterns

### Cost Comparison Analysis
```sql
-- Compare provider costs for same usage
WITH usage AS (
  SELECT 1000000 as input_tokens, 500000 as output_tokens
)
SELECT
  p.provider,
  p.model_name,
  (u.input_tokens / 1000000.0 * p.input_price_per_million) +
  (u.output_tokens / 1000000.0 * p.output_price_per_million) as total_cost
FROM llm_model_pricing p, usage u
ORDER BY total_cost;
```

### Price Change Detection
```sql
-- Find models with recent price changes
SELECT
  provider,
  model_name,
  effective_date,
  input_price_per_million,
  output_price_per_million
FROM llm_model_pricing
WHERE effective_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY effective_date DESC;
```

### Cost Optimization Analysis
```python
def find_cheapest_model(input_tokens: int, output_tokens: int, providers: list):
    """Find the cheapest model for given usage."""
    costs = []
    for model in get_pricing_data(providers):
        cost = (
            (input_tokens / 1_000_000) * model.input_price +
            (output_tokens / 1_000_000) * model.output_price
        )
        costs.append({
            "provider": model.provider,
            "model": model.model_name,
            "cost": cost
        })
    return sorted(costs, key=lambda x: x["cost"])
```

## Research Workflow

### Complete Pricing Update Flow
```
1. Search → "Current LLM pricing for [provider]"
2. Verify → Check official pricing page
3. Compare → Compare with existing data
4. Update → Modify default_pricing.csv
5. Test → Run pricing tests
6. Deploy → Push to production
```

### Monthly Pricing Audit
```
1. Check all provider pricing pages
2. Compare with stored pricing data
3. Identify any changes
4. Update CSV with new effective_date
5. Document changes in changelog
6. Notify stakeholders of significant changes
```

## Web Search Tips

### Effective Search Queries
```
# Current pricing
"OpenAI API pricing 2024"
"Anthropic Claude pricing per token"
"Gemini API cost calculator"

# Price changes
"OpenAI price reduction announcement"
"Anthropic pricing update December 2024"

# Comparisons
"LLM pricing comparison chart 2024"
"cheapest LLM API providers"
"GPT-4 vs Claude 3.5 cost comparison"

# Documentation
"OpenAI usage API documentation"
"Anthropic billing API reference"
```

### Verify Information
- Always check official sources
- Cross-reference with multiple sources
- Note the date of information
- Check for regional pricing differences

## Example Prompts

```
# Pricing Research
"Search for current OpenAI pricing"
"What's the latest Claude 3.5 Sonnet price per million tokens?"
"Find Gemini 2.0 Flash pricing"
"Look up DeepSeek API costs"

# Comparisons
"Compare LLM pricing across all major providers"
"Which is cheaper: Claude or GPT-4o for high volume?"
"Research the most cost-effective LLM for embeddings"

# Analysis
"Analyze LLM pricing trends over the last 6 months"
"Calculate cost difference between providers for 10M tokens/month"
"Find the best value LLM for code generation"

# Updates
"Check if our LLM pricing data is current"
"Has any provider changed pricing this month?"
"Update our pricing table with latest rates"

# New Providers
"Research Mistral AI API and pricing"
"Evaluate Cohere for embeddings use case"
"Find information about Groq pricing"
```

## Validation Checklist
- [ ] Pricing from official source
- [ ] Date of pricing verified
- [ ] Input AND output prices captured
- [ ] Context window noted
- [ ] Special pricing tiers documented
- [ ] Regional differences checked

## Common Issues
| Issue | Solution |
|-------|----------|
| Outdated pricing | Check official pricing page |
| Missing model | Provider may have new models |
| Regional pricing | Some providers have regional rates |
| Batch pricing | Check for batch/commitment discounts |

## Related Skills
- `cost-analysis` - Apply pricing to usage data
- `provider-mgmt` - Add new provider with pricing
- `integration-setup` - Configure provider access
