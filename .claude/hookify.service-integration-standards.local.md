---
name: service-integration-standards
enabled: true
event: all
pattern: .*
action: warn
---

# Service Integration Standards - Pre-Hook Reminder

## MANDATORY: Use Parallel Agents for EVERY Task

**ALWAYS use parallel agents whenever possible** - not just for multi-service changes!

### Why Parallel Agents?
- Faster execution (concurrent exploration/changes)
- Better context gathering
- Reduced back-and-forth
- Maximum efficiency

### When to Use (EVERY prompt where applicable):
```
Single message with MULTIPLE Task tool calls:

Exploring:
- Agent 1: Search for patterns in one area
- Agent 2: Search for related code in another
- Agent 3: Check test files

Implementing:
- Agent 1: Frontend changes
- Agent 2: API Service changes
- Agent 3: Pipeline Service changes

Debugging:
- Agent 1: Check logs
- Agent 2: Read error handlers
- Agent 3: Review recent changes
```

### Rule: If you can split work → USE PARALLEL AGENTS

---

## Three-Service Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Supabase Auth             ├─ Bootstrap                 ├─ Run pipelines
├─ Stripe Payments           ├─ Org onboarding            ├─ Process usage data
└─ Dashboard UI              ├─ Integration setup         └─ Scheduled jobs
                             └─ SaaS subscription plans
```

**CRITICAL**: Changes to one service often require updates to others!

---

## Supabase Best Practices

### DO's
- Use Supabase client from `@/lib/supabase/client` or `server`
- Always check `session` before API calls
- Use RLS policies for data access control
- Handle auth state changes properly
- Use `supabase.auth.getUser()` for server-side auth

### DON'Ts
- Never expose service_role key to client
- Never bypass RLS in application code
- Never store sensitive data in localStorage
- Never trust client-side auth alone - verify server-side

### Auth Flow
```typescript
// Server-side (actions/)
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) throw new Error('Unauthorized')
```

---

## Frontend Mobile-Friendliness (CRITICAL)

### MUST DO for Every Frontend Change
- [ ] Test on mobile viewport (375px width)
- [ ] Use responsive Tailwind classes (`sm:`, `md:`, `lg:`)
- [ ] Touch targets minimum 44x44px
- [ ] No horizontal scroll on mobile
- [ ] Tables must be scrollable or stack on mobile

### Responsive Patterns
```tsx
// Use responsive classes
<div className="flex flex-col md:flex-row">
<div className="w-full md:w-1/2">
<div className="text-sm md:text-base">
<div className="p-4 md:p-6 lg:p-8">

// Hide/show based on screen
<div className="hidden md:block">   // Desktop only
<div className="block md:hidden">   // Mobile only
```

### Mobile-First Components
- Sidebar: Collapsible on mobile
- Tables: Horizontal scroll or card view
- Forms: Full-width inputs on mobile
- Modals: Full-screen on small devices
- Navigation: Hamburger menu on mobile

---

## BigQuery Best Practices

### DO's
- Use configs/ for ALL schema definitions
- Use parameterized queries (prevent SQL injection)
- Partition tables by date for cost efficiency
- Use `{org_slug}_{env}` dataset naming
- Always scope queries to organization

### DON'Ts
- NEVER write raw SQL - use processors
- NEVER use Alembic migrations
- NEVER query across org datasets without scope
- NEVER hardcode project IDs

### Schema Changes
```
1. Update configs/setup/bootstrap/schemas/*.json (API service)
2. Update configs/{provider}/{domain}/*.yml (Pipeline service)
3. Run bootstrap to apply changes
4. Test with both services
```

---

## Pipeline Service (8001) Best Practices

### DO's
- Define pipelines in `configs/{provider}/{domain}/*.yml`
- Use base processors from `src/core/processors/`
- Validate org scope before processing
- Use async execution (return run_id immediately)
- Encrypt credentials with KMS

### DON'Ts
- Never bypass scope_enforcement middleware
- Never process without org validation
- Never store credentials unencrypted
- Never skip quota checks

### Endpoint Pattern
```
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
Header: X-API-Key: {org_api_key}
```

---

## API Service (8000) Best Practices

### DO's
- Use CA_ROOT_API_KEY for admin operations only
- Generate org-specific API keys for integrations
- Validate all inputs before BigQuery operations
- Use proper HTTP status codes
- Log all admin operations

### DON'Ts
- NEVER use DISABLE_AUTH=true
- NEVER expose CA_ROOT_API_KEY to clients
- NEVER skip input validation
- NEVER return raw BigQuery errors to client

### Key Endpoints
```
POST /api/v1/admin/bootstrap          # X-CA-Root-Key
POST /api/v1/organizations/onboard    # X-CA-Root-Key
POST /api/v1/integrations/{org}/...   # X-API-Key
GET  /api/v1/subscriptions/{org}/...  # X-API-Key
```

---

## Cross-Service Integration Checklist

When making changes, verify:

### Frontend → API Service
- [ ] Server actions use correct port (8000)
- [ ] Auth token passed in headers
- [ ] Error handling for API failures
- [ ] Types match API response schema
- [ ] **MOBILE-FRIENDLY**: Responsive design verified

### Frontend → Pipeline Service
- [ ] Pipeline runs use port 8001
- [ ] Org API key used (not root key)
- [ ] Async handling (poll for status)

### API Service → BigQuery
- [ ] Schema defined in configs/
- [ ] Org scope enforced
- [ ] Parameterized queries used

### Pipeline Service → BigQuery
- [ ] Pipeline config in YAML
- [ ] Processor handles transform
- [ ] Results written to org dataset

---

## Quick Reference

| Service | Port | Auth Header | Purpose |
|---------|------|-------------|---------|
| Frontend | 3000 | Supabase session | UI + Server Actions |
| API | 8000 | X-CA-Root-Key / X-API-Key | Bootstrap, Orgs, Integrations |
| Pipeline | 8001 | X-API-Key | Run pipelines, Process data |

---

**ALWAYS: Use parallel agents for EVERY task possible! Split work → Launch multiple agents in ONE message.**
