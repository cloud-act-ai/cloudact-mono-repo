# Database Setup Scripts

## Migration Runner (Recommended)

Use the automated migration runner to apply all pending migrations:

```bash
# Check migration status
./scripts/supabase_db/migrate.sh --status

# Run all pending migrations
./scripts/supabase_db/migrate.sh

# Dry run (see what would be applied)
./scripts/supabase_db/migrate.sh --dry-run

# Force re-run a specific migration
./scripts/supabase_db/migrate.sh --force 05
```

### Setup Requirements

1. **Install psql** (PostgreSQL client):
   ```bash
   brew install libpq && brew link --force libpq
   ```

2. **Add to `.env.local`**:
   ```bash
   # Required for migration runner
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_DB_PASSWORD=your-database-password
   ```

   **Get SUPABASE_DB_PASSWORD:**
   - Go to Supabase Dashboard → Settings → Database
   - Copy the database password (or extract from connection string)

### Connection Details

The script connects directly to your Supabase PostgreSQL database:
- **Host**: `db.<project-ref>.supabase.co`
- **Port**: `5432`
- **User**: `postgres`
- **Database**: `postgres`

### Troubleshooting

| Error | Solution |
|-------|----------|
| `psql: command not found` | Run `brew install libpq && brew link --force libpq` |
| `password authentication failed` | Check SUPABASE_DB_PASSWORD is correct |
| `could not translate host name` | Check NEXT_PUBLIC_SUPABASE_URL is set correctly |
| Special chars in password (e.g., `@`) | The script uses PGPASSWORD env var, so this is handled |

---

## Operations Scripts (Danger Zone)

Located in `operations/` folder:

| Script | Description |
|--------|-------------|
| `DANGER_cleanup_all_data.sql` | Deletes ALL user data. Only for test/dev! |

---

## Manual Setup (Alternative)

Run scripts in order via Supabase SQL Editor:

1. **`00_migration_tracking.sql`** - Migration tracking table
2. **`01_production_setup.sql`** - Base schema (tables, RLS, triggers)
3. **`02_stripe_first_migration.sql`** - Stripe-first billing (removes plan constraints)
4. **`03_webhook_idempotency.sql`** - Database-backed webhook idempotency

### Quick Start (Manual)

1. Open your Supabase project's SQL Editor
2. Copy and run each numbered SQL file in order
3. Configure environment variables (see `.env.example`)

---

## Schema Overview

### Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles extending auth.users |
| `organizations` | Multi-tenant workspaces with billing |
| `organization_members` | User ↔ Org relationships with roles |
| `invites` | Pending member invitations |
| `activity_logs` | Audit trail for compliance |

### Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full control: billing, members, settings, data |
| `collaborator` | Edit data, no billing/member management |
| `read_only` | View-only access |

---

## Billing Architecture: Stripe as Source of Truth

**All plan limits come from Stripe product metadata. No hardcoded values.**

### Flow
```
Signup → Onboarding (select plan from Stripe) → Dashboard (trial starts)
                                                     ↓
                                              Billing Page → Stripe Checkout → Webhook → Database
```

### Database Columns (Synced from Stripe)
- `plan` - Plan ID from Stripe product metadata
- `billing_status` - Subscription status (trialing, active, past_due, canceled, etc.)
- `seat_limit` - From Stripe metadata: `teamMembers`
- `providers_limit` - From Stripe metadata: `providers`
- `pipelines_per_day_limit` - From Stripe metadata: `pipelinesPerDay`

### Stripe Product Metadata Required
```
plan_id: "starter"
features: "Feature 1|Feature 2|Feature 3"
teamMembers: "2"
providers: "3"
pipelinesPerDay: "6"
order: "1"
```

See `docs/BILLING.md` for complete Stripe setup.

---

## Billing Status Values

| Status | Description |
|--------|-------------|
| `trialing` | Trial period (days from Stripe price) |
| `active` | Paid subscription |
| `past_due` | Payment failed |
| `canceled` | Subscription canceled |
| `incomplete` | Initial payment pending |
| `incomplete_expired` | Initial payment expired |
| `paused` | Subscription paused |
| `unpaid` | Multiple payment failures |

---

## Row Level Security (RLS)

All tables have RLS enabled:

### Profiles
- Users can only view/update their own profile

### Organizations
- Members can view their organizations
- Owners can update organization settings
- Only creator (owner) can delete

### Organization Members
- Members can view other members in same org
- Owners can add/update/remove members

### Invites
- Members can view invites for their org
- Invitees can view their own pending invite
- Owners can create/revoke invites

### Activity Logs
- Members can view logs for their org
- Users can insert their own activity logs

---

## Helper Functions

| Function | Purpose |
|----------|---------|
| `user_is_org_member(org_id)` | Check if current user is org member |
| `user_is_org_admin(org_id)` | Check if current user is org owner |
| `handle_new_user()` | Auto-create profile on signup |
| `handle_updated_at()` | Auto-update timestamps |

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

**Note**: Price IDs are NOT needed - fetched dynamically from Stripe.

---

## URL Structure

```
/{org_slug}/dashboard       - Main dashboard
/{org_slug}/billing         - Subscription management
/{org_slug}/analytics       - Cost analytics
/{org_slug}/settings/members - Team management
/{org_slug}/settings/profile - User profile
```

---

## Legacy Scripts (Deprecated)

- `00_complete_fresh_setup.sql` - Old schema
- `01_complete_org_centric_setup.sql` - Old schema with RLS disabled

Use `01_production_setup.sql` + `02_stripe_first_migration.sql` for all new deployments.
