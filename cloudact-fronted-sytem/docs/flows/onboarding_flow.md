# Onboarding Flow

This document describes the complete user and organization onboarding flow including signup, checkout, organization creation, and backend integration.

## Overview

```
User                 Frontend              Supabase            Stripe           Backend (8000)
  │                     │                     │                  │                   │
  ├── /signup ──────────┤                     │                  │                   │
  │                     │                     │                  │                   │
  │── Submit form ──────┤                     │                  │                   │
  │   (email, password, │                     │                  │                   │
  │    company info)    │                     │                  │                   │
  │                     ├── signUp() ─────────┤                  │                   │
  │                     │   [user_metadata:   │                  │                   │
  │                     │    pending_company] │                  │                   │
  │                     │                     │                  │                   │
  │◄── Redirect ────────┤                     │                  │                   │
  │    /onboarding/     │                     │                  │                   │
  │    billing          │                     │                  │                   │
  │                     │                     │                  │                   │
  ├── Select Plan ──────┤                     │                  │                   │
  │                     │                     │                  │                   │
  │                     ├── createOnboarding  │                  │                   │
  │                     │    CheckoutSession()├──────────────────┤                   │
  │                     │                     │                  │                   │
  │◄── Checkout URL ────┤                     │                  │                   │
  │                     │                     │                  │                   │
  │── Complete ─────────┼─────────────────────┼──────────────────┤                   │
  │   Payment           │                     │                  │                   │
  │                     │                     │                  │                   │
  │◄── Redirect ────────┼─────────────────────┼──────────────────┤                   │
  │    /onboarding/     │                     │                  │                   │
  │    success          │                     │                  │                   │
  │                     │                     │                  │                   │
  │                     ├── completeOnboarding()                 │                   │
  │                     │                     │                  │                   │
  │                     │   [Verify session]  ├──────────────────┤                   │
  │                     │   [Get plan limits] │                  │                   │
  │                     │                     │                  │                   │
  │                     ├── Create org ───────┤                  │                   │
  │                     │                     │                  │                   │
  │                     ├── onboardToBackend()┼──────────────────┼───────────────────┤
  │                     │                     │                  │   POST /organizations
  │                     │                     │                  │   /onboard        │
  │                     │                     │                  │   (X-CA-Root-Key) │
  │                     │                     │                  │                   │
  │                     │◄── API Key ─────────┼──────────────────┼───────────────────┤
  │                     │                     │                  │                   │
  │                     ├── Store API key ────┤                  │                   │
  │                     │   (org_api_keys_    │                  │                   │
  │                     │    secure table)    │                  │                   │
  │                     │                     │                  │                   │
  │◄── Redirect ────────┤                     │                  │                   │
  │    /{orgSlug}/      │                     │                  │                   │
  │    dashboard        │                     │                  │                   │
```

