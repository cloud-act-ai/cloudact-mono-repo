# Account Setup - Requirements

## Overview

End-to-end account lifecycle testing for CloudAct using Playwright. Covers the complete user journey from signup to account deletion, ensuring all flows work without errors.

## Source Specifications

This skill consolidates account-related requirements from:
- `00-requirements-specs/01_ORGANIZATION_ONBOARDING.md` (v1.8) - Signup, org creation, API key
- `00-requirements-specs/01_USER_MANAGEMENT.md` (v2.4) - Login, roles, invite, settings
- `00-requirements-specs/01_BILLING_STRIPE.md` (v2.3) - Plans, checkout (see `/stripe-billing` skill for full billing)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Account Lifecycle                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  SIGNUP (Phase 1 - Frontend)                                 │
│  /signup → email + password + name → Supabase auth.users     │
│         → company name → org_slug = {company}_{base36_ts}    │
│         → plan selection → Stripe Checkout → payment         │
│         → webhook → Supabase organizations table             │
│                                                              │
│  ONBOARDING (Phase 2 - Backend)                              │
│  POST /api/v1/organizations/onboard (X-CA-Root-Key)          │
│  ├─ org_profiles (metadata, fiscal_year_start_month)         │
│  ├─ org_api_keys (SHA256 hashed + KMS encrypted)             │
│  ├─ org_subscriptions (plan limits from Supabase)            │
│  └─ {org_slug}_prod dataset (30+ tables)                     │
│                                                              │
│  LOGIN                                                       │
│  /login → email + password → loginWithSecurity()             │
│        → rate limit check (5/5min) → Supabase auth           │
│        → session created → redirect to /{org}/dashboard      │
│                                                              │
│  FORGOT PASSWORD                                             │
│  /forgot-password → email → API /auth/reset-password         │
│  → generateLink() → custom SMTP email → /reset-password      │
│                                                              │
│  RESET PASSWORD                                              │
│  /reset-password#access_token=... → verify session (8s)      │
│  → new password form → updateUser() → redirect to dashboard  │
│                                                              │
│  TEAM INVITE                                                 │
│  /{org}/settings/invite → email + role → 48hr token          │
│  → email sent with /invite/{token} → accept → join org       │
│                                                              │
│  ACCOUNT DELETION                                            │
│  /{org}/settings/organization → Danger Zone → Delete         │
│  → confirmation dialog → token email (30min) → account gone  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Data Storage

| Table | Location | Purpose |
|-------|----------|---------|
| `auth.users` | Supabase | Email, password hash |
| `profiles` | Supabase | Extended user data (name, avatar) |
| `organizations` | Supabase | Org metadata, billing_status, plan limits |
| `organization_members` | Supabase | User <-> Org mapping with role |
| `invites` | Supabase | Pending invitations (token + 48hr expiry) |
| `org_quotas` | Supabase | Daily/monthly usage counters |
| `security_events` | Supabase | Rate limiting records |

## Roles & Permissions

| Role | Billing | Members | Integrations | Pipelines |
|------|---------|---------|--------------|-----------|
| owner | Full | Full | Full | Full |
| collaborator | View only | View only | Full | Full |
| read_only | None | None | View only | View only |

- 1 owner per org — transfer required before leaving
- Seat limits per plan: Starter (2), Professional (6), Scale (11)

## Functional Requirements

### FR-1: Login Flow
- **FR-1.1**: Login page displays email, password fields, submit button, forgot password link, and signup link
- **FR-1.2**: Valid credentials (`demo@cloudact.ai` / `Demo1234`) redirect to `/{orgSlug}/dashboard`
- **FR-1.3**: Invalid credentials show error message and stay on login page
- **FR-1.4**: Session expired redirect (`?reason=session_expired`) shows appropriate message
- **FR-1.5**: Rate limiting enforced via `loginWithSecurity` server action (5 attempts / 5 min)

### FR-2: Forgot Password Flow
- **FR-2.1**: Forgot password page displays email field, submit button, and back to login link
- **FR-2.2**: Clicking "Forgot password?" on login page navigates to `/forgot-password`
- **FR-2.3**: Submitting email shows "Check your email" success state with:
  - Email address displayed
  - "Back to Login" button
  - "Try again" option
- **FR-2.4**: Rate limited requests show appropriate error (3 per 10 min)
- **FR-2.5**: Uses `generateLink()` + custom SMTP (not Supabase default email)

### FR-3: Reset Password Flow
- **FR-3.1**: Without valid token, shows "Verifying Link" then transitions to "Link Expired" (8s timeout)
- **FR-3.2**: Expired state shows "Request New Link" button linking to `/forgot-password`
- **FR-3.3**: With valid recovery session, shows password form with:
  - New password field (min 8 chars)
  - Confirm password field
  - Submit button
- **FR-3.4**: Password mismatch shows validation error
- **FR-3.5**: Successful reset redirects to dashboard

