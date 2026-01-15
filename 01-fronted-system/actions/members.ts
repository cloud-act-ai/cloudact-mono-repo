"use server"

/**
 * Member Management Server Actions
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Input Validation: isValidOrgSlug(), isValidEmail()
 * 2. Rate Limiting: checkInviteRateLimit() - 10 invites/hour per user
 * 3. Pagination: MAX_MEMBERS_PER_PAGE (100), MAX_INVITES_PER_PAGE (50)
 * 4. Authorization: Owner-only for invites, role changes, removals
 *
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { randomBytes } from "crypto"
import { sendInviteEmail } from "@/lib/email"

// OrgSlug validation - prevent path traversal and injection
// Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

// SCALE-002 + MT-001 FIX: Use Supabase-backed rate limiting instead of in-memory Map
// In-memory rate limiting doesn't work across serverless instances
// Also now org-scoped to prevent cross-org rate limit conflicts
const INVITE_RATE_LIMIT = 10 // Max invites per window
const INVITE_RATE_WINDOW = 3600 // 1 hour in seconds

/**
 * Check if user is rate limited for invite operations.
 * Uses Supabase-backed rate limiting that works across serverless instances.
 * MT-001 FIX: Rate limit is now org-scoped (userId + orgSlug)
 */
async function checkInviteRateLimit(userId: string, orgSlug?: string): Promise<boolean> {
  if (!userId || typeof userId !== "string") {
    return false
  }

  try {
    const adminClient = createServiceRoleClient()

    // MT-001 FIX: Include orgSlug in action_type for org-scoped rate limiting
    const actionType = orgSlug ? `invite_${orgSlug}` : "invite"

    // Call the Supabase function for atomic rate limit check
    const { data, error } = await adminClient.rpc("check_rate_limit", {
      p_user_id: userId,
      p_action_type: actionType,
      p_max_requests: INVITE_RATE_LIMIT,
      p_window_seconds: INVITE_RATE_WINDOW,
    })

    if (error) {
      // On error, allow request but log warning (fail open)
      console.warn("[Members] Rate limit check failed, allowing request:", error.message)
      return true
    }

    return data === true
  } catch (rateLimitError) {
    // On error, allow request but log warning
    console.warn("[Members] Rate limit check error:", rateLimitError)
    return true
  }
}

// Fetch all members and invites for an organization
export async function fetchMembersData(orgSlug: string) {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get org data using service role
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, plan, seat_limit, billing_status")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Get current user's role
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership) {
      return { success: false, error: "Not a member of this organization" }
    }

    // Get all members (with pagination to prevent large data fetches)
    const MAX_MEMBERS_PER_PAGE = 100
    const { data: membersData, error: membersError } = await adminClient
      .from("organization_members")
      .select("id, user_id, role, status, joined_at")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(MAX_MEMBERS_PER_PAGE)

    if (membersError) {
      return { success: false, error: "Failed to fetch members" }
    }

    // Fetch profiles for all member user_ids
    const userIds = membersData?.map((m) => m.user_id) || []
    let profilesData: Array<{ id: string; email: string; full_name: string | null }> | null = null
    if (userIds.length > 0) {
      const { data } = await adminClient
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds)
        .limit(100) // Match member pagination limit
      profilesData = data
    }

    // Create Map for O(1) profile lookups (instead of O(n²) find)
    const profileMap = new Map(
      profilesData?.map((p) => [p.id, p]) || []
    )

    // Merge profiles into members - O(n) with Map lookup
    const membersWithProfiles = (membersData || []).map((member) => ({
      ...member,
      profiles: profileMap.get(member.user_id) || null,
    }))

    // Get pending invites (with pagination)
    const MAX_INVITES_PER_PAGE = 50
    const { data: invitesData, error: invitesError } = await adminClient
      .from("invites")
      .select("id, email, role, status, created_at, expires_at")
      .eq("org_id", org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_INVITES_PER_PAGE)

    if (invitesError) {
      return { success: false, error: "Failed to fetch invites" }
    }

    // PERF-001 FIX: Only run count query if we hit the pagination limit
    let totalMemberCount = membersWithProfiles.length
    let hasMoreMembers = false

    if (membersWithProfiles.length >= MAX_MEMBERS_PER_PAGE) {
      const { count } = await adminClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "active")

      totalMemberCount = count || membersWithProfiles.length
      hasMoreMembers = totalMemberCount > MAX_MEMBERS_PER_PAGE
    }

    return {
      success: true,
      data: {
        organization: org,
        userRole: membership.role,
        members: membersWithProfiles,
        invites: invitesData || [],
        pagination: {
          totalMembers: totalMemberCount,
          hasMoreMembers,
          limit: MAX_MEMBERS_PER_PAGE,
        },
      },
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch data"
    return { success: false, error: errorMessage }
  }
}

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}

