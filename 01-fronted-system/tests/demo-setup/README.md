# Demo Account Setup

Automated Playwright scripts for setting up demo accounts with full cost data across all categories (GenAI, Cloud, SaaS Subscriptions).

## Quick Start

```bash
# From 01-fronted-system directory
cd 01-fronted-system

# Run demo account setup (local environment)
npx ts-node tests/demo-setup/setup-demo-account.ts

# Or use the shell script
./tests/demo-setup/run-setup.sh
```

## Default Demo Account

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Company | `Acme Inc` |
| Plan | Starter ($19/month) |

## Environment Configuration

### Environment URLs

| Environment | Frontend URL | API Service | Pipeline Service | Supabase Project |
|-------------|--------------|-------------|------------------|------------------|
| **local** | `http://localhost:3000` | `http://localhost:8000` | `http://localhost:8001` | `kwroaccbrxppfiysqlzs` |
| **stage** | `https://cloudact-stage.vercel.app` | Cloud Run | Cloud Run | `kwroaccbrxppfiysqlzs` |
| **prod** | `https://cloudact.ai` | `https://api.cloudact.ai` | `https://pipeline.cloudact.ai` | `ovfxswhkkshouhsryzaf` |

### Running for Different Environments

```bash
# Local Development (default)
TEST_BASE_URL=http://localhost:3000 \
npx ts-node tests/demo-setup/setup-demo-account.ts

# Staging
TEST_BASE_URL=https://cloudact-stage.vercel.app \
npx ts-node tests/demo-setup/setup-demo-account.ts

# Production (use with caution!)
TEST_BASE_URL=https://cloudact.ai \
npx ts-node tests/demo-setup/setup-demo-account.ts
```

### Visual Mode (Non-Headless)

```bash
# See the browser automation in action
TEST_HEADLESS=false npx ts-node tests/demo-setup/setup-demo-account.ts

# Slow motion for debugging (500ms delay between actions)
TEST_SLOW_MO=500 TEST_HEADLESS=false npx ts-node tests/demo-setup/setup-demo-account.ts
```

## Dynamic Credentials

After account creation, credentials are environment-specific:

### Getting Organization Slug

The org slug is generated from the company name with a timestamp:
- Format: `{company_name_lowercase}_{MMDDYYYY}`
- Example: `acme_inc_01012026`

```bash
# Get current org slug from the dashboard URL after login
# Pattern: /[orgSlug]/dashboard
```

### Getting API Key

After demo account setup, retrieve the API key:

```bash
# From Supabase (local/stage)
# Query: SELECT * FROM org_api_keys_secure WHERE org_slug = 'acme_inc_01012026'

# Or from the frontend after login:
# Navigate to: /{orgSlug}/settings/organization → API Keys section
```

## Claude Command: /demo-setup

Use Claude Code to set up a complete demo account:

```
/demo-setup
```

This command will:
1. Create a demo account via browser automation
2. Complete Stripe checkout (test mode)
3. Load demo data for all cost categories
4. Verify dashboard displays correct data

### Manual Steps (if needed)

If the automated command fails, follow these manual steps:

```bash
# 1. Create account via browser automation
cd 01-fronted-system
npx ts-node tests/demo-setup/setup-demo-account.ts

# 2. Complete Stripe checkout with test card
#    Card: 4242 4242 4242 4242
#    Expiry: Any future date
#    CVC: Any 3 digits

# 3. Load demo data (requires API key)
cd ../04-inra-cicd-automation/load-demo-data
./scripts/01-load-genai-data.sh {org_slug} {api_key}
./scripts/02-load-cloud-data.sh {org_slug} {api_key}
./scripts/03-load-subscription-data.sh {org_slug} {api_key}

# 4. Run cost calculations
./scripts/04-run-cost-calculations.sh {org_slug} {api_key}
```

## Custom Configuration

Override default values with command-line arguments:

```bash
npx ts-node tests/demo-setup/setup-demo-account.ts \
  --email=custom@example.com \
  --company="My Custom Company" \
  --plan=professional
```

### Available Options

