"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Trash2, Mail, Copy, CheckCircle2, Loader2, Users, Clock, Check, AlertCircle, Eye, Edit3, RefreshCw } from "lucide-react"
import { fetchMembersData, inviteMember, removeMember, updateMemberRole, cancelInvite, resendInvite } from "@/actions/members"
import { logError } from "@/lib/utils"

interface Member {
  id: string
  user_id: string
  role: string
  status: string
  joined_at: string
  profiles: {
    email: string
    full_name: string | null
  } | null
}

interface Invite {
  id: string
  email: string
  role: string
  status: string
  created_at: string
  expires_at: string
}

interface OrgData {
  id: string
  plan: string
  seat_limit: number
  billing_status: string
}

export default function InviteMembersPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [userRole, setUserRole] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Invite Members | ${orgSlug}`
  }, [orgSlug])

  // Dialog states
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"collaborator" | "read_only">("collaborator")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Email validation regex
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    return emailRegex.test(email) && email.length <= 254
  }

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const result = await fetchMembersData(orgSlug)

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch members data")
      }

      if (!result.data) {
        throw new Error("No data returned from server")
      }

      const { organization, userRole: role, members: membersData, invites: invitesData } = result.data

      setOrgData(organization)
      setUserRole(role)
      setMembers(membersData)
      setInvites(invitesData)
    } catch (err) {
      const errorMessage = logError("InviteMembersPage:fetchData", err)
      setError(errorMessage || "Failed to load members")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleInvite = async () => {
    if (!validateEmail(inviteEmail)) {
      setEmailError("Please enter a valid email address")
      return
    }
    setEmailError(null)

    setIsInviting(true)

    try {
      const result = await inviteMember(orgSlug, inviteEmail, inviteRole)

      if (!result.success) {
        toast.error(result.error || "Failed to invite member")
        setIsInviting(false)
        return
      }

      // Show appropriate toast based on email delivery status
      if (result.emailSent === false) {
        toast.warning("Invite created but email delivery failed. Please share the link manually.")
      } else {
        toast.success("Invitation sent successfully")
      }
      setInviteLink(result.inviteLink || null)
      setInviteEmail("")
      await fetchData() // Await to ensure list updates before any UI changes
    } catch {
      toast.error("Failed to invite member")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemoveMember = async () => {
    const memberIdToRemove = memberToRemove
    if (!memberIdToRemove) return

    const result = await removeMember(orgSlug, memberIdToRemove)
    if (result.success) {
      toast.success("Member removed successfully")
      setMemberToRemove(null)
      await fetchData() // Await to ensure UI reflects deletion before any further actions
    } else {
      toast.error(result.error || "Failed to remove member")
      setMemberToRemove(null)
    }
  }

  const handleUpdateRole = async (memberUserId: string, newRole: "collaborator" | "read_only") => {
    const result = await updateMemberRole(orgSlug, memberUserId, newRole)
    if (result.success) {
      toast.success("Role updated successfully")
      await fetchData() // Await to ensure UI reflects role change
    } else {
      toast.error(result.error || "Failed to update role")
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    const result = await cancelInvite(orgSlug, inviteId)
    if (result.success) {
      toast.success("Invitation cancelled")
      await fetchData() // Await to ensure UI reflects cancellation
    } else {
      toast.error(result.error || "Failed to cancel invitation")
    }
  }

  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)

  const handleResendInvite = async (inviteId: string) => {
    setResendingInviteId(inviteId)
    try {
      const result = await resendInvite(orgSlug, inviteId)
      if (result.success) {
        if (result.emailSent === false) {
          toast.warning("Invite regenerated but email delivery failed. Please share the link manually.")
          // Optionally show the new invite link
          if (result.inviteLink) {
            setInviteLink(result.inviteLink)
          }
        } else {
          toast.success("Invitation resent with new link")
        }
        await fetchData() // Refresh to show updated expiry
      } else {
        toast.error(result.error || "Failed to resend invitation")
      }
    } finally {
      setResendingInviteId(null)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const copyInviteLink = async () => {
    if (!inviteLink) return

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }

    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success("Link copied to clipboard")
      setCopied(true)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        const textArea = document.createElement("textarea")
        textArea.value = inviteLink
        textArea.style.position = "fixed"
        textArea.style.left = "-999999px"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
        toast.success("Link copied to clipboard")
        setCopied(true)
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
      } catch {
        toast.error("Failed to copy link. Please copy it manually.")
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[13px] text-slate-500 font-medium">Loading team members...</p>
        </div>
      </div>
    )
  }

  const isOwner = userRole === "owner"
  const seatLimit = orgData?.seat_limit
  const currentSeats = members.length
  const pendingInvitesCount = invites.length
  // STATE-001 FIX: Include pending invites in seat calculation (they reserve seats)
  const seatsAvailable = seatLimit ? seatLimit - currentSeats - pendingInvitesCount : 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6] to-[#B8FDCA] flex items-center justify-center flex-shrink-0 shadow-sm">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-slate-900" />
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[28px] font-bold text-slate-900 tracking-tight leading-none">
                Team Members
              </h1>
              <p className="text-[12px] sm:text-[14px] text-slate-500 mt-1.5 sm:mt-2 max-w-lg">
                Manage who has access to your organization
              </p>
            </div>
          </div>
          {isOwner && (
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <button
                  disabled={!seatLimit || seatsAvailable <= 0}
                  className="h-10 sm:h-11 w-full sm:w-auto px-5 sm:px-6 text-[11px] sm:text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 rounded-lg sm:rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite Member
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your organization. {seatsAvailable} seat{seatsAvailable !== 1 ? "s" : ""} available.
                  </DialogDescription>
                </DialogHeader>

                {inviteLink ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/30 flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[#1a7a3a] flex-shrink-0" />
                      <p className="text-[12px] font-medium text-[#1a7a3a]">
                        Invite created! Share this link with the new member:
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input value={inviteLink} readOnly className="text-[12px] rounded-xl border-slate-200 focus:border-[#90FCA6] focus:ring-[#90FCA6]/20" />
                      <Button onClick={copyInviteLink} variant="outline" className="rounded-xl" aria-label="Copy invite link">
                        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <button
                      className="w-full h-11 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 rounded-xl transition-all shadow-sm hover:shadow-md"
                      onClick={() => {
                        setInviteLink(null)
                        setIsInviteDialogOpen(false)
                      }}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[12px] font-medium text-slate-700">Email address</Label>
                      <Input
                        id="email"
                        name="invite-email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => {
                          setInviteEmail(e.target.value)
                          setEmailError(null)
                        }}
                        disabled={isInviting}
                        aria-invalid={!!emailError}
                        className="h-10 text-[12px] rounded-xl border-slate-200 focus:border-[#90FCA6] focus:ring-[#90FCA6]/20"
                      />
                      {emailError && (
                        <p className="text-[11px] text-[#FF6C5E] font-medium">{emailError}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-[12px] font-medium text-slate-700">Role</Label>
                      <Select value={inviteRole} onValueChange={(v: "collaborator" | "read_only") => setInviteRole(v)} disabled={isInviting}>
                        <SelectTrigger className="h-10 rounded-xl border-slate-200 focus:border-[#90FCA6] focus:ring-[#90FCA6]/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collaborator">Collaborator - Edit data, no billing</SelectItem>
                          <SelectItem value="read_only">Read Only - View only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {error && (
                      <div className="p-3 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30">
                        <p className="text-[11px] font-medium text-[#FF6C5E]">{error}</p>
                      </div>
                    )}

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)} disabled={isInviting} className="h-10 rounded-xl">
                        Cancel
                      </Button>
                      <button
                        onClick={handleInvite}
                        disabled={isInviting || !inviteEmail || !validateEmail(inviteEmail)}
                        className="h-10 px-5 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50"
                      >
                        {isInviting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        Send Invite
                      </button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
        <div className="metric-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
            </div>
            <div className="min-w-0">
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none tracking-tight">{currentSeats}</p>
              <p className="text-xs sm:text-[12px] text-slate-500 font-medium mt-0.5 sm:mt-1 truncate">
                of {seatLimit ?? "∞"} seats
              </p>
            </div>
          </div>
        </div>

        <div className="metric-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[#FF6C5E]/15 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-[#FF6C5E]" />
            </div>
            <div className="min-w-0">
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none tracking-tight">{invites.length}</p>
              <p className="text-xs sm:text-[12px] text-slate-500 font-medium mt-0.5 sm:mt-1 truncate">pending</p>
            </div>
          </div>
        </div>

        <div className="metric-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
            </div>
            <div className="min-w-0">
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none tracking-tight">{seatsAvailable}</p>
              <p className="text-xs sm:text-[12px] text-slate-500 font-medium mt-0.5 sm:mt-1 truncate">available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Seat Limit Warning */}
      {!seatLimit && (
        <div className="mb-6 p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0" />
          <p className="text-[12px] font-medium text-[#FF6C5E]">
            Seat limit is not configured. Contact support to configure your seat limit.
          </p>
        </div>
      )}

      {seatsAvailable <= 0 && seatLimit && isOwner && (
        <div className="mb-6 p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0" />
            <p className="text-[12px] font-medium text-[#FF6C5E]">
              You've reached your seat limit.
            </p>
          </div>
          <a
            href={`/${orgSlug}/billing`}
            className="text-[12px] font-semibold text-slate-900 hover:underline"
          >
            Upgrade plan →
          </a>
        </div>
      )}

      {/* Active Members Section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">
            Active Members ({members.length})
          </h2>
        </div>

        <div className="console-table-card">
          {members.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#90FCA6]/20 to-[#B8FDCA]/20 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-[#1a7a3a]" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-1">No team members yet</h3>
              <p className="text-[12px] text-slate-500 mb-6 max-w-xs mx-auto">
                Get started by inviting your first team member
              </p>
              {isOwner && (
                <button
                  onClick={() => setIsInviteDialogOpen(true)}
                  disabled={!seatLimit || seatsAvailable <= 0}
                  className="h-11 px-6 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 rounded-xl transition-all shadow-sm hover:shadow-md inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite Member
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.id} className="console-table-row group relative">
                  {/* Left accent */}
                  <div
                    className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: member.role === "owner" ? "#90FCA6" : "#8B5CF6" }}
                  />
                  <div className="console-table-cell pl-5 py-4 pr-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 text-[14px] font-bold shadow-sm"
                        style={{
                          backgroundColor: member.role === "owner" ? "#90FCA6" : "#8B5CF6",
                          color: member.role === "owner" ? "#000000" : "#FFFFFF"
                        }}
                      >
                        {(member.profiles?.full_name?.[0] || member.profiles?.email?.[0] || member.profiles?.email?.split("@")[0]?.[0] || "U").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-slate-900 tracking-tight truncate">
                          {member.profiles?.full_name || member.profiles?.email?.split("@")[0] || member.profiles?.email || "Team Member"}
                        </h3>
                        <p className="text-[12px] text-slate-500 truncate mt-0.5">{member.profiles?.email || "No email"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isOwner && member.role !== "owner" ? (
                        <Select
                          value={member.role}
                          onValueChange={(v: "collaborator" | "read_only") => handleUpdateRole(member.user_id, v)}
                        >
                          <SelectTrigger className="w-[140px] h-9 text-[11px] border-slate-200 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="collaborator">Collaborator</SelectItem>
                            <SelectItem value="read_only">Read Only</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg ${
                            member.role === "owner"
                              ? "bg-[#90FCA6]/15 text-[#1a7a3a] border-0"
                              : "bg-slate-100 text-slate-700 border-0"
                          }`}
                        >
                          {member.role === "read_only" ? "Read Only" : member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </Badge>
                      )}
                      {isOwner && member.role !== "owner" && (
                        <button
                          onClick={() => setMemberToRemove(member.user_id)}
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-[#FF6C5E] hover:bg-[#FF6C5E]/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Remove Member Dialog */}
      <AlertDialog open={memberToRemove !== null} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member? They will lose access to this organization immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-[#FF6C5E] hover:bg-[#E5544A] text-white rounded-xl"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pending Invites Section */}
      {invites.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">
              Pending Invites ({invites.length})
            </h2>
          </div>

          <div className="console-table-card">
            <div className="divide-y divide-slate-100">
              {invites.map((invite) => (
                <div key={invite.id} className="console-table-row group relative">
                  <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[#FF6C5E] opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="console-table-cell pl-5 py-4 pr-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-xl bg-[#FF6C5E]/15 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Mail className="h-5 w-5 text-[#FF6C5E]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-slate-900 tracking-tight truncate">
                          {invite.email}
                        </h3>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          Invited {new Date(invite.created_at).toLocaleDateString()} • Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className="text-[11px] font-semibold px-3 py-1.5 bg-[#FF6C5E]/15 text-[#FF6C5E] border-0 rounded-lg">
                        {invite.role === "read_only" ? "Read Only" : invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </Badge>
                      {isOwner && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleResendInvite(invite.id)}
                            disabled={resendingInviteId === invite.id}
                            className="h-9 px-4 rounded-lg text-[11px] font-medium text-[#1a7a3a] hover:text-[#0d5a26] hover:bg-[#90FCA6]/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {resendingInviteId === invite.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Resend
                          </button>
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="h-9 px-4 rounded-lg text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Role Permissions */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">
            Role Permissions
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Owner */}
          <div className="metric-card">
            <div className="h-12 w-12 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center mb-4 shadow-sm">
              <Users className="h-6 w-6 text-[#1a7a3a]" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 mb-1">Owner</h3>
            <p className="text-[12px] text-slate-500 mb-4">Full access to everything</p>
            <div className="space-y-2">
              {["View data", "Edit data", "Invite members", "Manage roles", "Access billing"].map((perm) => (
                <div key={perm} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#1a7a3a]" />
                  <span className="text-[12px] text-slate-700">{perm}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Collaborator */}
          <div className="metric-card">
            <div className="h-12 w-12 rounded-2xl bg-[#8B5CF6]/15 flex items-center justify-center mb-4 shadow-sm">
              <Edit3 className="h-6 w-6 text-[#8B5CF6]" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 mb-1">Collaborator</h3>
            <p className="text-[12px] text-slate-500 mb-4">Can view and edit data</p>
            <div className="space-y-2">
              {[
                { perm: "View data", allowed: true },
                { perm: "Edit data", allowed: true },
                { perm: "Invite members", allowed: false },
                { perm: "Manage roles", allowed: false },
                { perm: "Access billing", allowed: false },
              ].map(({ perm, allowed }) => (
                <div key={perm} className="flex items-center gap-2">
                  {allowed ? (
                    <Check className="h-4 w-4 text-[#8B5CF6]" />
                  ) : (
                    <div className="h-4 w-4 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-slate-300" />
                    </div>
                  )}
                  <span className={`text-[12px] ${allowed ? "text-slate-700" : "text-slate-400"}`}>{perm}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Read Only */}
          <div className="metric-card">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 shadow-sm">
              <Eye className="h-6 w-6 text-slate-600" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 mb-1">Read Only</h3>
            <p className="text-[12px] text-slate-500 mb-4">View access only</p>
            <div className="space-y-2">
              {[
                { perm: "View data", allowed: true },
                { perm: "Edit data", allowed: false },
                { perm: "Invite members", allowed: false },
                { perm: "Manage roles", allowed: false },
                { perm: "Access billing", allowed: false },
              ].map(({ perm, allowed }) => (
                <div key={perm} className="flex items-center gap-2">
                  {allowed ? (
                    <Check className="h-4 w-4 text-slate-600" />
                  ) : (
                    <div className="h-4 w-4 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-slate-300" />
                    </div>
                  )}
                  <span className={`text-[12px] ${allowed ? "text-slate-700" : "text-slate-400"}`}>{perm}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