// Only owner can invite - and can only invite as collaborator or read_only (not owner)
export async function inviteMember(orgSlug: string, email: string, role: "collaborator" | "read_only") {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    // Validate email format
    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      return { success: false, error: "Invalid email address format" }
    }

    // Runtime role validation
    const validRoles = ["collaborator", "read_only"] as const
    if (!validRoles.includes(role)) {
      return { success: false, error: "Invalid role specified" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Rate limit check (SCALE-002 + MT-001: now Supabase-backed and org-scoped)
    if (!(await checkInviteRateLimit(user.id, orgSlug))) {
      return { success: false, error: "Too many invites. Please try again later." }
    }

    // Get inviter's profile for email
    const { data: inviterProfile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()

    const inviterName = inviterProfile?.full_name || inviterProfile?.email || "A team member"

    // Get organization using service role
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, org_name, plan, seat_limit")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Check if user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { success: false, error: "Only the owner can invite members" }
    }

    // Check current member count
    const { count: currentMembers } = await adminClient
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active")

    // Also count pending invites - they reserve seats
    const { count: pendingInvites } = await adminClient
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "pending")

    if (!org.seat_limit) {
      return { success: false, error: "Organization seat limit not configured. Please contact support." }
    }
    const seatLimit = org.seat_limit
    const totalReserved = (currentMembers || 0) + (pendingInvites || 0)

    if (totalReserved >= seatLimit) {
      const pendingCount = pendingInvites || 0
      const memberCount = currentMembers || 0
      return {
        success: false,
        error: pendingCount > 0
          ? `Seat limit reached (${memberCount} members + ${pendingCount} pending invites = ${totalReserved}/${seatLimit} seats). Cancel pending invites or upgrade your plan.`
          : `Seat limit reached (${seatLimit} seats). Upgrade your plan to add more members.`,
      }
    }

    // Check if email is already a member (check by email in profiles)
    // Use normalizedEmail for case-insensitive comparison
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle()

    if (existingProfile) {
      const { data: existingMember } = await adminClient
        .from("organization_members")
        .select("id, status")
        .eq("org_id", org.id)
        .eq("user_id", existingProfile.id)
        .maybeSingle()

      if (existingMember && existingMember.status === "active") {
        return { success: false, error: "User is already a member of this organization" }
      }
    }

    // Check if there's already a pending invite (case-insensitive)
    const { data: existingInvite } = await adminClient
      .from("invites")
      .select("id, status")
      .eq("org_id", org.id)
      .ilike("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvite) {
      return { success: false, error: "An invite is already pending for this email" }
    }

    // Create invite token
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 48) // 48 hour expiry

    // Insert invite using adminClient to bypass RLS
    // Use normalizedEmail to ensure consistent case for lookups
    // IDEM-001 FIX: Handle unique constraint violation for concurrent requests
    const { error: inviteError } = await adminClient
      .from("invites")
      .insert({
        org_id: org.id,
        email: normalizedEmail,
        role,
        token,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
        status: "pending",
      })
      .select()
      .single()

    if (inviteError) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (inviteError.code === "23505" || inviteError.message?.includes("duplicate") || inviteError.message?.includes("unique")) {
        return { success: false, error: "An invite is already pending for this email" }
      }
      return { success: false, error: "Failed to create invite" }
    }

    // Generate invite link for display
    // Require NEXT_PUBLIC_APP_URL in production to prevent localhost links
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : null)
    if (!appUrl) {
      return { success: false, error: "Application URL not configured. Please contact support." }
    }
    const inviteLink = `${appUrl}/invite/${token}`

    // Send invite email via SMTP
    // ERR-001 FIX: Check email send result and inform user
    console.log(`[inviteMember] Attempting to send invite email to ${normalizedEmail}...`)
    console.log(`[inviteMember] Invite link: ${inviteLink}`)
    console.log(`[inviteMember] Inviter: ${inviterName}, Org: ${org.org_name}, Role: ${role}`)

    const emailSent = await sendInviteEmail({
      to: normalizedEmail,
      inviterName,
      orgName: org.org_name,
      role,
      inviteLink,
    })

    console.log(`[inviteMember] Email send result: ${emailSent ? "SUCCESS" : "FAILED"}`)

    if (!emailSent) {
      console.warn(`[inviteMember] Email failed to send to ${normalizedEmail} for org ${orgSlug}`)
    }

    return {
      success: true,
      inviteLink,
      emailSent,
      message: emailSent
        ? "Invite sent successfully"
        : "Invite created but email delivery failed. Please share the invite link manually.",
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to invite member"
    return { success: false, error: errorMessage }
  }
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid)
}

