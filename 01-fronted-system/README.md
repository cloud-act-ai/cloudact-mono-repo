# CloudAct.ai - GenAI & Cloud Cost Management Platform

*Production-ready SaaS platform for tracking and optimizing GenAI and cloud infrastructure costs*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/surasanirama-5413s-projects/v0-dev-style-app-console)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/ui5EnLFmRAD)
[![SOC 2 Type II](https://img.shields.io/badge/SOC%202-Type%20II%20Certified-green?style=for-the-badge)](/)
[![GDPR](https://img.shields.io/badge/GDPR-Compliant-blue?style=for-the-badge)](/)
[![Stripe](https://img.shields.io/badge/Payments-Stripe-purple?style=for-the-badge&logo=stripe)](https://stripe.com)

## Overview

CloudAct.ai is an enterprise-grade platform that helps companies track, analyze, and optimize their GenAI costs (OpenAI, Anthropic, etc.) and Cloud infrastructure expenses (AWS, Azure, GCP). Built with Next.js 16, Supabase, and Stripe for production-scale operations.

**Live Deployment**: [https://vercel.com/surasanirama-5413s-projects/v0-dev-style-app-console](https://vercel.com/surasanirama-5413s-projects/v0-dev-style-app-console)

## Architecture

### Two-Section Platform

**Landing Pages** (`app/(landingPages)`) - Public marketing website
- 10 production-ready pages with separate CSS styling
- Homepage, Features, Pricing, Solutions, About, Resources, Contact, Privacy, Terms, Documentation
- Dark technical aesthetic optimized for enterprise audiences
- No authentication required

**Console/App** (`app/[orgSlug]`) - Authenticated admin portal
- Multi-tenant organization dashboard
- Real-time cost analytics and visualization
- Member management with RBAC
- Billing and subscription management
- Separate styling from landing pages
- **Sidebar Navigation**:
  - Top: Dashboard, Analytics, API Keys
  - Bottom: Organization (expandable stats), Billing, Members, Profile, Sign Out

## Features

### Cost Management & Analytics
- Real-time cost tracking for GenAI and cloud services
- Advanced data visualization (bar, line, pie, trend charts)
- Cost breakdown by service, region, account, and time period
- Enterprise-grade data tables with filtering and pagination
- Export capabilities and detailed reporting

### Authentication & Security
- Email/password authentication with OTP support
- Forgot password & account recovery flows
- Multi-factor authentication ready
- Session management and token refresh
- Secure middleware-based access control

### Organization Management
- Single-tenant architecture (one org per user)
- Unique organization slugs for clean URLs
- **3-tier role system**:
  - **Owner**: Full access, billing, member management, account deletion
  - **Collaborator**: Edit data, no admin functions
  - **Read-Only**: View only access
- Team member invitations with secure 64-char tokens
- Seat limits enforced by subscription tier
- Ownership transfer functionality
- **Organization deletion with data cleanup**

### Account Management
- Profile settings with email/password updates
- **Account deletion with email verification** (6-digit OTP, 15-min expiry)
- **GDPR-compliant data anonymization** on deletion
- Audit logging for compliance
- Ownership transfer before account deletion (if org owner)

### Subscription & Billing
- Stripe integration with automated billing
- Dynamic pricing fetched from Stripe product metadata
- **Free trial with no credit card required** - Stripe handles payment collection only when needed
- Subscription gating and access control
- Test mode for QA and development
- Webhook idempotency with dual-layer protection
- **Billing Dashboard Features**:
  - Pricing cards with current plan highlighted
  - Subscription status (active, trialing, past_due, canceled)
  - Current billing period dates
  - Payment method display (card brand, last 4 digits)
  - Invoice history with download/view links
  - Cancel subscription (at period end, like Claude billing)
  - Resume canceled subscription before period ends
  - Stripe Customer Portal access
- **Trust Badges**: SOC 2 Type II, GDPR Compliant, Secure Stripe Payments

### Enterprise Features
- Audit logging and activity tracking
- API key management
- Advanced filtering and search
- Real-time notifications
- Responsive design for all devices

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Payments**: Stripe
- **Styling**: Tailwind CSS v4 with custom theming
- **Charts**: Recharts
- **UI Components**: shadcn/ui
- **TypeScript**: Full type safety throughout

## Quick Start

### ⚡ Landing Pages (Zero Configuration)
The marketing website works **immediately** without any setup:
- ✅ Visit [http://localhost:3000](http://localhost:3000) or your deployed URL
- ✅ All 10 landing pages load instantly
- ✅ No environment variables needed
- ✅ No authentication required

Pages available:
- `/` - Homepage
- `/features` - Feature showcase
- `/pricing` - Subscription plans
- `/solutions` - Use cases
- `/about` - About us
- `/resources` - Blog & guides
- `/contact` - Contact form
- `/privacy` - Privacy policy
- `/terms` - Terms of service

### 🔐 Console (Requires Setup)
The authenticated console at `/{orgSlug}` requires configuration:

1. **Clone and Install**
   \`\`\`bash
   git clone <repository-url>
   cd cloudact-ai
   npm install
   \`\`\`

2. **Configure Environment Variables**
   
   **⚠️ Important**: Environment variables are ONLY required for:
   - Authentication (login/signup)
   - Billing (Stripe checkout)
   - Authenticated console features
   
   **Landing pages work without any configuration.**
   
   Copy `.env.example` to `.env.local` and fill in your credentials:
   \`\`\`bash
   cp .env.example .env.local
   \`\`\`
   
   Required variables:
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Stripe: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Price IDs: `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID`, etc.
   - App: `NEXT_PUBLIC_APP_URL` (for invite links, e.g., `http://localhost:3000`)

3. **Setup Database**
   Run the SQL scripts in Supabase SQL Editor in order:
   \`\`\`
   scripts/01_production_setup.sql   -- Core schema, tables, triggers
   scripts/02_fix_rls_functions.sql  -- RLS helper functions (SECURITY DEFINER)
   \`\`\`

4. **Start Development Server**
   \`\`\`bash
   npm run dev
   \`\`\`
   Visit [http://localhost:3000](http://localhost:3000)

For detailed setup instructions, see [LOCAL_SETUP.md](./LOCAL_SETUP.md)

## Subscription Plans

Pricing is dynamically fetched from Stripe product metadata. Example tiers:

| Plan | Price | Seats | Pipelines/Day | AI Providers | Cloud Providers |
|------|-------|-------|---------------|--------------|-----------------|
| **Starter** | $29/mo | 2 | 6 | 3 | 3 |
| **Professional** | $99/mo | 6 | 25 | 6 | 6 |
| **Scale** | $299/mo | 11 | 100 | 10 | 10 |

All plans include:
- **Free trial with no credit card required**
- Real-time cost tracking
- Advanced analytics dashboard
- API access
- Email support
- SOC 2 Type II & GDPR compliant infrastructure

## User Flows

### 1. New User Signup (Owner)
```
/signup
    ↓ Create account (email + password)
    ↓ Auto-create profile (DB trigger)
/onboarding/organization
    ↓ Enter org name, type, select plan
    ↓ Create organization (DB trigger adds owner membership)
/{org_slug}/billing
    ↓ Stripe checkout (or test mode)
    ↓ Webhook updates billing_status
/{org_slug}/dashboard ✓
```

### 2. Returning User Login
```
/login
    ↓ Email + password authentication
    ↓ Update last_login_at
    ↓ Find user's organization membership
/{org_slug}/dashboard ✓
    (or /onboarding/organization if no org)
```

### 3. Team Member Invitation (No Billing Required)
```
STEP 1: Owner Creates Invite
/{org_slug}/settings/members
    ↓ Enter email, select role (collaborator/read_only)
    ↓ Check seat limit against plan
    ↓ Generate secure 64-char token
    ↓ Create invite with 48h expiry
    ↓ Copy invite link: /invite/{token}

STEP 2: Invitee Opens Link
/invite/{token}
    ↓ Validate token (pending, not expired)
    ↓ Display org name, role, invited email
    ↓ Show "Create Account & Join" (primary)
    ↓ Show "Already have account? Sign in" (link)

STEP 3A: New User Flow
/signup?redirect=/invite/{token}&email={invitedEmail}
    ↓ Email pre-filled from invite
    ↓ Create account with password
    ↓ Auto-sign in after signup
    ↓ Redirect back to /invite/{token}
    ↓ Now authenticated → "Accept Invitation"
    ↓ Verify email matches invite
    ↓ Create organization_members record
    ↓ Update invite status → accepted
/{org_slug}/dashboard ✓

STEP 3B: Existing User Flow
/login?redirect=/invite/{token}
    ↓ Sign in with credentials
    ↓ Redirect back to /invite/{token}
    ↓ Click "Accept Invitation"
    ↓ Verify email matches invite
    ↓ Create membership
/{org_slug}/dashboard ✓

Error States:
    - Email mismatch: "Sign in with different account"
    - Expired invite: "Ask owner for new invite"
    - Already accepted: "Invite already used"
```

### 4. Ownership Transfer
```
Owner: /{org_slug}/settings/members
    ↓ Select member to promote
    ↓ Call transfer_ownership() function
    ↓ Current owner → collaborator
    ↓ Selected member → owner
    ↓ Update organizations.created_by
```

### 5. Billing Management Flow
```
View Billing Page
/{org_slug}/billing
    ↓ Fetch subscription from Stripe
    ↓ Fetch last 10 invoices
    ↓ Fetch payment method
    ↓ Display current plan, status, period

Cancel Subscription
    ↓ Click "Cancel Plan" button
    ↓ Confirm in dialog
    ↓ Cancel at period end (not immediately)
    ↓ Status shows: "Cancels on {date}"
    ↓ Can resume before period ends

Resume Subscription
    ↓ Click "Resume Subscription"
    ↓ Re-enable subscription
    ↓ Status returns to active

View/Download Invoice
    ↓ Click invoice row
    ↓ Open Stripe hosted invoice page
    ↓ Or download PDF directly
```

### 6. Stripe Webhook Flow
```
checkout.session.completed
    ↓ Get org_id from metadata
    ↓ Update: stripe_customer_id, stripe_subscription_id
    ↓ Set billing_status = 'active', plan limits

customer.subscription.updated
    ↓ Sync plan, billing_status, period dates

customer.subscription.deleted
    ↓ Set billing_status = 'canceled'

invoice.payment_failed
    ↓ Set billing_status = 'past_due'
```

### 7. Account Deletion Flow
```
Owner: /{org_slug}/settings/profile
    ↓ Click "Delete Account"
    ↓ If org owner: Must transfer ownership first OR delete org
    ↓ Show confirmation dialog with data summary
    ↓ Click "Continue with Deletion"
    ↓ Send 6-digit OTP to email (15-min expiry)
    ↓ Enter OTP code
    ↓ Click "Permanently Delete Account"
    ↓ GDPR anonymization:
      - Profile: email → deleted_[timestamp]@deleted.local
      - Profile: full_name → "Deleted User"
      - Organization: name → "Deleted Organization [id]"
      - Organization: stripe IDs cleared
    ↓ Auth user deleted from Supabase
    ↓ Redirect to /login
```

### Permission Matrix
| Action | Owner | Collaborator | Read-Only |
|--------|-------|--------------|-----------|
| View dashboard | ✓ | ✓ | ✓ |
| View analytics | ✓ | ✓ | ✓ |
| Edit data | ✓ | ✓ | ✗ |
| Invite members | ✓ | ✗ | ✗ |
| Remove members | ✓ | ✗ | ✗ |
| Change roles | ✓ | ✗ | ✗ |
| Cancel invites | ✓ | ✗ | ✗ |
| View billing | ✓ | ✗ | ✗ |
| Cancel subscription | ✓ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ |
| Delete org | ✓ | ✗ | ✗ |
| Delete account | ✓ | ✓ | ✓ |

## Database Schema

### Core Tables
- **profiles** - User profiles extending auth.users
- **organizations** - Organization details, subscription, billing, org_type
- **organization_members** - User memberships with roles (owner, collaborator, read_only)
- **invites** - Pending team invitations with expiry
- **activity_logs** - Audit trail for compliance
- **usage_tracking** - Rate limiting and quota tracking

### Key Features
- Auto profile creation on signup (trigger)
- Auto owner membership on org creation (trigger)
- DB-level seat limit enforcement
- Owner role protection (cannot be modified without transfer)
- Ownership transfer function
- Expired invite cleanup

### SQL Scripts

| Script | Purpose |
|--------|---------|
| `01_production_setup.sql` | Core schema: tables, triggers, basic RLS policies |
| `02_fix_rls_functions.sql` | RLS helper functions with SECURITY DEFINER to avoid infinite recursion |

**Important**: Run scripts in numbered order. The second script fixes RLS policy issues where helper functions need elevated privileges to check membership without triggering RLS recursion.

### Security Architecture
- **Row Level Security (RLS)**: All tables have RLS enabled
- **SECURITY DEFINER functions**: Helper functions like `get_user_org_ids()` run with definer privileges to safely check membership
- **Service Role Client**: Server actions use service role client for admin operations (invites, member management)
- **Anon Key Client**: Used for user-scoped operations with RLS enforcement

## API Endpoints

### Cost Data API (No Authentication)
`GET /api/mock-cost-api` - Retrieve cost data with filtering

**No API key required** - reads directly from CSV file.

Query parameters:
- `startDate` - Filter by date range
- `endDate` - Filter by date range
- `service` - Filter by service name
- `region` - Filter by region
- `page` - Pagination
- `limit` - Results per page

Returns aggregated cost data with breakdowns by service, region, and account.

See [docs/ANALYTICS_API.md](./docs/ANALYTICS_API.md) for complete API documentation.

## Testing

### Test Credentials
- Email: `guru.kallam@gmail.com`
- Password: `guru1234`

### Test Mode
Use "Test Subscribe" buttons in billing to bypass Stripe for QA testing.

See [00-requirements-docs/05_TESTING.md](../00-requirements-docs/05_TESTING.md) for comprehensive testing guide covering all 10 enterprise use cases.

## Validation Testing

### Automated User Flow Tests

Run comprehensive automated validation tests for all critical user flows:

```bash
# Run all validation tests
npx vitest tests/user_flows_comprehensive.test.ts --run

# Run specific flow validation
npx vitest tests/user_flows_comprehensive.test.ts -t "New User First-Time Flow" --run

# Run in watch mode for development
npx vitest tests/user_flows_comprehensive.test.ts
```

### Validated Flows

The automated test suite validates these 10 critical user flows:

1. **New User First-Time Flow** - Signup → Onboarding → Billing → Dashboard
2. **Returning User Sign-In** - Login and dashboard access
3. **Forgot Password + Reset** - Password recovery flow
4. **Org Owner Invites Member** - Create and copy invite link
5. **Seat Limit Enforcement** - Prevent exceeding plan limits
6. **Billing - Upgrade & Downgrade** - Plan changes with seat validation
7. **Subscription Cancellation & Gating** - Access control when subscription inactive
8. **Role-Based Access Control** - Permission matrix validation (Owner/Collaborator/Read-Only)
9. **Multi-Org Isolation** - Cross-org access prevention
10. **Invite Acceptance** - Join existing org without creating new org

### Test Requirements

- **Dev Server**: Must be running (`npm run dev`)
- **Database**: Supabase configured with test data
- **Test User**: `guru.kallam@gmail.com` / `guru1234` (for existing user tests)
- **Browser**: Tests run in headless Chromium via Playwright

### Expected Results

- ✅ All flows complete without errors
- ✅ Proper navigation and redirects
- ✅ UI elements render correctly
- ✅ Access control enforced
- ✅ Data persistence verified

See [tests/user_flows_comprehensive.test.ts](./tests/user_flows_comprehensive.test.ts) for complete test implementation.

## Documentation

All documentation is centralized in `00-requirements-docs/`:

| Document | Description |
|----------|-------------|
| `00-ARCHITECTURE.md` | Full platform architecture |
| `00-DESIGN_STANDARDS.md` | Design system (colors, typography) |
| `00_CONSOLE_UI_DESIGN_STANDARDS.md` | Console UI patterns |
| `01_BILLING_STRIPE.md` | Billing architecture (Stripe-first) |
| `01_USER_MANAGEMENT.md` | Auth, roles, team invites |
| `05_SECURITY.md` | Security implementation details |
| `05_TESTING.md` | Testing guide (15 comprehensive flows) |

## Deployment

### Vercel Deployment
The project is configured for automatic deployment on Vercel:

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables in Production
All environment variables must be configured in Vercel project settings:
- Supabase credentials
- Stripe keys and price IDs
- App URL for invite links

## Security

### Authentication & Access Control
- Middleware-enforced authentication on all protected routes
- Multi-org isolation prevents cross-tenant data access
- Role-based permissions at UI and API levels
- Subscription-based feature gating

### Database Security
- **Row Level Security (RLS)** on all tables
- **SECURITY DEFINER functions** for safe membership checks
- **Service Role Client** for admin operations (bypasses RLS safely)
- **Anon Key Client** for user operations (RLS enforced)
- Parameterized queries prevent SQL injection

### Application Security
- XSS protection with React's built-in escaping
- CSRF protection on all form submissions
- Secure invite tokens (64-char cryptographic random)
- 48-hour invite expiration
- Email verification on invite acceptance

## Support

For issues or questions:
1. Check documentation in `/docs` folder
2. Review console logs for `[v0]` debug messages
3. Verify environment variables
4. Check Supabase database state
5. Open issue on GitHub or contact support

## License

MIT License - see LICENSE file for details

## Project Structure

\`\`\`
app/
├── (landingPages)/          # Public - No auth required
│   ├── landing.css          # Separate CSS for landing pages
│   ├── layout.tsx           # Marketing layout with header/footer + trust badges
│   ├── pricing/             # Dynamic pricing with FAQ section
│   └── */page.tsx           # 10 landing pages
│
├── [orgSlug]/               # Protected - Auth required
│   ├── console.css          # Separate CSS for console
│   ├── layout.tsx           # App shell with sidebar
│   ├── dashboard/           # Main dashboard
│   ├── analytics/           # Cost analytics dashboard
│   ├── billing/             # Subscription management + trust badges
│   └── settings/
│       ├── profile/         # Account deletion, ownership transfer
│       ├── members/         # RBAC, invites, member management
│       └── api-keys/
│
├── login/                   # Authentication pages
├── signup/
├── onboarding/
├── invite/[token]/          # Team invitation acceptance
└── api/
    ├── mock-cost-api/       # Mock analytics
    ├── account/delete/      # Account deletion confirmation endpoint
    └── webhooks/stripe/     # Stripe webhook handler (idempotent)

actions/
├── stripe.ts                # Dynamic pricing from Stripe metadata
├── account.ts               # Account deletion with email verification
└── ...

components/
├── dashboard-sidebar.tsx    # Main sidebar navigation
├── pricing-card.tsx         # Pricing card with trust badges
├── ui/                      # shadcn/ui components
└── ...

scripts/
├── 01_production_setup.sql  # Core database schema
└── 02_fix_rls_functions.sql # RLS helper functions
\`\`\`

## Common Issues

### "Environment variable required" Error
- **Landing pages**: Should never show this error. If you see it, there's a bug.
- **Console pages**: Normal if you haven't configured Supabase/Stripe credentials.
- **Solution**: Add credentials to Vars section in v0 sidebar, or deploy with environment variables.

### Infinite Redirect Loop
- **Cause**: Middleware redirecting authenticated users from auth pages.
- **Solution**: Clear browser cache and cookies, or use incognito mode.

### Charts Not Loading
- **Cause**: Mock API can't read CSV file.
- **Solution**: Verify `public/data/cost-data.csv` exists and is readable.

## Recent Updates

### v3.0.0 - Production Ready Release
- **Account Deletion**: Email-verified account deletion with GDPR-compliant data anonymization
- **Ownership Transfer**: Transfer org ownership before account deletion
- **Organization Deletion**: Delete entire organization with data cleanup
- **Trust Badges**: SOC 2 Type II, GDPR Compliant, Secure Stripe Payments badges on all pages
- **Dynamic Pricing**: Plans fetched from Stripe product metadata (no hardcoded prices)
- **Free Trial**: No credit card required for trial (Stripe `payment_method_collection: "if_required"`)
- **Webhook Idempotency**: Dual-layer protection against duplicate webhook processing
- **Landing Page Enhancements**: FAQ sections, improved styling, trust indicators
- **Build Verified**: Production build passing with 23 pages (10 static, 13 dynamic)

### v2.3.0 - Sidebar Reorganization & Cleanup
- **Sidebar Restructure**: Navigation reorganized with clean separation
  - Top: Dashboard, Analytics, API Keys
  - Bottom: Organization (expandable with stats), Billing, Members, Profile, Sign Out
- **Organization Panel**: Expandable section showing plan, status, members, role
- **Removed**: Operations and Settings pages (consolidated)

### v2.2.0 - Member Invites & Billing Enhancements
- **Complete Invite Flow**: New `/invite/[token]` page with full UX for accepting team invitations
- **Billing Dashboard**: Invoice history, cancel/resume subscription, payment method display
- **RLS Security Fix**: SECURITY DEFINER functions to prevent infinite recursion

### v2.1.0 - Production Schema
- Core database schema with RLS policies
- Auto profile creation trigger
- Organization membership management
- Ownership transfer functionality

---

## Feature Completion Status

| Feature Area | Status | Notes |
|-------------|--------|-------|
| Authentication | 100% | Login, signup, password reset, magic links, org invites |
| Billing/Stripe | 100% | Free trial (no CC), dynamic plans, webhooks, idempotency |
| Org Management | 100% | RBAC, invites, members, ownership transfer, deletion |
| Account Management | 100% | Email verification, GDPR anonymization, audit logging |
| Landing Pages | 100% | 10 pages with trust badges, FAQ sections |
| Build | PASSING | 23 pages generated successfully |

---

**Built with [v0.app](https://v0.app)** - Continue building at [https://v0.app/chat/ui5EnLFmRAD](https://v0.app/chat/ui5EnLFmRAD)
