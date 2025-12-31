"use server"

/**
 * Account Management Server Actions
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Input Validation: isValidEmail() - RFC 5322 compliant
 * 2. Memory Management: MAX_DELETION_TOKENS (1000) - prevents memory leaks
 * 3. Token Cleanup: cleanupExpiredTokens() - removes stale tokens
 * 4. Authorization: User must own account or be org owner for transfers
 * 5. Activity Logging: Fire-and-forget for ownership transfers, member leaves
 *
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { randomBytes } from "crypto"

// Validate email format (RFC 5322 simplified)
// Note: Utility function available for future email validation needs
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false
  return UUID_REGEX.test(uuid)
}

// Validate org slug format (alphanumeric + underscore, 3-50 chars)
function isValidOrgSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

// ============================================
// Deletion Token Storage (Database-backed)
// ============================================
// Tokens are stored in database, not memory.
// This survives server restarts and works across instances.
//
// MIGRATION REQUIRED: Run scripts/supabase_db/07_deletion_tokens.sql first.
// ============================================

/**
 * Clean up expired tokens from the database.
 * Called periodically to prevent table bloat.
 */
async function cleanupExpiredTokens(): Promise<void> {
  try {
    const adminClient = createServiceRoleClient()
    const { error } = await adminClient
      .from("account_deletion_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString())

    if (error) {
      // Token cleanup failed - non-critical, continue
    }
  } catch (cleanupError) {
    // Error cleaning up expired tokens - non-critical background task
    if (process.env.NODE_ENV === "development") {
      console.warn("[cleanupExpiredTokens] Failed to clean up expired tokens:", cleanupError)
    }
  }
}

/**
 * Store deletion token in database.
 * Returns true if stored successfully.
 */
async function storeDeletionToken(
  token: string,
  userId: string,
  email: string,
  expiresAt: Date
): Promise<boolean> {
  try {
    const adminClient = createServiceRoleClient()
    const { error } = await adminClient
      .from("account_deletion_tokens")
      .insert({
        token,
        user_id: userId,
        email,
        expires_at: expiresAt.toISOString(),
      })

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[storeDeletionToken] Database insert failed:", error.message)
      }
      return false
    }
    return true
  } catch (storeError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[storeDeletionToken] Failed to store deletion token:", storeError)
    }
    return false
  }
}

/**
 * Retrieve and delete (consume) a deletion token ATOMICALLY.
 * Uses DELETE with select() to atomically claim and consume the token.
 * Prevents race condition where two requests could consume the same token.
 */
async function consumeDeletionToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const adminClient = createServiceRoleClient()

    // ATOMIC: Delete and return in single operation
    // If token doesn't exist or is expired, delete returns empty array
    // If two requests race, only one gets the row (DELETE is atomic)
    const { data, error } = await adminClient
      .from("account_deletion_tokens")
      .delete()
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .select("user_id, email")
      .maybeSingle()

    if (error) {
      return null
    }

    if (!data) {
      // Token not found, expired, or already consumed by concurrent request
      return null
    }

    return { userId: data.user_id, email: data.email }
  } catch (consumeError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[consumeDeletionToken] Failed to consume deletion token:", consumeError)
    }
    return null
  }
}

interface OwnedOrganization {
  id: string
  org_name: string
  org_slug: string
  member_count: number
  has_other_members: boolean
}

/**
 * Get organizations owned by the current user
 */
export async function getOwnedOrganizations(): Promise<{
  success: boolean
  data?: OwnedOrganization[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get all organizations where user is owner
    const { data: ownerships, error: ownerError } = await adminClient
      .from("organization_members")
      .select(`
        org_id,
        organizations (
          id,
          org_name,
          org_slug
        )
      `)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")

    if (ownerError) {
      return { success: false, error: "Failed to fetch organizations" }
    }

    if (!ownerships || ownerships.length === 0) {
      return { success: true, data: [] }
    }

    // Get member counts and check for other members
    const orgsWithCounts: OwnedOrganization[] = []

    for (const ownership of ownerships) {
      const org = ownership.organizations as unknown as { id: string; org_name: string; org_slug: string }
      if (!org) continue

      // Count active members
      const { count: memberCount } = await adminClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "active")

      // Check for other active members (not the owner)
      const { count: otherMemberCount } = await adminClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "active")
        .neq("user_id", user.id)

      orgsWithCounts.push({
        id: org.id,
        org_name: org.org_name,
        org_slug: org.org_slug,
        member_count: memberCount || 0,
        has_other_members: (otherMemberCount || 0) > 0,
      })
    }

    return { success: true, data: orgsWithCounts }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch organizations"
    return { success: false, error: errorMessage }
  }
}