// Invite token validation (64 hex chars from randomBytes(32).toString("hex"))
function isValidInviteToken(token: string): boolean {
  if (!token || typeof token !== "string") return false
  // Token should be exactly 64 hex characters
  return /^[0-9a-f]{64}$/i.test(token)
}

export async function removeMember(orgSlug: string, memberUserId: string) {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    // Validate memberUserId is a valid UUID
    if (!isValidUUID(memberUserId)) {
      return { success: false, error: "Invalid member ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const { data: org } = await adminClient.from("organizations").select("id").eq("org_slug", orgSlug).single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Check if user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership || membership.role !== "owner") {
      return { success: false, error: "Only the owner can remove members" }
    }

    // Can't remove yourself (owner)
    if (memberUserId === user.id) {
      return { success: false, error: "You cannot remove yourself as the owner" }
    }

    // SECURITY: Verify member exists in THIS org before updating
    // Prevents cross-tenant manipulation if attacker knows user IDs from other orgs
    const { data: targetMember } = await adminClient
      .from("organization_members")
      .select("id, role")
      .eq("org_id", org.id)
      .eq("user_id", memberUserId)
      .eq("status", "active")
      .single()

    if (!targetMember) {
      return { success: false, error: "Member not found in this organization" }
    }

    // Can't remove another owner (safety check)
    if (targetMember.role === "owner") {
      return { success: false, error: "Cannot remove an owner. Transfer ownership first." }
    }

    // Update member status to inactive
    const { error: updateError } = await adminClient
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("id", targetMember.id)  // Use verified ID for atomic update

    if (updateError) {
      return { success: false, error: "Failed to remove member" }
    }

    return { success: true, message: "Member removed successfully" }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to remove member"
    return { success: false, error: errorMessage }
  }
}

export async function updateMemberRole(
  orgSlug: string,
  memberUserId: string,
  newRole: "collaborator" | "read_only",
) {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    // Validate memberUserId is a valid UUID
    if (!isValidUUID(memberUserId)) {
      return { success: false, error: "Invalid member ID" }
    }

    // Runtime role validation - prevent setting owner via this function
    const validRoles = ["collaborator", "read_only"] as const
    if (!validRoles.includes(newRole)) {
      return { success: false, error: "Invalid role. Only 'collaborator' or 'read_only' allowed." }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const { data: org } = await adminClient.from("organizations").select("id").eq("org_slug", orgSlug).single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Check if user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership || membership.role !== "owner") {
      return { success: false, error: "Only the owner can change member roles" }
    }

    // Can't change your own role (owner)
    if (memberUserId === user.id) {
      return { success: false, error: "You cannot change your own role as the owner" }
    }

    // SECURITY: Verify member exists in THIS org before updating
    // Prevents cross-tenant manipulation if attacker knows user IDs from other orgs
    const { data: targetMember } = await adminClient
      .from("organization_members")
      .select("id, role")
      .eq("org_id", org.id)
      .eq("user_id", memberUserId)
      .eq("status", "active")
      .single()

    if (!targetMember) {
      return { success: false, error: "Member not found in this organization" }
    }

    // Can't change another owner's role (safety check)
    if (targetMember.role === "owner") {
      return { success: false, error: "Cannot change an owner's role. Transfer ownership instead." }
    }

    // Update member role using verified ID (atomic update)
    const { error: updateError } = await adminClient
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", targetMember.id)

    if (updateError) {
      return { success: false, error: "Failed to update member role" }
    }

    return { success: true, message: "Member role updated successfully" }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to update member role"
    return { success: false, error: errorMessage }
  }
}

