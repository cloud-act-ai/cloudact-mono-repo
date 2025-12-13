# LLM Cost Usage Testing

Pre-analysis utilities for testing and tracking LLM API usage and costs across OpenAI, Anthropic, and Gemini.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Add your API keys to .env

# 3. Generate traffic (makes live API calls)
python generate_traffic.py

# 4. Calculate costs
python calculate_costs.py
```

## Scripts

| Script | Purpose |
|--------|---------|
| `generate_traffic.py` | Make test API calls to all providers |
| `fetch_usage.py` | Fetch usage data from provider APIs |
| `calculate_costs.py` | Calculate costs from usage data |

## Where to Check Usage & Costs

### OpenAI

| Resource | URL |
|----------|-----|
| **Usage Dashboard** | https://platform.openai.com/usage |
| **Billing Overview** | https://platform.openai.com/settings/organization/billing/overview |
| **API Keys** | https://platform.openai.com/api-keys |
| **Admin Keys** (for usage API) | https://platform.openai.com/settings/organization/admin-keys |
| **Pricing Page** | https://openai.com/pricing |

### Anthropic

| Resource | URL |
|----------|-----|
| **Usage Dashboard** | https://console.anthropic.com/settings/usage |
| **Billing** | https://console.anthropic.com/settings/billing |
| **API Keys** | https://console.anthropic.com/settings/keys |
| **Admin Keys** (for usage API) | https://console.anthropic.com/settings/admin-keys |
| **Pricing Page** | https://www.anthropic.com/pricing |

### Gemini (Google AI)

| Resource | URL |
|----------|-----|
| **AI Studio Dashboard** | https://aistudio.google.com |
| **API Keys** | https://aistudio.google.com/app/apikey |
| **Cloud Console Metrics** | https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics |
| **Pricing Page** | https://ai.google.dev/pricing |

## Environment Variables

```bash
# Required for traffic generation
OPENAI_API_KEY=sk-proj-...        # OpenAI API key
ANTHROPIC_API_KEY=sk-ant-api03-...  # Anthropic API key
GOOGLE_API_KEY=AIza...             # Gemini AI Studio key

# Optional for usage API access
OPENAI_ADMIN_KEY=sk-admin-...      # OpenAI admin key
ANTHROPIC_ADMIN_KEY=sk-ant-admin-... # Anthropic admin key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json  # GCP service account
```

## Current Pricing (Dec 2024)

### OpenAI (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| o1 | $15.00 | $60.00 |
| o1-mini | $3.00 | $12.00 |

### Anthropic (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| claude-3-5-sonnet | $3.00 | $15.00 |
| claude-3-5-haiku | $0.80 | $4.00 |
| claude-3-opus | $15.00 | $75.00 |
| claude-3-haiku | $0.25 | $1.25 |

### Gemini (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| gemini-2.0-flash | Free | Free |
| gemini-1.5-flash | $0.075 | $0.30 |
| gemini-1.5-pro | $1.25 | $5.00 |

## Debugging Tips

### Verify API Keys Work

```bash
# Test each provider individually
python generate_traffic.py --provider openai
python generate_traffic.py --provider anthropic
python generate_traffic.py --provider gemini
```

### Check Local Usage Logs

```bash
# View logged usage events
cat output/usage_events.jsonl | python -m json.tool

# Calculate costs from logs
python calculate_costs.py
```

### Compare with Provider Dashboards

After running `generate_traffic.py`, wait a few minutes and check:
1. OpenAI: https://platform.openai.com/usage
2. Anthropic: https://console.anthropic.com/settings/usage
3. Gemini: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics

The usage should match your local logs (stored in `output/usage_events.jsonl`).

## File Structure

```
ZZ-PRE-ANALLISYS/
├── generate_traffic.py     # Main: generate API traffic
├── fetch_usage.py          # Main: fetch from provider APIs
├── calculate_costs.py      # Main: calculate costs
├── openai/                 # OpenAI module
│   ├── api.py              # API calls
│   └── pricing.py          # Pricing tables
├── anthropic/              # Anthropic module
│   ├── api.py              # API calls
│   └── pricing.py          # Pricing tables
├── gemini/                 # Gemini module
│   ├── api.py              # API calls
│   └── pricing.py          # Pricing tables
├── utils/
│   └── usage_store.py      # Local logging
├── output/                 # Generated reports
├── .env                    # Your API keys (git-ignored)
└── .env.example            # Template
```
