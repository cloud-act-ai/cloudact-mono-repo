# Bootstrap & Onboard - Requirements

## Overview

Customer onboarding workflow for CloudAct covering account creation, Stripe checkout, auto-provisioning (Supabase + BigQuery), configuration, subscription setup, and team management.

## Source Specification

`00-requirements-specs/cloudactinc_customer_onboarding.md` (2026-02-05)

---

## Functional Requirements

### FR-ONBOARD-01: Onboarding Workflow

```
1. Login check -> Try existing credentials first
2. Signup (if needed) -> Email + Password + Company info + Plan selection
3. Stripe Checkout -> Payment -> Auto-provision (Supabase + BigQuery)
4. Configure fiscal year -> Calendar year (Jan 1)
5. Add subscriptions -> SaaS subscriptions (e.g., ChatGPT Plus)
6. Invite team -> Team members with roles
7. Verify -> Dashboard, billing, team all functional
```

### FR-ONBOARD-02: Signup Flow

1. Navigate to `/signup`
2. Fill: email, password, phone, organization name
3. Settings: timezone, currency (`USD`), fiscal year start month
4. Select plan (Starter/Professional/Scale)
5. Complete Stripe Checkout
6. Auto-setup triggers: Supabase auth + Stripe subscription + BigQuery dataset + API key generation

### FR-ONBOARD-03: Auto-Provisioning

On successful Stripe checkout, the system automatically:
- Creates Supabase auth user
- Creates Stripe subscription record
- Provisions BigQuery dataset (`{org_slug}_prod`)
- Generates org API key (format: `{org_slug}_api_{random_16_chars}`)

### FR-ONBOARD-04: Fiscal Year Configuration

Settings -> Organization -> Fiscal Year. Default: January start (calendar year).

### FR-ONBOARD-05: Subscription Management

Add SaaS subscriptions with:
- Provider (e.g., OpenAI)
- Plan name (e.g., ChatGPT Plus)
- Monthly cost
- Billing frequency (monthly/annual)
- Start date
- Status (ongoing/ended)

### FR-ONBOARD-06: Team Invitation

Settings -> Members -> Invite with:
- Email address
- Role (Admin/Collaborator/Read-Only)
- 48-hour token expiry for invite links

### FR-ONBOARD-07: Org Slug Generation

Org slug is dynamically generated as `{company_name}_{base36_timestamp}` at signup time. Example: `acme_inc_ml01ua8p`.

---

## Non-Functional Requirements

### NFR-ONBOARD-01: Verification Checklist

After onboarding, all of the following must be verified:

| Check | Expected |
|-------|----------|
| Login works | Dashboard loads without errors |
| Org name | Correct organization name in header |
| Timezone | Configured timezone displayed |
| Currency | Configured currency (USD) |
| Stripe subscription | Selected plan active with correct price |
| SaaS subscriptions | Added subscriptions visible |
| Team invites | Sent to specified email addresses |

### NFR-ONBOARD-02: Environment URLs

| Environment | URL |
|-------------|-----|
| Production | https://cloudact.ai |
| API Docs | https://api.cloudact.ai/docs |
| Local | http://localhost:3000 |

### NFR-ONBOARD-03: Plan Options

| Plan | Price | Seats | Providers |
|------|-------|-------|-----------|
| Starter | $19/month | 2 | 3 |
| Professional | $69/month | 6 | 6 |
| Scale | $199/month | 11 | 10 |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Signup 400 error | Supabase email confirmation enabled | Disable in Supabase Auth settings |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run secrets setup script |
| Login fails after signup | Session not established | Clear cookies, try incognito |
| Subscription not saving | Missing org dataset | Check API Service logs |
| Invite email missing | Email delivery issue | Check spam, verify address, resend |

---

## Post-Onboarding Steps

1. Set up cloud integrations (GCP, AWS, Azure)
2. Configure hierarchy (Departments -> Projects -> Teams)
3. Add more SaaS subscriptions
4. Run first billing pipeline
5. Invite additional team members
