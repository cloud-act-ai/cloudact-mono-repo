# User Management

**v2.4** | 2026-02-08

> Supabase Auth + RBAC for teams

---

## User Lifecycle Workflow

```
1. Owner signs up → Supabase auth + org created
2. Owner invites member → Email sent with 48h token
3. Member accepts → Account created, added to org
4. Role assigned → owner / collaborator / read_only
5. Member manages → Settings → Invite page
```

---

## Routes

| Route | Purpose |
|-------|---------|
| `/signup` | Create account + org |
| `/login` | Sign in (with rate limiting + redirect validation) |
| `/{org}/settings/organization` | Organization settings |
| `/{org}/settings/personal` | Personal profile settings |
| `/{org}/settings/invite` | Team invite management |
| `/{org}/settings/security` | Security settings |
| `/{org}/settings/members` | Redirects to invite page |

---

## Login Security

| Feature | Implementation |
|---------|----------------|
| Rate limiting | `loginWithSecurity` server action enforces rate limits |
| Open redirect prevention | Validates redirect URLs to prevent malicious redirects |
| Session expiry detection | Reason codes: `session_expired`, `auth_error`, `account_locked` |
| Failed login handling | Progressive delays on repeated failures |

---

## Settings Pages

| Page | Purpose | Key File |
|------|---------|----------|
| Organization | Org-level settings (name, currency, timezone, billing) | `settings/organization/page.tsx` |
| Personal | User profile (name, email, avatar, preferences) | `settings/personal/page.tsx` |
| Invite | Team member invitations and management | `settings/invite/page.tsx` |
| Security | Password changes, session management | `settings/security/page.tsx` |
| Members | Redirects to invite page | `settings/members/` |

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
| `organization_members` | User <-> Org mapping with role |
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
| `01-fronted-system/actions/login.ts` | Login with security (rate limiting, redirect validation) |
| `01-fronted-system/app/[orgSlug]/settings/organization/` | Organization settings UI |
| `01-fronted-system/app/[orgSlug]/settings/personal/` | Personal settings UI |
| `01-fronted-system/app/[orgSlug]/settings/invite/` | Invite/members UI |
| `01-fronted-system/app/[orgSlug]/settings/security/` | Security settings UI |