### FR-4: Signup Flow
- **FR-4.1**: Signup page displays Step 1 with email, password, name, phone fields
- **FR-4.2**: Password field enforces minimum 8 characters
- **FR-4.3**: Step 2 collects company/organization name
- **FR-4.4**: Link to login page available from signup
- **FR-4.5**: Org slug auto-generated: `{company_name}_{base36_timestamp}`

### FR-5: Stripe Billing / Onboarding
> For full billing requirements, see `/stripe-billing` skill.
- **FR-5.1**: Billing settings page (`/{org}/settings/billing`) shows heading
- **FR-5.2**: Current plan name (starter/professional/scale) displayed
- **FR-5.3**: Plans page (`/{org}/settings/billing/plans`) shows price elements ($19/$69/$199)
- **FR-5.4**: Onboarding billing page redirects unauthenticated users to login
- **FR-5.5**: Trial period information displayed when applicable

### FR-6: Team Invite
- **FR-6.1**: Team page (`/{org}/settings/invite`) shows members list with owner badge
- **FR-6.2**: Invite button opens dialog with email input and role selector
- **FR-6.3**: Submitting invite creates invitation or shows "already pending"
- **FR-6.4**: Token valid for 48 hours, sent via email
- **FR-6.5**: Seat usage indicator visible (current / limit)
- **FR-6.6**: Invalid invite token (`/invite/xxx`) shows error page
- **FR-6.7**: Non-existent valid-format token shows "invalid or removed" error
- **FR-6.8**: Rate limit: 10 invites per hour per org

### FR-7: Profile Settings
- **FR-7.1**: Profile page (`/{org}/settings/personal`) shows heading
- **FR-7.2**: User email displayed on profile
- **FR-7.3**: Password change option available

### FR-8: Account Deletion
- **FR-8.1**: Organization settings page (`/{org}/settings/organization`) loads
- **FR-8.2**: Danger zone tab/section with delete option exists
- **FR-8.3**: Deletion requires confirmation dialog (not immediate)
- **FR-8.4**: Cancel button dismisses confirmation dialog
- **FR-8.5**: Token-based confirmation (30min expiry), requires no owned orgs

### FR-9: Settings Navigation
- **FR-9.1**: All settings pages load without 404:
  - `/settings/personal`
  - `/settings/organization`
  - `/settings/invite`
  - `/settings/hierarchy`
  - `/settings/quota-usage`
  - `/settings/billing`

## Non-Functional Requirements

### NFR-1: Zero Console Errors
- No critical `console.error` messages on any page
- Filtered exclusions: favicon, ResizeObserver, hydration, net::ERR, 404 resources

### NFR-2: Performance
- Login redirect < 45s
- Page load < 15s (domcontentloaded)
- API responses < 10s

### NFR-3: Security
- Rate limiting enforced (login: 5/5min, forgot-password: 3/10min, invite: 10/hour)
- Email enumeration prevented (generic error messages)
- Open redirect prevention (validated redirectTo parameter)
- Deletion requires confirmation (no one-click delete)

### NFR-4: Accessibility
- Form labels present
- Keyboard navigation works
- Error messages visible and descriptive

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/login/page.tsx` | Login page with security |
| `01-fronted-system/app/forgot-password/page.tsx` | Forgot password flow |
| `01-fronted-system/app/reset-password/page.tsx` | Reset password with token verification |
| `01-fronted-system/app/signup/page.tsx` | Multi-step signup |
| `01-fronted-system/app/invite/[token]/page.tsx` | Invite acceptance |
| `01-fronted-system/app/onboarding/billing/page.tsx` | Stripe checkout onboarding |
| `01-fronted-system/actions/login.ts` | Login with security (rate limiting) |
| `01-fronted-system/actions/members.ts` | Team management + invite |
| `01-fronted-system/actions/account.ts` | Account deletion |
| `01-fronted-system/app/[orgSlug]/settings/` | All settings pages |

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Invite Target | `surasani.rama@gmail.com` |
| Org Slug | Auto-detected from login (`acme_inc_{base36_timestamp}`) |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/stripe-billing` | Full billing management (webhooks, products, prices). Account-setup tests billing UI only. |
| `/bootstrap-onboard` | Backend org onboarding (BigQuery datasets, API keys). Account-setup tests frontend flows. |
| `/user-mgmt` | User/role management operations. Account-setup tests the invite + profile UI. |
| `/security-audit` | Security audit across all services. Account-setup validates rate limiting + auth UI. |

## Dependencies

- Frontend: Next.js 16 + Supabase Auth
- Auth: Supabase (email/password)
- Billing: Stripe (checkout, portal, plans) → see `/stripe-billing`
- Email: Custom SMTP + Supabase fallback
- Rate Limiting: Supabase-backed (database, not in-memory)
- Tests: Playwright v1.57+
