# Feature Test Matrix

Comprehensive feature validation for major releases. 300+ tests across 20 categories.

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Landing Pages | 26 | Home, Pricing, Features, About, Docs, Privacy, Terms |
| Auth - Signup | 25 | Form, validation, Supabase, BigQuery, Stripe, email |
| Auth - Signin | 10 | Form, OAuth, redirect, rate limit |
| Auth - Password | 9 | Forgot, reset, token expiry |
| Auth - Session | 6 | JWT, refresh, logout, timeout |
| Console - Onboarding | 7 | Welcome, checklist, guided setup |
| Console - Dashboard | 12 | Widgets, charts, filters, states |
| Console - Cloud Costs | 10 | GCP/AWS/Azure/OCI tabs, export |
| Console - GenAI Costs | 10 | Provider tabs, token chart, model table |
| Console - Subscription | 9 | CRUD, pagination, per-user calc |
| Console - Unified Costs | 8 | FOCUS 1.3, all filters, MoM/YoY |
| Console - Hierarchy | 13 | Tree, CRUD, move, cost alloc, sync |
| Console - Integrations | 18 | All providers, validate, encrypt |
| Console - Budgets | 18 | CRUD, allocation wizard, variance, filters |
| Console - Alerts | 20 | CRUD, test, email/Slack, templates, budget alerts |
| Console - Notifications | 10 | Channels, rules, history |
| Console - Settings | 22 | Profile, org, API keys, team |
| Console - Billing | 25 | Plan, payment, invoices, webhooks |
| Console - Quota/UI | 17 | Usage display, warnings, dark mode |
| Pipelines | 9 | Run, status, retry, circuit breaker |
| API | 10 | Health, bootstrap, CORS, rate limit |
| Security | 12 | JWT, API keys, multi-tenant, XSS, HTTPS |
| Delete Flows | 16 | User delete, org delete, cascade |
| **TOTAL** | **~322** | |

## Landing Pages (26 tests)

| Page | Component | Expected | Priority |
|------|-----------|----------|----------|
| Home | Hero | Renders | P0 |
| Home | Features Grid | 6 features | P0 |
| Home | Stats | Metrics | P1 |
| Home | Enterprise Stats | Component | P1 |
| Home | Key Capabilities | Component | P1 |
| Home | Product Screenshots | Component | P1 |
| Home | CTA | Redirects to signup | P0 |
| Pricing | Plan Cards | 4 plans | P0 |
| Pricing | Toggle | Monthly/annual price | P0 |
| Pricing | Comparison | Table renders | P1 |
| Pricing | Checkout | Opens Stripe | P0 |
| Features | List | All features | P1 |
| About | Content | Renders | P2 |
| Contact | Form | Submits | P1 |
| Privacy | Content | Renders | P1 |
| Terms | Content | Renders | P1 |
| Blog | List | Posts show | P2 |
| Docs | Content | Renders | P1 |
| Docs | Quick Start | Guide | P1 |
| Docs | API Reference | OpenAPI | P0 |
| Resources | Guides | Articles | P2 |
| Resources | Videos | Tutorials | P2 |
| Compliance | Content | SOC2/GDPR | P1 |
| Security | Content | Practices | P1 |
| 404 Page | Error | Shows 404 | P1 |
| 500 Page | Error | Shows 500 | P2 |

## Auth - Signup (25 tests)

| Component | Expected | Priority |
|-----------|----------|----------|
| Form displays | GET /signup renders | P0 |
| Email validation | Invalid = error | P0 |
| Password strength | Weak = warning | P0 |
| Password requirements | Rules displayed | P0 |
| Company name | Required field | P0 |
| Submit | Creates account | P0 |
| Supabase user | User created | P0 |
| Org profile | org_profiles row | P0 |
| Org slug | company_{timestamp} | P0 |
| API key | org_api_keys created | P0 |
| Subscription | org_subscriptions created | P0 |
| Usage quota | org_usage_quotas created | P0 |
| BigQuery dataset | {org}_prod created | P0 |
| Demo data seed | Sample costs | P1 |
| Demo hierarchy | Sample tree | P1 |
| Demo integrations | Sample providers | P1 |
| Demo alerts | Sample alerts | P1 |
| Email verify | Link sent | P0 |
| Verify template | Branded email | P1 |
| Duplicate | Error for existing | P0 |
| OAuth Google | Redirects | P1 |
| OAuth GitHub | Redirects | P1 |
| Terms checkbox | Required | P0 |
| Stripe customer | customer_id created | P0 |
| Welcome email | Onboarding email | P1 |

## Auth - Signin (10 tests)

| Component | Expected | Priority |
|-----------|----------|----------|
| Form displays | GET /login | P0 |
| Valid creds | Success redirect | P0 |
| Invalid creds | Error message | P0 |
| Remember me | Session persists | P1 |
| OAuth Google | Works | P1 |
| OAuth GitHub | Works | P1 |
| Redirect | To dashboard | P0 |
| Rate limit | 5 fails = locked | P1 |
| MFA | TOTP required | P2 |
| Last login | Timestamp updated | P2 |

## Console - Dashboard (12 tests)

| Widget | Expected | Priority |
|--------|----------|----------|
| Overview | Renders | P0 |
| Cost summary | Total shows | P0 |
| Trend chart | 30-day line | P0 |
| Top providers | Breakdown | P0 |
| Activity | Last 10 events | P1 |
| Quick actions | Buttons work | P1 |
| Date range | Filter updates | P0 |
| Refresh | Reloads data | P1 |
| Loading | Skeleton shows | P1 |
| Error state | Message shows | P1 |
| Empty state | No data message | P1 |
| Currency | Locale formatted | P0 |

