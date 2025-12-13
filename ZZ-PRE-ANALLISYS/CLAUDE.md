# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Pre-analysis and testing utilities for LLM API cost tracking across OpenAI, Anthropic, and Gemini providers.

## Structure

```
ZZ-PRE-ANALLISYS/
├── generate_traffic.py         # Generate API traffic for all providers
├── fetch_usage.py              # Fetch usage from provider APIs
├── calculate_costs.py          # Calculate costs from usage data
├── audit_subscription_calculations.py  # Test subscription API (requires api-service)
├── openai/                     # OpenAI-specific module
│   ├── api.py                  # Traffic generation, usage fetching
│   └── pricing.py              # OpenAI pricing tables
├── anthropic/                  # Anthropic-specific module
│   ├── api.py                  # Traffic generation, usage fetching
│   └── pricing.py              # Anthropic pricing tables
├── gemini/                     # Gemini-specific module
│   ├── api.py                  # Traffic generation, usage fetching
│   └── pricing.py              # Gemini pricing tables
├── utils/
│   └── usage_store.py          # Local logging for usage events
├── output/                     # Generated CSV reports
└── .env                        # Environment variables
```

## Running Scripts

### Generate Traffic
Makes live API calls with timestamped prompts for tracking.

```bash
# Run all providers
python generate_traffic.py

# Run specific provider
python generate_traffic.py --provider openai
python generate_traffic.py --provider anthropic
python generate_traffic.py --provider gemini
```

### Fetch Usage
Fetches usage data from provider APIs (requires admin keys).

```bash
# All providers, last 7 days
python fetch_usage.py

# Specific provider
python fetch_usage.py --provider openai

# Custom date range
python fetch_usage.py --start 2024-12-01 --end 2024-12-10
```

### Calculate Costs
Calculates costs from local logs or CSV files.

```bash
# From local logs
python calculate_costs.py

# From CSV file
python calculate_costs.py --file output/usage.csv

# Show pricing info
python calculate_costs.py --pricing
```

## Environment Variables

```bash
# Required for traffic generation
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...  # or GEMINI_API_KEY

# Optional for usage fetching (admin keys)
OPENAI_ADMIN_KEY=sk-admin-...
ANTHROPIC_ADMIN_KEY=sk-ant-admin-...
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Provider Modules

Each provider module (`openai/`, `anthropic/`, `gemini/`) contains:

- **api.py**: Functions for `generate_traffic()` and `fetch_usage()`
- **pricing.py**: Current pricing tables and `calculate_cost()` function

### Usage in Code
```python
from openai import api as openai_api
from openai.pricing import calculate_cost, PRICING

# Generate traffic
result = openai_api.generate_traffic()

# Calculate cost
cost = calculate_cost(
    model="gpt-4o-mini",
    input_tokens=100,
    output_tokens=50
)
```

## API Requirements for Usage Fetching

| Provider | Requirement | Console URL |
|----------|-------------|-------------|
| OpenAI | Admin API key | https://platform.openai.com/settings/organization/admin-keys |
| Anthropic | Admin API key | https://console.anthropic.com/settings/admin-keys |
| Gemini | Service account | https://console.cloud.google.com |

## Pricing (Dec 2024)

### OpenAI (per 1K tokens)
| Model | Input | Output |
|-------|-------|--------|
| gpt-4o | $0.0025 | $0.01 |
| gpt-4o-mini | $0.00015 | $0.0006 |
| o1 | $0.015 | $0.06 |

### Anthropic (per 1K tokens)
| Model | Input | Output |
|-------|-------|--------|
| claude-3-5-sonnet | $0.003 | $0.015 |
| claude-3-5-haiku | $0.0008 | $0.004 |
| claude-3-opus | $0.015 | $0.075 |

### Gemini (per 1K tokens)
| Model | Input | Output |
|-------|-------|--------|
| gemini-2.0-flash | Free | Free |
| gemini-1.5-flash | $0.000075 | $0.0003 |
| gemini-1.5-pro | $0.00125 | $0.005 |