## Endpoints

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/signup` | User registration with company info |
| `/onboarding/billing` | Plan selection page |
| `/onboarding/success` | Post-checkout org creation |
| `/{orgSlug}/dashboard` | Main dashboard |

### Frontend Server Actions

| Action | File | Description |
|--------|------|-------------|
| `signUp()` | Supabase auth | Create user with pending company info |
| `createOnboardingCheckoutSession()` | `actions/stripe.ts` | Create Stripe checkout |
| `completeOnboarding()` | `actions/organization.ts` | Create org after checkout |
| `onboardToBackend()` | `actions/backend-onboarding.ts` | Setup backend dataset + API key |

### Backend API (Port 8000)

| Endpoint | Method | Headers | Description |
|----------|--------|---------|-------------|
| `/api/v1/organizations/onboard` | POST | `X-CA-Root-Key` | Create org in BigQuery + generate API key |
| `/api/v1/organizations/dryrun` | POST | `X-CA-Root-Key` | Validate org before onboarding |

## Flows

### 1. User Signup

**Trigger:** User visits `/signup`

**Flow:**
1. User fills form: email, password, company name, company type
2. Frontend calls Supabase `auth.signUp()` with metadata:
   ```typescript
   {
     email,
     password,
     options: {
       data: {
         pending_company_name: companyName,
         pending_company_type: companyType,
       }
     }
   }
   ```
3. Supabase creates user with pending company info in `user_metadata`
4. User redirected to `/onboarding/billing`

**Key Points:**
- Company info stored in `user_metadata` (not organization yet)
- Organization is NOT created at signup
- User must complete billing before org creation

### 2. Plan Selection

**Trigger:** User lands on `/onboarding/billing`

**Flow:**
1. Page calls `getStripePlans()` to fetch available plans
2. Plans displayed with features, limits, pricing
3. User clicks plan button
4. Frontend calls `createOnboardingCheckoutSession(priceId)`
5. Session created with metadata:
   ```typescript
   {
     is_onboarding: "true",
     user_id: user.id,
     pending_company_name: companyName,
     pending_org_slug: orgSlug,
   }
   ```
6. User redirected to Stripe Checkout

### 3. Complete Onboarding (Post-Checkout)

**Trigger:** Stripe redirects to `/onboarding/success?session_id={id}`

**Flow:**
1. Success page calls `completeOnboarding(sessionId)`
2. Verifies checkout session:
   - Session exists and is complete
   - `is_onboarding: "true"` in metadata
   - Session belongs to current user
3. Gets company info from session metadata
4. Creates organization in Supabase:
   ```typescript
   await adminClient.from("organizations").insert({
     org_name: sanitizedName,
     org_slug: orgSlug,
     org_type: companyType,
     plan: planId,
     stripe_customer_id: session.customer,
     stripe_subscription_id: subscription.id,
     billing_status: subscription.status,
     trial_ends_at: trialEndsAt,
     seat_limit: limits.teamMembers,
     providers_limit: limits.providers,
     pipelines_per_day_limit: limits.pipelinesPerDay,
   })
   ```
5. DB trigger auto-creates owner membership record
6. Updates Stripe subscription metadata with `org_id`
7. Clears pending company info from user metadata
8. Calls `onboardToBackend()` for BigQuery setup

**Key Code:**
```typescript
// actions/organization.ts:232-496
export async function completeOnboarding(sessionId: string) {
  // Verify session
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  })

  if (session.metadata?.is_onboarding !== "true") {
    return { success: false, error: "Invalid session type" }
  }

  // Create organization
  const { data: orgData } = await adminClient
    .from("organizations")
    .insert({ ... })

  // Backend onboarding
  const backendResult = await onboardToBackend({
    orgSlug,
    companyName,
    adminEmail: user.email,
    subscriptionPlan: mapPlanToBackendPlan(planId),
  })
}
```

### 4. Backend Onboarding

**Trigger:** Called from `completeOnboarding()` after org creation

**Flow:**
1. `onboardToBackend()` calls backend with `CA_ROOT_API_KEY`
2. Backend `/api/v1/organizations/onboard`:
   - Creates BigQuery dataset: `{org_slug}_prod`
   - Creates meta tables (usage_cost, etc.)
   - Generates org API key
   - Stores in `org_api_keys` table (encrypted)
3. Frontend receives API key
4. Stores key in `org_api_keys_secure` table (service role)
5. Updates `organizations.backend_onboarded = true`
6. Returns API key fingerprint (last 4 chars)

**Key Code:**
```typescript
// actions/backend-onboarding.ts:176-365
export async function onboardToBackend(input: {
  orgSlug: string
  companyName: string
  adminEmail: string
  subscriptionPlan?: "STARTER" | "PROFESSIONAL" | "SCALE"
}) {
  const backend = new PipelineBackendClient({ adminApiKey })

  const response = await backend.onboardOrganization({
    org_slug: input.orgSlug,
    company_name: input.companyName,
    admin_email: input.adminEmail,
    subscription_plan: input.subscriptionPlan || "STARTER",
  })

  // Store API key securely
  await storeApiKeySecure(input.orgSlug, response.api_key)

  // Update Supabase
  await adminClient.from("organizations").update({
    backend_onboarded: true,
    backend_api_key_fingerprint: apiKeyFingerprint,
    backend_onboarded_at: new Date().toISOString(),
  })
}
```

### 5. Conflict Handling (Org Already Exists)

**Scenario:** Backend already has org (previous partial onboarding)

**Flow:**
1. Backend returns 409 Conflict
2. Frontend detects "already exists with status 'ACTIVE'"
3. Retries with `regenerate_api_key_if_exists: true`
4. Backend regenerates API key
5. New key stored in secure table

## API Key Hierarchy

```
CA_ROOT_API_KEY (Server-side env)
    │
    └── POST /api/v1/organizations/onboard
            │
            └── Generates → Org API Key
                              │
                              ├── Stored in: org_api_keys_secure (Supabase)
                              ├── Stored in: org_api_keys (BigQuery, encrypted)
                              └── Used for: integrations, pipelines