// Accept an invite by token - used by invited users
export async function acceptInvite(token: string) {
  try {
    // Validate token format before database query
    if (!isValidInviteToken(token)) {
      return { success: false, error: "Invalid invite link" }
    }

    // EDGE-001 FIX: Normalize token to lowercase for consistent DB lookup
    const normalizedToken = token.toLowerCase()

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return { success: false, error: "Not authenticated", requiresAuth: true }
    }

    // Fetch the invite and validate it
    const { data: invite, error: fetchError } = await adminClient
      .from("invites")
      .select("id, org_id, email, role, expires_at, status")
      .eq("token", normalizedToken)
      .maybeSingle()

    if (fetchError) {
      return { success: false, error: "Failed to process invite" }
    }

    if (!invite) {
      return { success: false, error: "Invalid invite link" }
    }

    // Check invite status
    if (invite.status !== "pending") {
      return { success: false, error: `This invite has already been ${invite.status}` }
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      // Mark as expired in database (non-blocking, log errors)
      const { error: expireError } = await adminClient.from("invites").update({ status: "expired" }).eq("id", invite.id)
      if (expireError) {
        console.warn("[acceptInvite] Failed to mark invite as expired:", expireError.message)
      }
      return { success: false, error: "This invite has expired. Please ask the organization owner for a new invite." }
    }

    // Verify email matches (case-insensitive)
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return {
        success: false,
        error: `This invite was sent to ${invite.email}. Please sign in with that email address.`,
      }
    }

    // Check if user is already a member
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id, status")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingMember && existingMember.status === "active") {
      // Update invite status to accepted (non-blocking, log errors)
      const { error: acceptError } = await adminClient.from("invites").update({ status: "accepted" }).eq("id", invite.id)
      if (acceptError) {
        console.warn("[acceptInvite] Failed to mark invite as accepted:", acceptError.message)
      }
      return { success: false, error: "You are already a member of this organization" }
    }

    // SECURITY: Enforce seat limit at acceptance time
    // This is critical because seats may have been filled between invite creation and acceptance
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, org_slug, seat_limit")
      .eq("id", invite.org_id)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    if (!org.seat_limit) {
      return { success: false, error: "Organization seat limit not configured. Please contact support." }
    }

    // RACE-001 FIX: Application-level check for better UX error messages
    // Note: Database trigger `enforce_seat_limit` provides atomic protection against race conditions
    // This pre-check gives users a clear error message before the insert attempt
    const { count: currentMembers } = await adminClient
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", invite.org_id)
      .eq("status", "active")

    // Pre-check for better UX (actual enforcement is done by database trigger)
    if (!existingMember && (currentMembers || 0) >= org.seat_limit) {
      return {
        success: false,
        error: `Seat limit reached (${org.seat_limit} seats). The organization owner needs to upgrade the plan to add more members.`,
      }
    }

    // If previously inactive, reactivate (also check seat limit for reactivation)
    if (existingMember && existingMember.status === "inactive") {
      // Check if reactivation would exceed seat limit
      if ((currentMembers || 0) >= org.seat_limit) {
        return {
          success: false,
          error: `Seat limit reached (${org.seat_limit} seats). The organization owner needs to upgrade the plan to add more members.`,
        }
      }

      const { error: reactivateError } = await adminClient
        .from("organization_members")
        .update({ status: "active", role: invite.role })
        .eq("id", existingMember.id)

      if (reactivateError) {
        // Check if it's a seat limit error from database trigger
        if (reactivateError.message?.includes("Seat limit")) {
          return { success: false, error: reactivateError.message }
        }
        return { success: false, error: "Failed to rejoin organization" }
      }
    } else if (!existingMember) {
      // Create new membership
      const { error: memberError } = await adminClient.from("organization_members").insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
        status: "active",
      })

      if (memberError) {
        // Check if it's a seat limit error from database trigger
        if (memberError.message?.includes("Seat limit")) {
          return { success: false, error: memberError.message }
        }
        return { success: false, error: "Failed to join organization" }
      }
    }

    // Update invite status to accepted (non-blocking, log errors)
    const { error: finalAcceptError } = await adminClient.from("invites").update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", invite.id)
    if (finalAcceptError) {
      console.warn("[acceptInvite] Failed to update invite status:", finalAcceptError.message)
    }

    return {
      success: true,
      message: "You have joined the organization!",
      orgSlug: org.org_slug || null,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to accept invite"
    return { success: false, error: errorMessage }
  }
}

// Get invite info by token (for displaying invite page)
export async function getInviteInfo(token: string) {
  try {
    // Validate token format before database query
    if (!isValidInviteToken(token)) {
      return { success: false, error: "Invalid invite link format. Please check the link and try again." }
    }

    // EDGE-001 FIX: Normalize token to lowercase for consistent DB lookup
    const normalizedToken = token.toLowerCase()

    const adminClient = createServiceRoleClient()

    // First, fetch the invite without the join to get better error context
    const { data: invite, error: inviteError } = await adminClient
      .from("invites")
      .select("id, email, role, status, expires_at, created_at, org_id")
      .eq("token", normalizedToken)
      .maybeSingle()

    if (inviteError) {
      return { success: false, error: "Failed to fetch invite. Please try again." }
    }

    if (!invite) {
      return { success: false, error: "This invite link is invalid or has been removed." }
    }

    // Now fetch the organization separately
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, org_name, org_slug")
      .eq("id", invite.org_id)
      .single()

    if (orgError || !org) {
      return { success: false, error: "The organization for this invite no longer exists." }
    }

    return {
      success: true,
      data: {
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
        isExpired: new Date(invite.expires_at) < new Date(),
        organization: {
          name: org.org_name,
          slug: org.org_slug,
        },
      },
    }
  } catch (inviteError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getInviteInfo] Failed to fetch invite:", inviteError)
    }
    return { success: false, error: "Failed to fetch invite. Please try again." }
  }
}

