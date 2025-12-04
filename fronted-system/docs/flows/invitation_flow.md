# Invitation Flow

This document describes the team member invitation flow including sending invites, accepting invites, and managing team members.

## Overview

```
Org Owner              Frontend              Supabase           Invited User
    │                     │                     │                    │
    ├── Invite Member ────┤                     │                    │
    │                     │                     │                    │
    │                     ├── inviteMember() ───┤                    │
    │                     │                     │                    │
    │                     │   [Rate limit check]│                    │
    │                     │   [Seat limit check]│                    │
    │                     │   [Existing check]  │                    │
    │                     │                     │                    │
    │                     │                     ├── INSERT invite ───┤
    │                     │                     │                    │
    │                     ├── sendInviteEmail() │                    │
    │                     │                     │                    │
    │◄── Invite Link ─────┤                     │                    │
    │                     │                     │                    │
    │                     │                     │◄── Click link ─────┤
    │                     │                     │                    │
    │                     │◄── getInviteInfo() ─┤                    │
    │                     │                     │                    │
    │                     │                     │◄── acceptInvite() ─┤
    │                     │                     │                    │
    │                     │                     ├── INSERT member ───┤
    │                     │                     │                    │
    │                     │                     ├── UPDATE invite ───┤
    │                     │                     │   (status=accepted)│
```

## Endpoints

### Frontend Server Actions (`actions/members.ts`)

| Function | Description | Auth | Rate Limit |
|----------|-------------|------|------------|
| `fetchMembersData(orgSlug)` | Get members and pending invites | User session + Member | - |
| `inviteMember(orgSlug, email, role)` | Send invite to new member | User session + Owner | 10/hour |
| `removeMember(orgSlug, memberUserId)` | Remove member from org | User session + Owner | - |
| `updateMemberRole(orgSlug, memberUserId, role)` | Change member's role | User session + Owner | - |
| `acceptInvite(token)` | Accept pending invite | User session | - |
| `getInviteInfo(token)` | Get invite details for display | Public | - |
| `cancelInvite(orgSlug, inviteId)` | Revoke pending invite | User session + Owner | - |

## Flows

### 1. Send Invitation

**Trigger:** Owner clicks "Invite Member" button

**Flow:**
1. Owner enters email and selects role (`collaborator` or `read_only`)
2. Frontend calls `inviteMember(orgSlug, email, role)`
3. Validations:
   - User is authenticated
   - Rate limit check (10 invites/hour per user)
   - User is org owner
   - Seat limit not exceeded
   - Email not already a member
   - No pending invite for email
4. Generate secure token (32 bytes, hex encoded)
5. Insert invite record in Supabase (48-hour expiry)
6. Send invite email via SMTP
7. Return invite link for display

**Key Code:**
```typescript
// actions/members.ts:165-343
export async function inviteMember(orgSlug: string, email: string, role: "collaborator" | "read_only") {
  // Rate limit check
  if (!checkInviteRateLimit(user.id)) {
    return { success: false, error: "Too many invites. Please try again later." }
  }

  // Seat limit check
  if ((currentMembers || 0) >= seatLimit) {
    return { success: false, error: `Seat limit reached (${seatLimit} seats).` }
  }

  // Create invite token
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 48)

  // Insert invite
  await adminClient.from("invites").insert({
    org_id: org.id,
    email,
    role,
    token,
    invited_by: user.id,
    expires_at: expiresAt.toISOString(),
    status: "pending",
  })

  // Send email
  await sendInviteEmail({ to: email, inviteLink })
}
```

### 2. View Invite (Pre-Accept)

**Trigger:** User clicks invite link `/invite/{token}`

**Flow:**
1. Page loads and calls `getInviteInfo(token)`
2. Fetches invite with org details
3. Returns:
   - Email, role, status
   - Expiry status
   - Organization name/slug
4. Page displays invite details and accept button

**Key Code:**
```typescript
// actions/members.ts:637-686
export async function getInviteInfo(token: string) {
  const { data: invite } = await adminClient
    .from("invites")
    .select(`
      id, email, role, status, expires_at,
      organizations!inner(id, org_name, org_slug)
    `)
    .eq("token", token)
    .single()

  return {
    email: invite.email,
    role: invite.role,
    status: invite.status,
    isExpired: new Date(invite.expires_at) < new Date(),
    organization: {
      name: orgData.org_name,
      slug: orgData.org_slug,
    },
  }
}
```

### 3. Accept Invitation

**Trigger:** User clicks "Accept Invite" button

**Flow:**
1. User must be logged in (redirect to login if not)
2. Frontend calls `acceptInvite(token)`
3. Validations:
   - Invite exists and is pending
   - Invite not expired
   - User's email matches invite email (case-insensitive)
   - User not already a member