```

## Data Storage

| Data | Storage | Access |
|------|---------|--------|
| Pending company info | `user_metadata` | During signup only |
| Organization record | `organizations` table | Supabase RLS |
| Owner membership | `organization_members` | DB trigger |
| Org API key | `org_api_keys_secure` | Service role only |
| API key fingerprint | `organizations.backend_api_key_fingerprint` | Display only |
| Backend dataset | BigQuery `{org_slug}_prod` | Backend API |

## Subscription Plans

| Plan | Backend Enum | Seat Limit | Providers | Pipelines/Day |
|------|-------------|------------|-----------|---------------|
| Starter | `STARTER` | From Stripe | From Stripe | From Stripe |
| Professional | `PROFESSIONAL` | From Stripe | From Stripe | From Stripe |
| Scale | `SCALE` | From Stripe | From Stripe | From Stripe |

**Note:** All limits come from Stripe product metadata. No hardcoded values.

## Org Slug Generation

Format: `{companyname}_{MMDDYYYY}`

```typescript
// Clean company name
const cleanName = companyName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")  // Replace non-alphanumeric with underscore
  .replace(/^_|_$/g, "")         // Remove leading/trailing underscores
  .slice(0, 40)                  // Leave room for date suffix

// Add date suffix
const orgSlug = `${cleanName}_${mm}${dd}${yyyy}`

// Example: "Acme Corp, Inc." -> "acme_corp_inc_11302025"
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Session does not belong to this user" | Session mismatch | User must re-authenticate |
| "Missing company information" | Metadata lost | User must re-signup |
| "Organization already exists" | Duplicate org | Use different company name |
| "Backend onboarding failed" | Backend unreachable | Retry from Settings > Onboarding |
| "API key regeneration failed" | 409 retry failed | Contact support |

## Security Measures

1. **Session Verification**: Checkout session validated server-side
2. **User Matching**: Session `user_id` must match current user
3. **Input Sanitization**: Company name sanitized to prevent XSS
4. **Org Slug Validation**: Alphanumeric + underscores only
5. **CA_ROOT_API_KEY**: Server-side only, never exposed to client
6. **API Key Storage**: Secure table with no RLS (service role only)

## Files

| File | Purpose |
|------|---------|
| `app/signup/page.tsx` | Signup form |
| `app/onboarding/billing/page.tsx` | Plan selection |
| `app/onboarding/success/page.tsx` | Post-checkout completion |
| `actions/organization.ts` | `completeOnboarding()` |
| `actions/backend-onboarding.ts` | `onboardToBackend()` |
| `actions/stripe.ts` | `createOnboardingCheckoutSession()` |
| `lib/api/backend.ts` | `PipelineBackendClient` |
