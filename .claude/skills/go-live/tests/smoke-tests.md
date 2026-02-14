# Smoke Tests (10 Minutes)

Quick validation after every production deploy. Run these before declaring success.

## Infrastructure (2 min)

| # | Test | Command | Expected |
|---|------|---------|----------|
| 1 | Frontend health | `curl -s https://cloudact.ai/health` | 200 + healthy |
| 2 | API health | `curl -s https://api.cloudact.ai/health` | 200 + healthy |
| 3 | Pipeline health | `curl -s https://pipeline.cloudact.ai/health` | 200 + healthy |
| 4 | Chat health | `curl -s https://chat.cloudact.ai/health` | 200 + healthy |
| 5 | Version check | Parse health JSON | Matches git tag |
| 6 | OpenAPI docs | `curl -s https://api.cloudact.ai/openapi.json` | 200 |

```bash
# Run all health checks
for svc in cloudact.ai api.cloudact.ai pipeline.cloudact.ai chat.cloudact.ai; do
  echo -n "$svc: "
  curl -s -w ' [%{http_code}]' "https://$svc/health"
  echo
done
```

## Auth Flows (3 min)

| # | Test | Action | Expected |
|---|------|--------|----------|
| 7 | Login page | Visit /login | Form renders |
| 8 | Invalid login | Wrong credentials | Error message |
| 9 | Valid login | demo@cloudact.ai / Demo1234 | Redirects to dashboard |
| 10 | Signup page | Visit /signup | Form renders |
| 11 | Forgot password | Visit /forgot-password | Form renders |
| 12 | Logout | Click logout | Redirects to /login |

## Dashboard (2 min)

| # | Test | Action | Expected |
|---|------|--------|----------|
| 13 | Dashboard loads | Visit /{org}/dashboard | Page renders |
| 14 | Cost summary | Check widget | Shows dollar amounts |
| 15 | Trend chart | Check widget | Chart renders |
| 16 | Date filter | Change range | Data updates |

## Core Pages (2 min)

| # | Test | Action | Expected |
|---|------|--------|----------|
| 17 | Cloud costs | Visit /{org}/cloud-costs | Page loads |
| 18 | GenAI costs | Visit /{org}/genai-costs | Page loads |
| 19 | Integrations | Visit /{org}/integrations | Provider list |
| 20 | Settings | Visit /{org}/settings | Org config |
| 21 | Billing | Visit /{org}/settings/billing | Plan info |

## API Quick Check (1 min)

```bash
# Test API with org key
curl -s -H "X-API-Key: $ORG_API_KEY" \
  "https://api.cloudact.ai/api/v1/organizations/$ORG_SLUG/quota" \
  -w '\n%{http_code}'
# Expected: 200 + quota JSON

# Test bootstrap (root key)
curl -s -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  "https://api.cloudact.ai/api/v1/admin/bootstrap" \
  -w '\n%{http_code}'
# Expected: 200
```

## Pass Criteria

- All 4 health endpoints return 200
- Login/logout flow works
- Dashboard renders with data
- No 500 errors in logs
- Version matches deployed tag

## If Any Fail

1. Check Cloud Run logs: `./monitor/watch-all.sh prod 50`
2. If service is down: follow [rollback.md](../checklist/rollback.md)
3. If feature broken: log issue, decide hotfix vs rollback
