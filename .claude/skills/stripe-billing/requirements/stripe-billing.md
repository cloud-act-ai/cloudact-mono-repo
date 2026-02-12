# Stripe Billing - Requirements

## Overview

Stripe-powered subscription billing for CloudAct. Handles checkout, plan management, webhooks, and billing status enforcement.

## Source Specification

Full billing requirements are defined in:
- `00-requirements-specs/01_BILLING_STRIPE.md` (v2.3)
- `00-requirements-specs/01_ORGANIZATION_ONBOARDING.md` (v1.8) - Plan limits section

## Functional Requirements

### FR-1: Checkout Flow
- **FR-1.1**: Plan selection page shows Starter ($19), Professional ($69), Scale ($199)
- **FR-1.2**: Stripe Checkout session created with correct price ID
- **FR-1.3**: Successful payment triggers `checkout.session.completed` webhook
- **FR-1.4**: Webhook creates org in Supabase with billing fields populated
- **FR-1.5**: 14-day free trial on all plans

### FR-2: Subscription Management
- **FR-2.1**: Billing settings page shows current plan name and status
- **FR-2.2**: Plan upgrade/downgrade through Stripe billing portal
- **FR-2.3**: Cancellation updates Supabase billing_status to "canceled"
- **FR-2.4**: Plan change audit trail maintained

### FR-3: Webhook Processing
- **FR-3.1**: All events signature-verified with webhook secret
- **FR-3.2**: Idempotent processing (duplicate event IDs rejected)
- **FR-3.3**: Failed payment → billing_status = "past_due"
- **FR-3.4**: Deleted subscription → billing_status = "canceled"

### FR-4: Billing Status Enforcement
- **FR-4.1**: Only "trialing" and "active" allow pipeline execution
- **FR-4.2**: Inactive statuses redirect to billing page
- **FR-4.3**: API service reads limits from Supabase (not BigQuery)

## Non-Functional Requirements

### NFR-1: Environment Isolation
- TEST keys for stage, LIVE keys for prod — never mixed

### NFR-2: Security
- Webhook signature verification on all events
- Stripe secret keys in GCP Secret Manager, never in code

## Test Coverage (via /account-setup skill)

Billing UI tests are part of the `/account-setup` skill (3 tests):
- Display billing settings page
- Display current plan info
- Display plans selection page

Full checkout flow cannot be automated (Stripe hosted page).
