# User Management

**v2.3** | 2026-02-05

> Supabase Auth + RBAC for teams

---

## User Lifecycle Workflow

```
1. Owner signs up → Supabase auth + org created
2. Owner invites member → Email sent with 48h token
3. Member accepts → Account created, added to org
4. Role assigned → owner / collaborator / read_only
5. Member manages → Settings → Members page
```

---

## Routes

| Route | Purpose |
|-------|---------|
| `/signup` | Create account + org |
| `/login` | Sign in |
| `/{org}/settings/members` | Team management |

---

## Roles & Permissions

| Role | Billing | Members | Integrations | Pipelines |
|------|---------|---------|--------------|-----------|
| owner | Full | Full | Full | Full |
| collaborator | View only | View only | Full | Full |
| read_only | None | None | View only | View only |

**Standards:**
- 1 owner per org — transfer required before leaving
- Seat limits enforced per plan (Starter: 2, Professional: 6, Scale: 11)
- Owner cannot be removed — must transfer ownership first

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `auth.users` | Supabase auth (email, password hash) |
| `profiles` | Extended user data (name, avatar) |
| `organizations` | Org metadata (name, slug, currency) |
| `organization_members` | User ↔ Org mapping with role |
| `invites` | Pending invitations with token + expiry |

---

## Team Invite Standard

- Owner sends invite → email notification
- Token valid for **48 hours**
- Seat limit checked before invite creation
- Duplicate email check (already member = rejected)
- Rate limit: 10 invites per hour per org

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/members.ts` | Team management actions |
| `01-fronted-system/actions/account.ts` | Account actions |
| `01-fronted-system/app/[orgSlug]/settings/members/` | Members UI |
