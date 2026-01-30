# /user-mgmt - User Management Operations

Manage users, members, invites, and roles in Supabase.

## Usage

```
/user-mgmt <action> [environment] [options]
```

## Actions

### List Users & Members
```
/user-mgmt users stage              # List all users
/user-mgmt members stage <org_slug> # List org members
/user-mgmt invites stage <org_slug> # List pending invites
```

### User Details
```
/user-mgmt user stage <email>       # Get user details by email
/user-mgmt user stage --id <uuid>   # Get user details by ID
```

### Role Management
```
/user-mgmt roles stage <org_slug>   # Show role distribution
```

### Auth Status
```
/user-mgmt auth-check stage         # Check auth configuration
```

---

## Environments

| Environment | Project ID | Description |
|-------------|------------|-------------|
| `stage` | kwroaccbrxppfiysqlzs | Test/Stage Supabase |
| `prod` | ovfxswhkkshouhsryzaf | Production Supabase |

---

## Instructions

### Action: users

List all users with key details.

```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      p.full_name,
      p.phone,
      (SELECT COUNT(*) FROM public.organization_members om WHERE om.user_id = u.id AND om.status = 'active') as org_count
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC
    LIMIT 50;
```

### Action: members

List all members of an organization.

```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      om.role,
      om.status,
      om.joined_at,
      p.email,
      p.full_name
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
    JOIN public.organizations o ON o.id = om.org_id
    WHERE o.org_slug = '$ORG_SLUG'
    ORDER BY
      CASE om.role WHEN 'owner' THEN 1 WHEN 'collaborator' THEN 2 ELSE 3 END,
      om.joined_at;
```

### Action: invites

List pending invites for an organization.

```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      i.email,
      i.role,
      i.status,
      i.created_at,
      i.expires_at,
      p.email as invited_by_email
    FROM public.invites i
    JOIN public.organizations o ON o.id = i.org_id
    LEFT JOIN public.profiles p ON p.id = i.invited_by
    WHERE o.org_slug = '$ORG_SLUG'
    ORDER BY i.created_at DESC;
```

### Action: user

Get details for a specific user by email or ID.

**By email:**
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.raw_user_meta_data,
      p.full_name,
      p.phone,
      p.timezone,
      p.last_login_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.email = '$EMAIL';
```

**Then get their org memberships:**
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      o.org_slug,
      o.company_name,
      om.role,
      om.status,
      om.joined_at
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.org_id
    JOIN auth.users u ON u.id = om.user_id
    WHERE u.email = '$EMAIL';
```

### Action: roles

Show role distribution for an organization.

```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      om.role,
      om.status,
      COUNT(*) as count
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.org_id
    WHERE o.org_slug = '$ORG_SLUG'
    GROUP BY om.role, om.status
    ORDER BY om.role;
```

**Also show seat usage:**
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      o.org_slug,
      o.seat_limit,
      (SELECT COUNT(*) FROM public.organization_members om
       WHERE om.org_id = o.id AND om.status = 'active') as seats_used
    FROM public.organizations o
    WHERE o.org_slug = '$ORG_SLUG';
```

### Action: auth-check

Check authentication configuration.

**Step 1: Check user counts**
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      (SELECT COUNT(*) FROM auth.users) as total_users,
      (SELECT COUNT(*) FROM public.profiles) as total_profiles,
      (SELECT COUNT(*) FROM public.organizations) as total_orgs,
      (SELECT COUNT(*) FROM public.organization_members WHERE status = 'active') as active_members,
      (SELECT COUNT(*) FROM public.invites WHERE status = 'pending') as pending_invites;
```

**Step 2: Check for orphan records**
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    -- Users without profiles (trigger issue)
    SELECT 'Users without profiles' as issue, COUNT(*) as count
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
    UNION ALL
    -- Orgs without owners
    SELECT 'Orgs without owners' as issue, COUNT(*) as count
    FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = o.id AND om.role = 'owner' AND om.status = 'active'
    );
```

---

## Role Reference

| Role | Billing | Members | Integrations | Pipelines | View |
|------|---------|---------|--------------|-----------|------|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| collaborator | ✗ | ✗ | ✓ | ✓ | ✓ |
| read_only | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## Troubleshooting

### User can't sign in
1. Check if user exists: `/user-mgmt user stage <email>`
2. Check email confirmation status in `raw_user_meta_data`
3. Verify Supabase email confirmation is DISABLED (should be for immediate signin)

### User not seeing organization
1. Check membership: `/user-mgmt members stage <org_slug>`
2. Verify status is 'active', not 'inactive' or 'suspended'

### Invite not working
1. Check invite status: `/user-mgmt invites stage <org_slug>`
2. Verify invite not expired (48-hour expiry)
3. Check email matches invitee

### Multiple owners issue
Should not happen - DB trigger prevents this. Check with:
```sql
SELECT o.org_slug, COUNT(*) as owner_count
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.org_id
WHERE om.role = 'owner' AND om.status = 'active'
GROUP BY o.org_slug
HAVING COUNT(*) > 1;
```

---

## Quick Reference

```
/user-mgmt users stage              # List users
/user-mgmt user stage john@test.com # Get user details
/user-mgmt members stage acme_corp  # List org members
/user-mgmt invites stage acme_corp  # List pending invites
/user-mgmt roles stage acme_corp    # Show role distribution
/user-mgmt auth-check stage         # Check auth health
```

## Related Docs

- [User Management](00-requirements-specs/01_USER_MANAGEMENT.md)
- [Security](00-requirements-specs/05_SECURITY.md)

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing)

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| Org Slug | **Query from DB** (see `.claude/debug-config.md`) |

**Example queries with debug account:**
```sql
-- Get user details
/user-mgmt user stage demo@cloudact.ai

-- List org members (query org_slug from Supabase first)
/user-mgmt members stage acme_inc_01062026
```

See `.claude/debug-config.md` for full debug configuration.
