# Debug Configuration

**Shared configuration for all skills and commands.**

## Default Test Account

Use these credentials for local development, testing, and debugging:

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| First Name | `John` |
| Last Name | `Doe` |
| Company | `Acme Inc` |
| Org Slug Pattern | `acme_inc_{MMDDYYYY}` |
| Org Slug | **Dynamic** - `acme_inc_$(date +%m%d%Y)` |
| Plan | `scale` (14-day free trial) |
| Timezone | `PST/PDT - Los Angeles, USA` |
| Currency | `USD` |

## Org Slug Format

The org slug follows the pattern: `acme_inc_{MMDDYYYY}` where:
- `MMDDYYYY` is the date when the account was created (today's date for new accounts)
- Get today's org slug: `acme_inc_$(date +%m%d%Y)`

## Quick Login Test

```bash
# Get today's org slug
ORG_SLUG="acme_inc_$(date +%m%d%Y)"
echo "Org Slug: $ORG_SLUG"

# Test login via Playwright
npx playwright test -g "login" --headed

# Or use curl to test API with org slug
curl -s "http://localhost:8000/api/v1/organizations/$ORG_SLUG/info" \
  -H "X-API-Key: $(cat .api-key-cache)"
```

## Service URLs

| Service | Local URL | Health Check |
|---------|-----------|--------------|
| Frontend | http://localhost:3000 | `curl http://localhost:3000` |
| API Service | http://localhost:8000 | `curl http://localhost:8000/health` |
| Pipeline Service | http://localhost:8001 | `curl http://localhost:8001/health` |

## Key Dashboard Pages

| Page | URL |
|------|-----|
| Dashboard | `/{orgSlug}/dashboard` |
| Cost Overview | `/{orgSlug}/cost-dashboards/overview` |
| GenAI Costs | `/{orgSlug}/cost-dashboards/genai-costs` |
| Cloud Costs | `/{orgSlug}/cost-dashboards/cloud-costs` |
| Subscription Costs | `/{orgSlug}/cost-dashboards/subscription-costs` |
| Integrations | `/{orgSlug}/integrations` |
| Pipelines | `/{orgSlug}/pipelines` |
| Settings | `/{orgSlug}/settings/organization` |

## Usage in Skills

When a skill needs to debug or test pages, use:
```bash
Email: john@example.com
Password: acme1234
Org Slug: acme_inc_$(date +%m%d%Y)  # Dynamic - today's date
```

If login fails, create a new account via `/signup` with these details. The org slug will be auto-generated based on the current date.