4. Create membership record OR reactivate if previously removed
5. Update invite status to "accepted"
6. Return org slug for redirect

**Key Code:**
```typescript
// actions/members.ts:529-634
export async function acceptInvite(token: string) {
  // Verify email matches
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      success: false,
      error: `This invite was sent to ${invite.email}. Please sign in with that email address.`,
    }
  }

  // Create or reactivate membership
  if (existingMember?.status === "inactive") {
    await adminClient.from("organization_members")
      .update({ status: "active", role: invite.role })
      .eq("id", existingMember.id)
  } else {
    await adminClient.from("organization_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
      status: "active",
    })
  }

  // Mark invite as accepted
  await adminClient.from("invites")
    .update({ status: "accepted" })
    .eq("id", invite.id)
}
```

### 4. Remove Member

**Trigger:** Owner clicks remove on member row

**Flow:**
1. Frontend calls `removeMember(orgSlug, memberUserId)`
2. Validations:
   - User is authenticated
   - User is org owner
   - Cannot remove yourself
   - Cannot remove another owner
   - Member exists in this org
3. Set member status to "inactive" (soft delete)

**Key Code:**
```typescript
// actions/members.ts:352-433
export async function removeMember(orgSlug: string, memberUserId: string) {
  // Cannot remove yourself
  if (memberUserId === user.id) {
    return { success: false, error: "You cannot remove yourself as the owner" }
  }

  // Cannot remove another owner
  if (targetMember.role === "owner") {
    return { success: false, error: "Cannot remove an owner. Transfer ownership first." }
  }

  // Soft delete
  await adminClient.from("organization_members")
    .update({ status: "inactive" })
    .eq("id", targetMember.id)
}
```

### 5. Update Member Role

**Trigger:** Owner changes role dropdown

**Flow:**
1. Frontend calls `updateMemberRole(orgSlug, memberUserId, newRole)`
2. Validations:
   - User is org owner
   - Cannot change own role
   - Cannot change another owner's role
   - Role must be `collaborator` or `read_only` (not `owner`)
3. Update member role

**Key Code:**
```typescript
// actions/members.ts:435-526
export async function updateMemberRole(orgSlug, memberUserId, newRole) {
  // Validate role - cannot set to owner via this function
  const validRoles = ["collaborator", "read_only"]
  if (!validRoles.includes(newRole)) {
    return { success: false, error: "Invalid role" }
  }

  await adminClient.from("organization_members")
    .update({ role: newRole })
    .eq("id", targetMember.id)
}
```

### 6. Cancel Invite

**Trigger:** Owner clicks cancel on pending invite

**Flow:**
1. Frontend calls `cancelInvite(orgSlug, inviteId)`
2. Verify user is owner
3. Update invite status to "revoked"

## Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full access, billing, invite members, delete org |
| `collaborator` | Run pipelines, view data, manage integrations |
| `read_only` | View dashboards and reports only |

## Invite Status

| Status | Description |
|--------|-------------|
| `pending` | Invite sent, waiting for acceptance |
| `accepted` | User accepted and joined org |
| `revoked` | Owner canceled the invite |
| `expired` | 48-hour TTL exceeded |

## Security Measures

1. **Rate Limiting**: 10 invites per user per hour
2. **Email Validation**: RFC 5322 compliant regex
3. **Org Slug Validation**: Alphanumeric + underscores only
4. **UUID Validation**: Member IDs validated before use
5. **Cross-Tenant Protection**: Verify member exists in THIS org before modifying
6. **Soft Delete**: Members set to inactive, not deleted
7. **Role Restrictions**: Cannot set `owner` via updateMemberRole

## Database Tables

### `invites`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | Organization FK |
| `email` | TEXT | Invited email |
| `role` | TEXT | `collaborator` or `read_only` |
| `token` | TEXT | Secure invite token |
| `invited_by` | UUID | User who sent invite |
| `status` | TEXT | `pending`, `accepted`, `revoked` |
| `expires_at` | TIMESTAMP | 48 hours from creation |

### `organization_members`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | Organization FK |
| `user_id` | UUID | User FK |
| `role` | TEXT | `owner`, `collaborator`, `read_only` |
| `status` | TEXT | `active`, `inactive` |
| `joined_at` | TIMESTAMP | When user joined |

## Files

| File | Purpose |
|------|---------|
| `actions/members.ts` | Server actions for member management |
| `lib/email.ts` | Email sending with `sendInviteEmail()` |
| `app/[orgSlug]/settings/members/page.tsx` | Members management UI |
| `app/invite/[token]/page.tsx` | Invite acceptance page |
