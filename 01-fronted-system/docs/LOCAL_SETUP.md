# CloudAct.ai - Local Development Setup Guide

This guide will help you set up and run CloudAct.ai locally on your machine.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed ([Download here](https://nodejs.org/))
- **npm** or **yarn** package manager
- A **Supabase account** ([Sign up here](https://supabase.com))
- A **Stripe account** ([Sign up here](https://stripe.com))
- **Git** installed

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd cloudact-ai
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Set Up Supabase

### 3.1 Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details:
   - **Name**: CloudAct.ai
   - **Database Password**: Choose a strong password
   - **Region**: Select closest to you
4. Click "Create new project" (takes ~2 minutes)

### 3.2 Get Supabase Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 3.3 Set Up Database Schema

1. In Supabase, go to **SQL Editor**
2. Click "New Query"
3. Run scripts in order:
   - `scripts/01_production_setup.sql` - Core schema, tables, triggers
   - `scripts/02_fix_rls_functions.sql` - RLS helper functions (SECURITY DEFINER)
4. Verify tables created in **Table Editor**:
   - `profiles`
   - `organizations`
   - `organization_members`
   - `invites`
   - `activity_logs`

### 3.4 Configure Authentication

1. Go to **Authentication** → **URL Configuration**
2. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/**`
3. Enable **Email** provider
4. For development, disable email confirmations:
   - Go to **Authentication** → **Email Templates**
   - Toggle off "Require email confirmation"

## Step 4: Set Up Stripe

### 4.1 Get Stripe API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Developers** → **API keys**
3. Copy:
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

### 4.2 Create Products and Prices

Create three products in Stripe Dashboard:

| Plan | Price | Environment Variable |
|------|-------|---------------------|
| Starter | $29/month | `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` |
| Professional | $99/month | `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` |
| Scale | $299/month | `NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID` |

### 4.3 Set Up Webhooks (Optional)

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

## Step 5: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Fill in all values:

```bash
# SUPABASE
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# STRIPE
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_... (optional)

# APP
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 6: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 7: Test the Application

### Create Your First Account

1. Go to http://localhost:3000/signup
2. Enter email and password
3. Complete onboarding (create organization)
4. Choose a plan or use "Test Subscribe" mode

### Test Features

- **Authentication**: Login/logout, password reset
- **Organization**: Create org, view dashboard
- **Members**: Invite team members, accept invites
- **Billing**: View subscription, cancel/resume
- **Analytics**: View cost charts and data tables

## Console Navigation

After login, the sidebar provides:

**Top Navigation:**
- Dashboard - Main overview
- Analytics - Cost visualization
- API Keys - Key management

**Bottom Navigation:**
- Organization (expandable) - Plan, status, members, role
- Billing - Subscription management
- Members - Team management
- Profile - User settings
- Sign Out

## Troubleshooting

### Database Connection Issues
1. Verify Supabase credentials in `.env.local`
2. Check Supabase project is active (not paused)
3. Verify database tables exist (run SQL scripts again)

### Authentication Issues
1. Check Supabase auth settings
2. Verify redirect URLs are configured
3. Clear browser cache and cookies

### RLS Errors
1. Ensure `02_fix_rls_functions.sql` was executed
2. Check browser console for specific error messages

### Stripe Issues
1. Use "Test Subscribe" mode for development
2. Verify Stripe keys are test keys (`sk_test_`, `pk_test_`)

## Useful Commands

```bash
npm install       # Install dependencies
npm run dev       # Run development server
npm run build     # Build for production
npm run lint      # Run linter
```

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` | Yes | Starter plan price ID |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Yes | Pro plan price ID |
| `NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID` | Yes | Scale plan price ID |
| `STRIPE_WEBHOOK_SECRET` | Optional | Webhook signature secret |
| `NEXT_PUBLIC_APP_URL` | Yes | Application base URL |

## Production Deployment

1. Use production Stripe keys (`sk_live_`, `pk_live_`)
2. Set `NEXT_PUBLIC_APP_URL` to your production domain
3. Configure Stripe webhooks for production
4. Deploy to Vercel
