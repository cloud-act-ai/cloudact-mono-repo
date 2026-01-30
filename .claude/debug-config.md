# Debug Configuration

**Shared configuration for all skills and commands.**

## Default Test Account

Use these credentials for local development, testing, and debugging:

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| First Name | `John` |
| Last Name | `Doe` |
| Company | `Acme Inc` |
| Org Slug Pattern | `acme_inc_{timestamp}` (base36) |
| Org Slug | **Query from DB** (see below) |
| Plan | `scale` (14-day free trial) |
| Timezone | `PST/PDT - Los Angeles, USA` |
| Currency | `USD` |

## Get Actual Org Slug

The org slug is created during onboarding with a base36 timestamp suffix. **Always query the database** to get the actual value:

```bash
# Get the latest org slug from Supabase
source .env.local
ORG_SLUG=$(curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=org_slug&order=created_at.desc&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['org_slug'])")
echo "Org Slug: $ORG_SLUG"
```

## Quick Login Test

```bash
# First get the actual org slug from database
source .env.local
ORG_SLUG=$(curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=org_slug&order=created_at.desc&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['org_slug'])")

echo "Using Org Slug: $ORG_SLUG"

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
Email: demo@cloudact.ai
Password: demo1234
Org Slug: # Query from Supabase (see "Get Actual Org Slug" above)
```

To get the org slug dynamically in any skill:
```bash
source .env.local && ORG_SLUG=$(curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=org_slug&order=created_at.desc&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['org_slug'])")
```

If login fails, create a new account via `/signup` with these details. The org slug will be auto-generated based on the creation date.