export async function cancelInvite(orgSlug: string, inviteId: string) {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    // Validate inviteId is a valid UUID to prevent injection
    if (!isValidUUID(inviteId)) {
      return { success: false, error: "Invalid invite ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const { data: org } = await adminClient.from("organizations").select("id").eq("org_slug", orgSlug).single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Verify user is owner before canceling
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { success: false, error: "Only the owner can cancel invites" }
    }

    // ERR-002 FIX: Verify invite exists and was actually updated
    const { data: updatedInvite, error: updateError } = await adminClient
      .from("invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("org_id", org.id)
      .eq("status", "pending") // Only revoke pending invites
      .select("id")
      .maybeSingle()

    if (updateError) {
      return { success: false, error: "Failed to cancel invite" }
    }

    if (!updatedInvite) {
      return { success: false, error: "Invite not found or already processed" }
    }

    return { success: true, message: "Invite canceled successfully" }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to cancel invite"
    return { success: false, error: errorMessage }
  }
}

/**
 * Resend an invite with a new token
 * Generates fresh token, extends expiry, and sends new email
 */
export async function resendInvite(orgSlug: string, inviteId: string) {
  try {
    // Validate orgSlug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    // Validate inviteId is a valid UUID to prevent injection
    if (!isValidUUID(inviteId)) {
      return { success: false, error: "Invalid invite ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get organization details
    const { data: org } = await adminClient
      .from("organizations")
      .select("id, org_name")
      .eq("org_slug", orgSlug)
      .single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Verify user is owner before resending
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { success: false, error: "Only the owner can resend invites" }
    }

    // Get the existing pending invite
    const { data: existingInvite, error: fetchError } = await adminClient
      .from("invites")
      .select("id, email, role, invited_by")
      .eq("id", inviteId)
      .eq("org_id", org.id)
      .eq("status", "pending")
      .maybeSingle()

    if (fetchError || !existingInvite) {
      return { success: false, error: "Invite not found or already processed" }
    }

    // Generate new token and expiry
    const newToken = randomBytes(32).toString("hex")
    const newExpiresAt = new Date()
    newExpiresAt.setHours(newExpiresAt.getHours() + 48) // 48 hour expiry

    // Update invite with new token and expiry
    const { error: updateError } = await adminClient
      .from("invites")
      .update({
        token: newToken,
        expires_at: newExpiresAt.toISOString(),
      })
      .eq("id", inviteId)
      .eq("org_id", org.id)
      .eq("status", "pending")

    if (updateError) {
      return { success: false, error: "Failed to regenerate invite token" }
    }

    // Generate new invite link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : null)
    if (!appUrl) {
      return { success: false, error: "Application URL not configured. Please contact support." }
    }
    const inviteLink = `${appUrl}/invite/${newToken}`

    // Get inviter name for email
    const { data: inviterProfile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()

    const inviterName = inviterProfile?.full_name || inviterProfile?.email?.split("@")[0] || "A team member"

    // Send new invite email
    console.log(`[resendInvite] Preparing to send email...`)
    console.log(`[resendInvite] To: ${existingInvite.email}`)
    console.log(`[resendInvite] Inviter: ${inviterName}`)
    console.log(`[resendInvite] Org: ${org.org_name}`)
    console.log(`[resendInvite] Role: ${existingInvite.role}`)
    console.log(`[resendInvite] Link: ${inviteLink}`)

    const emailSent = await sendInviteEmail({
      to: existingInvite.email,
      inviterName,
      orgName: org.org_name,
      role: existingInvite.role,
      inviteLink,
    })

    console.log(`[resendInvite] Email send result: ${emailSent ? "SUCCESS" : "FAILED"}`)

    if (!emailSent) {
      console.warn(`[resendInvite] Email failed to send to ${existingInvite.email} for org ${orgSlug}`)
    }

    return {
      success: true,
      inviteLink,
      emailSent,
      message: emailSent
        ? "Invite resent successfully with new link"
        : "Invite regenerated but email delivery failed. Please share the invite link manually.",
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to resend invite"
    return { success: false, error: errorMessage }
  }
}
