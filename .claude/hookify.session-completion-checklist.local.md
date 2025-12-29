---
name: session-completion-checklist
enabled: true
event: stop
pattern: .*
action: block
---

# Session Completion Checklist

Before closing this session, you MUST complete ALL of the following:

## 1. Run Tests & Check Logs
- [ ] Run `npm test` (frontend) or `pytest tests/ -v` (backend)
- [ ] Check for errors in output
- [ ] Verify no failing tests

## 2. Update Requirement Specs
- [ ] Document any changes in `00-requirements-specs/`
- [ ] Update relevant feature docs if behavior changed
- [ ] Remove old/deprecated references (forward-looking only)

## 3. Document API Keys & URLs

**Local Testing:**
| Service | URL |
|---------|-----|
| Frontend | `http://localhost:3000` |
| API Service | `http://localhost:8000` |
| Pipeline Service | `http://localhost:8001` |

**Environments:**
| Env | URL |
|-----|-----|
| Stage | Cloud Run URL (dynamic) |
| Prod | `https://pipeline.cloudact.ai` (custom domain) |

**API Keys:**
| Key | Header | Purpose |
|-----|--------|---------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding (admin) |
| Org API Key | `X-API-Key` | Integrations, pipelines (per-org) |

**Get Org API Key for Testing:**
```bash
# Via Supabase REST API (service_role required)
curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/org_api_keys_secure?org_slug=eq.{ORG_SLUG}&select=api_key" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

# Example response: [{"api_key":"org_slug_api_Kq888VvuvTABjDkm"}]
```

## 4. Comprehensive Do's and Don'ts

### DO's
- Use configs/ for schema and pipeline definitions
- Validate inputs before processing
- Use API key hierarchy (CA_ROOT_API_KEY vs Org API Key)
- Encrypt credentials using KMS
- Run tests before closing session
- Check logs for errors

### DON'Ts
- NEVER use `DISABLE_AUTH=true` in production
- Never write raw SQL or use Alembic
- Never skip authentication
- Never expose CA_ROOT_API_KEY to client-side
- Never close session without running tests
- Never commit .env files or credentials

---

**Complete all items above before stopping. User expects comprehensive verification.**
