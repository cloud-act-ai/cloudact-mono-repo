# User Management

**v2.2** | 2026-01-15

> Supabase Auth + RBAC for teams

---

## Routes

| Route | Purpose |
|-------|---------|
| `/signup` | Create account |
| `/login` | Sign in |
| `/{org}/settings/members` | Team management |

---

## Roles

| Role | Billing | Members | Integrations | Pipelines |
|------|---------|---------|--------------|-----------|
| owner | ✓ | ✓ | ✓ | ✓ |
| collaborator | ✗ | ✗ | ✓ | ✓ |
| read_only | ✗ | ✗ | ✗ | ✓ (view) |

**1 owner per org** - transfer required before leaving

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `auth.users` | Supabase auth |
| `profiles` | Extended user data |
| `organizations` | Org metadata |
| `organization_members` | User ↔ Org |
| `invites` | Pending invites |

---

## Team Invites

- Owner invites → Email → Accept → Member added
- 48-hour token expiry
- Seat limit per plan

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/members.ts` | Team actions |
| `01-fronted-system/actions/account.ts` | Account actions |