| Option | Description | Default |
|--------|-------------|---------|
| `--email` | Account email | `john@example.com` |
| `--password` | Account password | `acme1234` |
| `--phone` | Phone number | `5551234567` |
| `--company` | Company name | `Acme Inc` |
| `--companyType` | Personal/Startup/Agency/Company/Educational | `Company` |
| `--currency` | Currency code | `$ USD` |
| `--timezone` | Timezone | `PST/PDT - Los Angeles, USA` |
| `--plan` | starter/professional/scale | `starter` |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_BASE_URL` | Frontend URL | `http://localhost:3000` |
| `TEST_HEADLESS` | Run headless | `true` |
| `TEST_SLOW_MO` | Slow down (ms) | `0` |
| `API_SERVICE_URL` | API service URL | `http://localhost:8000` |
| `PIPELINE_SERVICE_URL` | Pipeline service URL | `http://localhost:8001` |

## Demo Data Summary

After full setup, the demo account includes:

| Category | Records | Total Cost (Dec 2025) | Providers |
|----------|---------|----------------------|-----------|
| **GenAI** | ~4,000 | ~$4,900 | OpenAI, Anthropic, Google Gemini |
| **Cloud** | ~12,000 | ~$143,000/month | AWS, Azure, GCP, OCI |
| **Subscription** | ~5,500 | ~$6,300 | Slack, GitHub, Notion, etc. |

## Verification Commands

After setup, verify the data via API:

```bash
# Set your credentials (get from dashboard or Supabase)
export ORG_SLUG="acme_inc_01012026"  # Replace with actual slug
export API_KEY="your_api_key_here"   # Replace with actual key

# Verify GenAI costs
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/genai?start_date=2025-12-01&end_date=2025-12-31" \
  -H "X-API-Key: ${API_KEY}" | python3 -m json.tool

# Verify Cloud costs
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/cloud?start_date=2025-12-01&end_date=2025-12-31" \
  -H "X-API-Key: ${API_KEY}" | python3 -m json.tool

# Verify Subscription costs
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/subscription?start_date=2025-12-01&end_date=2025-12-31" \
  -H "X-API-Key: ${API_KEY}" | python3 -m json.tool
```

## Prerequisites

1. **Services Running:**
   - Frontend: `npm run dev` (port 3000)
   - API Service: `python -m uvicorn src.app.main:app --port 8000`
   - Pipeline Service: `python -m uvicorn src.app.main:app --port 8001`

2. **Supabase Configuration:**
   - Email confirmation: **DISABLED** (required for immediate sign-in)
   - Project: `kwroaccbrxppfiysqlzs` (local/stage) or `ovfxswhkkshouhsryzaf` (prod)

3. **Stripe Test Mode:**
   - Test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC

## Flow

```
1. /signup                    → Create account (email, password, phone)
2. /signup (step 2)           → Organization details (company, type, currency, timezone)
3. /onboarding/billing        → Select plan (Starter/Professional/Scale)
4. Stripe Checkout            → Complete payment (test card)
5. /onboarding/success        → Backend onboarding triggered
6. /{orgSlug}/dashboard       → Demo account ready
```

## Cleanup

To delete a demo account and start fresh:

```bash
# Use the cleanup-supabase Claude command
/cleanup-supabase local   # For local/stage environment
/cleanup-supabase prod    # For production (requires confirmation)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Signup 400 error | Disable email confirmation in Supabase Auth settings |
| Account already exists | Use `/cleanup-supabase` or use different email |
| Stripe checkout hangs | Verify Stripe test keys are configured |
| API returns 401 | Check API key is valid and not expired |
| Dashboard shows $0 | Select custom date range (Dec 2025) or run cost calculations |
| Frontend loading forever | Restart frontend (`npm run dev`) |

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Demo account configuration and test settings |
| `setup-demo-account.ts` | Main Playwright automation script |
| `setup-demo-account.test.ts` | Vitest wrapper for CI integration |
| `run-setup.sh` | Shell script wrapper |
| `README.md` | This documentation |

## Screenshots

On failure, screenshots are saved to:
```
tests/demo-setup/error-screenshot-{timestamp}.png
```

---
**Last Updated:** 2026-01-01