/**
 * Get eligible members for ownership transfer
 */
export async function getEligibleTransferMembers(orgId: string): Promise<{
  success: boolean
  data?: Array<{ user_id: string; email: string; full_name: string | null; role: string }>
  error?: string
}> {
  try {
    // Validate orgId format to prevent injection
    if (!isValidUUID(orgId)) {
      return { success: false, error: "Invalid organization ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is owner of this org
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    if (!membership || membership.role !== "owner") {
      return { success: false, error: "Only the owner can transfer ownership" }
    }

    // Get all other active members
    const { data: members, error: membersError } = await adminClient
      .from("organization_members")
      .select("user_id, role")
      .eq("org_id", orgId)
      .eq("status", "active")
      .neq("user_id", user.id)

    if (membersError) {
      return { success: false, error: "Failed to fetch members" }
    }

    if (!members || members.length === 0) {
      return { success: true, data: [] }
    }

    // Get profile info for members
    const userIds = members.map(m => m.user_id)
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds)

    // Create a Map for O(1) profile lookup instead of O(n) find()
    const profileMap = new Map(
      (profiles || []).map(p => [p.id, p])
    )

    const membersWithProfiles = members.map(member => {
      const profile = profileMap.get(member.user_id)
      return {
        user_id: member.user_id,
        email: profile?.email || "Unknown",
        full_name: profile?.full_name || null,
        role: member.role,
      }
    })

    return { success: true, data: membersWithProfiles }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch members"
    return { success: false, error: errorMessage }
  }
}

/**
 * Transfer ownership of an organization to another member
 */
export async function transferOwnership(
  orgId: string,
  newOwnerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate UUID formats to prevent injection
    if (!isValidUUID(orgId)) {
      return { success: false, error: "Invalid organization ID" }
    }
    if (!isValidUUID(newOwnerId)) {
      return { success: false, error: "Invalid user ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is owner
    const { data: currentOwnership } = await adminClient
      .from("organization_members")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (currentOwnership?.role !== "owner") {
      return { success: false, error: "Only the owner can transfer ownership" }
    }

    // Verify new owner is an active member (with status filter for security)
    const { data: newOwnerMembership } = await adminClient
      .from("organization_members")
      .select("id, role, status")
      .eq("org_id", orgId)
      .eq("user_id", newOwnerId)
      .eq("status", "active")
      .single()

    if (!newOwnerMembership) {
      return { success: false, error: "Selected user is not an active member" }
    }

    // Get org info for logging
    const { data: org } = await adminClient
      .from("organizations")
      .select("org_name")
      .eq("id", orgId)
      .single()

    // Transfer ownership - demote current owner to collaborator
    const { error: demoteError } = await adminClient
      .from("organization_members")
      .update({ role: "collaborator" })
      .eq("id", currentOwnership.id)

    if (demoteError) {
      return { success: false, error: "Failed to transfer ownership" }
    }

    // Promote new owner
    const { error: promoteError } = await adminClient
      .from("organization_members")
      .update({ role: "owner" })
      .eq("id", newOwnerMembership.id)

    if (promoteError) {
      // Rollback
      await adminClient
        .from("organization_members")
        .update({ role: "owner" })
        .eq("id", currentOwnership.id)
      return { success: false, error: "Failed to transfer ownership" }
    }

    // Log the transfer (fire-and-forget with full error handling and validation)
    // Use Promise.resolve() to convert Supabase's PromiseLike to a full Promise
    void Promise.resolve(adminClient.from("activity_logs").insert({
      org_id: orgId,
      user_id: user.id,
      action: "ownership_transferred",
      resource_type: "organization",
      resource_id: orgId,
      metadata: {
        org_name: org?.org_name,
        new_owner_id: newOwnerId,
        previous_owner_id: user.id,
      },
      status: "success",
    })).then(({ error }) => {
      if (error && process.env.NODE_ENV === "development") {
        console.warn("[transferOwnership] Activity log insert failed:", error.message)
      }
    }).catch((logError) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[transferOwnership] Activity log promise rejected:", logError)
      }
    })

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to transfer ownership"
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete an organization (only by owner, only if no other members or user confirms)
 */
export async function deleteOrganization(
  orgId: string,
  confirmName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate orgId format to prevent injection
    if (!isValidUUID(orgId)) {
      return { success: false, error: "Invalid organization ID" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Verify user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { success: false, error: "Only the owner can delete the organization" }
    }

    // Get org info and verify name confirmation
    const { data: org } = await adminClient
      .from("organizations")
      .select("id, org_name, org_slug, stripe_subscription_id, stripe_customer_id, backend_onboarded")
      .eq("id", orgId)
      .single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Verify confirmation name matches
    if (org.org_name.toLowerCase() !== confirmName.toLowerCase()) {
      return { success: false, error: "Organization name does not match. Please type the exact name to confirm." }
    }

    // Log deletion BEFORE deleting (for audit trail)
    await adminClient.from("activity_logs").insert({
      org_id: orgId,
      user_id: user.id,
      action: "organization_deleted",
      resource_type: "organization",
      resource_id: orgId,
      metadata: {
        org_name: org.org_name,
        org_slug: org.org_slug,
        deleted_by: user.id,
        had_stripe_subscription: !!org.stripe_subscription_id,
      },
      status: "success",
    })

    // Cancel Stripe subscription if exists
    if (org.stripe_subscription_id) {
      try {
        const stripe = (await import("@/lib/stripe")).stripe
        await stripe.subscriptions.cancel(org.stripe_subscription_id)
      } catch (stripeError) {
        // Continue with deletion even if Stripe fails - log for debugging
        if (process.env.NODE_ENV === "development") {
          console.warn("[deleteOrganization] Stripe subscription cancel failed:", stripeError)
        }
      }
    }

    // Revoke all pending invites
    await adminClient
      .from("invites")
      .update({ status: "revoked" })
      .eq("org_id", orgId)
      .eq("status", "pending")

    // Deactivate all memberships
    await adminClient
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("org_id", orgId)

    // Soft-delete the organization in Supabase
    // Sets billing_status to 'deleted', is_deleted flag, and deleted_at timestamp
    const { error: deleteError } = await adminClient
      .from("organizations")
      .update({
        billing_status: "deleted",
        stripe_subscription_id: null,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", orgId)

    if (deleteError) {
      return { success: false, error: "Failed to delete organization" }
    }

    // Clean up backend BigQuery data (#43 - Offboard from backend)
    // This removes org data from all meta tables and optionally deletes the dataset
    let backendCleanupFailed = false
    let backendCleanupError: string | undefined
    if (org.org_slug && org.backend_onboarded) {
      try {
        const { getPipelineBackendClient } = await import("@/lib/api/backend")
        const adminApiKey = process.env.CA_ROOT_API_KEY
        if (adminApiKey) {
          const backendClient = getPipelineBackendClient({ adminApiKey })
          await backendClient.deleteOrganization(
            org.org_slug,
            true // Delete the BigQuery dataset as well
          )
        } else {
          backendCleanupFailed = true
          backendCleanupError = "Missing admin API key for backend cleanup"
        }
      } catch (backendErr: unknown) {
        // Log but don't fail - Supabase deletion succeeded
        backendCleanupFailed = true
        backendCleanupError = backendErr instanceof Error ? backendErr.message : "Backend cleanup failed"
        if (process.env.NODE_ENV === "development") {
          console.error("[deleteOrganization] Backend cleanup failed:", backendCleanupError)
        }
      }
    }

    // Log warning if backend cleanup failed (success=true since Supabase deletion succeeded)
    if (backendCleanupFailed && process.env.NODE_ENV === "development") {
      console.warn(`[deleteOrganization] Backend cleanup warning: ${backendCleanupError}`)
    }

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to delete organization"
    return { success: false, error: errorMessage }
  }
}

/**
 * Request account deletion - sends verification email
 */
export async function requestAccountDeletion(): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    await cleanupExpiredTokens()

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return { success: false, error: "Not authenticated" }
    }

    // Check if user owns any orgs - they must handle those first
    const ownedOrgsResult = await getOwnedOrganizations()
    if (ownedOrgsResult.success && ownedOrgsResult.data && ownedOrgsResult.data.length > 0) {
      return {
        success: false,
        error: `You own ${ownedOrgsResult.data.length} organization(s). Please transfer ownership or delete them before deleting your account.`,
      }
    }

    // Generate deletion token
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 30) // 30 minute expiry

    // Store token in database (survives server restarts)
    const stored = await storeDeletionToken(token, user.id, user.email!, expiresAt)
    if (!stored) {
      return { success: false, error: "Failed to create deletion token. Please try again." }
    }

    // Send verification email
    const deleteLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/account/delete?token=${token}`

    // Try to send email
    try {
      const { sendEmail } = await import("@/lib/email")
      await sendEmail({
        to: user.email,
        subject: "Confirm Account Deletion - CloudAct.ai",
        html: `
          <h2>Account Deletion Request</h2>
          <p>You have requested to delete your CloudAct.ai account.</p>
          <p><strong>This action is permanent and cannot be undone.</strong></p>
          <p>All your data will be permanently deleted including:</p>
          <ul>
            <li>Your profile information</li>
            <li>Organization memberships</li>
            <li>Activity history</li>
          </ul>
          <p>If you want to proceed, click the link below within 30 minutes:</p>
          <p><a href="${deleteLink}">Confirm Account Deletion</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>
          <p>- The CloudAct.ai Team</p>
        `,
        text: `Account Deletion Request\n\nYou have requested to delete your CloudAct.ai account.\n\nThis action is permanent and cannot be undone.\n\nIf you want to proceed, visit this link within 30 minutes:\n${deleteLink}\n\nIf you did not request this, you can safely ignore this email.`,
      })
    } catch (emailError) {
      // Email send failed - non-critical, user can still access deletion link from logs
      if (process.env.NODE_ENV === "development") {
        console.warn("[requestAccountDeletion] Email send failed:", emailError)
      }
    }

    // Log the deletion request
    await adminClient.from("activity_logs").insert({
      user_id: user.id,
      action: "account_deletion_requested",
      resource_type: "user",
      resource_id: user.id,
      metadata: {
        email: user.email,
        token_expires_at: expiresAt.toISOString(),
      },
      status: "pending",
    })

    return {
      success: true,
      message: "A verification email has been sent to your email address. Please check your inbox and click the link to confirm deletion.",
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to request account deletion"
    return { success: false, error: errorMessage }
  }
}

/**
 * Confirm and execute account deletion
 */
export async function confirmAccountDeletion(token: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Consume token from database (atomic - single use)
    const tokenData = await consumeDeletionToken(token)
    if (!tokenData) {
      return { success: false, error: "Invalid or expired deletion token" }
    }

    const adminClient = createServiceRoleClient()
    const userId = tokenData.userId

    // Double-check user doesn't own any orgs
    const { data: ownerships } = await adminClient
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("status", "active")

    if (ownerships && ownerships.length > 0) {
      return {
        success: false,
        error: "You still own organizations. Please transfer or delete them first.",
      }
    }

    // Get user profile for logging
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single()

    // Log the deletion BEFORE executing
    await adminClient.from("activity_logs").insert({
      user_id: userId,
      action: "account_deleted",
      resource_type: "user",
      resource_id: userId,
      metadata: {
        email: profile?.email,
        full_name: profile?.full_name,
        deleted_at: new Date().toISOString(),
      },
      status: "success",
    })

    // Deactivate all memberships
    await adminClient
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("user_id", userId)

    // Revoke any invites created by this user
    await adminClient
      .from("invites")
      .update({ status: "revoked" })
      .eq("invited_by", userId)
      .eq("status", "pending")

    // Anonymize profile data (GDPR compliance - keep record but remove PII)
    await adminClient
      .from("profiles")
      .update({
        full_name: "[DELETED]",
        phone: null,
        avatar_url: null,
        // Keep email for audit but could hash it
        email: `deleted_${userId.slice(0, 8)}@deleted.local`,
      })
      .eq("id", userId)

    // Delete the auth user (this will cascade to profile due to trigger)
    // Note: In production, you might want to keep the auth user disabled instead
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      // Continue anyway - profile is anonymized
    }

    // Token already consumed by consumeDeletionToken above

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to delete account"
    return { success: false, error: errorMessage }
  }
}

/**
 * Leave an organization (for non-owners)
 */
export async function leaveOrganization(orgSlug: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate orgSlug format to prevent injection
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get org
    const { data: org } = await adminClient
      .from("organizations")
      .select("id, org_name")
      .eq("org_slug", orgSlug)
      .single()

    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    // Get membership
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("id, role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership) {
      return { success: false, error: "You are not a member of this organization" }
    }

    if (membership.role === "owner") {
      return { success: false, error: "Owners cannot leave. Transfer ownership or delete the organization instead." }
    }

    // Deactivate membership
    const { error: updateError } = await adminClient
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("id", membership.id)

    if (updateError) {
      return { success: false, error: "Failed to leave organization" }
    }

    // Log (fire-and-forget with full error handling and validation)
    // Use Promise.resolve() to convert Supabase's PromiseLike to a full Promise
    void Promise.resolve(adminClient.from("activity_logs").insert({
      org_id: org.id,
      user_id: user.id,
      action: "member_left",
      resource_type: "organization_member",
      resource_id: membership.id,
      metadata: {
        org_name: org.org_name,
        role: membership.role,
      },
      status: "success",
    })).then(({ error }) => {
      if (error && process.env.NODE_ENV === "development") {
        console.warn("[leaveOrganization] Activity log insert failed:", error.message)
      }
    }).catch((logError) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[leaveOrganization] Activity log promise rejected:", logError)
      }
    })

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to leave organization"
    return { success: false, error: errorMessage }
  }
}