## Console - Cost Pages (30 tests)

### Cloud Costs (10)

| Component | Expected | Priority |
|-----------|----------|----------|
| Overview | Summary renders | P0 |
| GCP tab | GCP data | P0 |
| AWS tab | AWS data | P0 |
| Azure tab | Azure data | P0 |
| OCI tab | OCI data | P0 |
| Service table | Breakdown | P0 |
| Export CSV | Downloads | P1 |
| Export PDF | Downloads | P2 |
| Empty state | Message | P1 |
| Caching | 5min TTL | P1 |

### GenAI Costs (10)

| Component | Expected | Priority |
|-----------|----------|----------|
| Overview | Summary | P0 |
| OpenAI tab | Data | P0 |
| Anthropic tab | Data | P0 |
| Gemini tab | Data | P0 |
| Bedrock tab | Data | P0 |
| Vertex tab | Data | P0 |
| Token chart | Usage graph | P0 |
| Model table | Breakdown | P0 |
| Cost/token | Rate calc | P1 |
| Empty state | Message | P1 |

### Budgets (18)

| Component | Expected | Priority |
|-----------|----------|----------|
| Budget page loads | Visit /{org}/budgets renders | P0 |
| Budget list | All budgets show | P0 |
| Create single budget | Dialog + submit | P0 |
| Edit budget | Update amount/period | P0 |
| Delete budget | Soft delete (is_active=false) | P0 |
| Cascade delete | Children deactivated when parent deleted | P0 |
| Top-down allocation wizard | 3-step flow renders | P0 |
| Allocation Step 1 | Parent entity + amount | P0 |
| Allocation Step 2 | Children auto-populate, % inputs | P0 |
| Allocation Step 3 | Review summary, submit | P0 |
| Equal split button | Distributes evenly | P1 |
| Allocation progress bar | Shows % allocated | P1 |
| Allocation tree tab | Tree renders parent→children | P0 |
| Variance view | Budget vs actual, utilization % | P0 |
| Category filter | Filters by cloud/genai/saas | P0 |
| Period filter | Filters by monthly/quarterly/yearly | P0 |
| Hierarchy filter | Filters by entity | P0 |
| Empty state | No budgets message | P1 |

### Subscription Costs (9) + Unified Costs (8)

| Component | Expected | Priority |
|-----------|----------|----------|
| Subscription list | All SaaS | P0 |
| Add/Edit/Delete | CRUD works | P0 |
| Per user calc | Shows | P1 |
| Unified FOCUS 1.3 | All costs | P0 |
| Type filter | Filters | P0 |
| Provider filter | Filters | P0 |
| Hierarchy filter | Filters | P0 |
| Date range | Updates | P0 |
| MoM/YoY comparison | Toggle | P1 |

## Security (12 tests)

| Check | Expected | Priority |
|-------|----------|----------|
| JWT validate | Middleware works | P0 |
| API key validate | Header check | P0 |
| Root key validate | Header check | P0 |
| Multi-tenant isolation | org_slug filter | P0 |
| KMS encryption | AES-256 | P0 |
| XSS prevention | HTML escaped | P0 |
| SQL injection | Params bound | P0 |
| HTTPS | TLS 1.3 forced | P0 |
| CSP header | Set | P1 |
| HSTS header | Set | P1 |
| Audit log | All ops logged | P1 |
| Scope enforce | Validated | P0 |

## Delete Flows (16 tests)

| Flow | Expected | Priority |
|------|----------|----------|
| Delete user | Supabase removed | P0 |
| User data cascade | BigQuery cleaned | P0 |
| Delete org | All systems | P0 |
| Org - Supabase | user_organizations | P0 |
| Org - BigQuery | {org}_prod dropped | P0 |
| Org - Meta | org_profiles deleted | P0 |
| Org - Keys | org_api_keys deleted | P0 |
| Org - Subs | org_subscriptions | P0 |
| Org - Quotas | org_usage_quotas | P0 |
| Org - Creds | Credentials deleted | P0 |
| Org - Hierarchy | org_hierarchy | P0 |
| Org - Alerts | Alerts deleted | P0 |
| Org - Stripe | Subscription cancelled | P0 |
| Org - Confirm | Type org name modal | P0 |
| Org - Email | Confirmation sent | P1 |
| Grace period | 30-day soft delete | P1 |

## Email Templates (15 tests)

| Template | Trigger | Priority |
|----------|---------|----------|
| Welcome | Signup | P0 |
| Verify Email | Signup | P0 |
| Password Reset | Forgot | P0 |
| Password Changed | Reset | P1 |
| Invite User | Team invite | P0 |
| Invite Accepted | Accept | P1 |
| Alert Triggered | Cost alert | P0 |
| Payment Success | Stripe | P1 |
| Payment Failed | Stripe | P0 |
| Subscription Upgraded | Stripe | P1 |
| Subscription Cancelled | Stripe | P1 |
| Account Deleted | Delete | P1 |
| Org Deleted | Delete | P1 |
| Quota Warning | 90% | P0 |
| Quota Exceeded | 100% | P0 |

## How to Run

- **P0 tests**: Must pass before go-live (~120 tests)
- **P1 tests**: Should pass, acceptable to defer (~130 tests)
- **P2 tests**: Nice to have (~50 tests)

Use `/account-setup` skill for automated Playwright testing of auth flows.
Use `/demo-setup` skill to create test account with data.
