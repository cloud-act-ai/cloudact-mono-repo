"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UserPlus, Trash2, Mail, Copy, CheckCircle2, Loader2, Shield, Users } from "lucide-react"
import { fetchMembersData, inviteMember, removeMember, updateMemberRole, cancelInvite } from "@/actions/members"
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

export default function MembersPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [userRole, setUserRole] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Team Members | ${orgSlug}`
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

  // Email validation regex (RFC 5322 simplified) - must match server-side validation in actions/members.ts
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    return emailRegex.test(email) && email.length <= 254
  }

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Use server action to fetch data (bypasses RLS)
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
      const errorMessage = logError("MembersPage:fetchData", err)
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

      toast.success("Invitation sent successfully")
      setInviteLink(result.inviteLink || null)
      setInviteEmail("")
      void fetchData()
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
      void fetchData()
      setMemberToRemove(null)
    } else {
      toast.error(result.error || "Failed to remove member")
      setMemberToRemove(null)
    }
  }

  const handleUpdateRole = async (memberUserId: string, newRole: "collaborator" | "read_only") => {
    const result = await updateMemberRole(orgSlug, memberUserId, newRole)
    if (result.success) {
      toast.success("Role updated successfully")
      void fetchData()
    } else {
      toast.error(result.error || "Failed to update role")
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    const result = await cancelInvite(orgSlug, inviteId)
    if (result.success) {
      toast.success("Invitation cancelled")
      void fetchData()
    } else {
      toast.error(result.error || "Failed to cancel invitation")
    }
  }

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const copyInviteLink = async () => {
    if (!inviteLink) return

    // Clear existing timeout before setting new one
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }

    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success("Link copied to clipboard")
      setCopied(true)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that don't support clipboard API
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
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  const isOwner = userRole === "owner"
  const seatLimit = orgData?.seat_limit
  // If seatLimit is not set, show error in the UI
  const currentSeats = members.length
  const seatsAvailable = seatLimit ? seatLimit - currentSeats : 0

  return (
    <div className="space-y-6">
      {!seatLimit && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertDescription>
            Seat limit is not configured for this organization. Please contact support to configure your seat limit.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Team Members</h1>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">
            Manage who has access to your organization ({currentSeats}/{seatLimit ?? "N/A"} seats used)
          </p>
        </div>
        {isOwner && (
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!seatLimit || seatsAvailable <= 0} className="cloudact-btn-primary h-[36px] px-4">
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join your organization. {seatsAvailable} seat{seatsAvailable !== 1 ? "s" : ""}{" "}
                  available.
                </DialogDescription>
              </DialogHeader>

              {inviteLink ? (
                <div className="space-y-4">
                  <Alert className="bg-muted border-foreground/20">
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                    <AlertDescription className="text-foreground">
                      Invite created! Share this link with the new member:
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly />
                    <Button onClick={copyInviteLink} variant="outline" aria-label="Copy invite link">
                      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    className="w-full cloudact-btn-primary"
                    onClick={() => {
                      setInviteLink(null)
                      setIsInviteDialogOpen(false)
                    }}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="console-label">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => {
                        setInviteEmail(e.target.value)
                        setEmailError(null)
                      }}
                      className="console-input"
                    />
                    {emailError && (
                      <p className="console-small text-[#FF6E50]">{emailError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role" className="console-label">Role</Label>
                    <Select value={inviteRole} onValueChange={(v: "collaborator" | "read_only") => setInviteRole(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="collaborator">Collaborator - Edit data, no billing</SelectItem>
                        <SelectItem value="read_only">Read Only - View only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)} className="cloudact-btn-secondary h-[36px] px-4">
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={isInviting || !inviteEmail || !validateEmail(inviteEmail)} className="cloudact-btn-primary h-[36px] px-4">
                      {isInviting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      Send Invite
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>


      {seatsAvailable <= 0 && isOwner && (
        <Alert>
          <AlertDescription>
            You've reached your seat limit.{" "}
            <a href={`/${orgSlug}/billing`} className="font-medium underline">
              Upgrade your plan
            </a>{" "}
            to add more members.
          </AlertDescription>
        </Alert>
      )}

      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#007A78]" />
            <h2 className="text-[22px] font-bold text-black">Active Members ({members.length})</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">People who have access to this organization</p>
        </div>
        <div className="metric-card-content">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-4">
                <Users className="h-12 w-12 text-[#007A78]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">No team members yet</h3>
              <p className="text-[15px] text-[#8E8E93] mb-6 max-w-md mx-auto">
                Get started by inviting your first team member
              </p>
              {isOwner && (
                <Button onClick={() => setIsInviteDialogOpen(true)} disabled={!seatLimit || seatsAvailable <= 0} className="cloudact-btn-primary h-[44px] px-6">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5EA]">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[15px] font-medium text-black truncate">{member.profiles?.full_name || member.profiles?.email || "Unknown"}</p>
                    <p className="text-[13px] text-[#8E8E93] truncate">{member.profiles?.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOwner && member.role !== "owner" ? (
                      <Select value={member.role} onValueChange={(v: "collaborator" | "read_only") => handleUpdateRole(member.user_id, v)}>
                        <SelectTrigger className="w-[140px] h-[36px] border border-[#E5E5EA] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collaborator">Collaborator</SelectItem>
                          <SelectItem value="read_only">Read Only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={member.role === "owner" ? "default" : "secondary"} className={member.role === "owner" ? "bg-[#007A78]/12 text-[#007A78] border-0 capitalize" : "bg-[#8E8E93]/12 text-[#8E8E93] border-0 capitalize"}>
                        {member.role === "read_only" ? "Read Only" : member.role}
                      </Badge>
                    )}
                    {isOwner && member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMemberToRemove(member.user_id)}
                        className="h-8 w-8 rounded-lg text-[#FF6E50] hover:text-[#FF6E50] hover:bg-[#FF6E50]/10"
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={memberToRemove !== null} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member? They will lose access to this organization immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)} className="cloudact-btn-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="cloudact-btn-destructive">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {invites.length > 0 && (
        <div className="metric-card shadow-sm">
          <div className="metric-card-header mb-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#007A78]" />
              <h2 className="text-[22px] font-bold text-black">Pending Invites ({invites.length})</h2>
            </div>
            <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">Invitations that haven't been accepted yet</p>
          </div>
          <div className="metric-card-content">
            <div className="divide-y divide-[#E5E5EA]">
              {invites.map((invite) => (
                <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[15px] font-medium text-black truncate">{invite.email}</p>
                    <p className="text-[13px] text-[#8E8E93]">
                      Invited {new Date(invite.created_at).toLocaleDateString()} • Expires{" "}
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="bg-[#FF6E50]/10 text-[#FF6E50] border-0 capitalize">
                      {invite.role === "read_only" ? "Read Only" : invite.role}
                    </Badge>
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(invite.id)} className="h-8 px-3 rounded-lg hover:bg-[#F5F5F7] text-[#8E8E93]">
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#007A78]" />
            <h2 className="text-[22px] font-bold text-black">Role Permissions</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">What each role can do in your organization</p>
        </div>
        <div className="metric-card-content">
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="min-w-[400px] space-y-3 sm:space-y-4">
              <div className="console-table-header grid grid-cols-4 gap-3 sm:gap-4 border-b border-[#E5E5EA] pb-2">
                <div className="font-semibold text-gray-700">Permission</div>
                <div className="text-center font-semibold text-gray-700">Owner</div>
                <div className="text-center font-semibold text-gray-700">Collaborator</div>
                <div className="text-center font-semibold text-gray-700">Read Only</div>
              </div>
              {[
                { label: "View data", owner: true, collab: true, readonly: true },
                { label: "Edit data", owner: true, collab: true, readonly: false },
                { label: "Invite members", owner: true, collab: false, readonly: false },
                { label: "Manage roles", owner: true, collab: false, readonly: false },
                { label: "Access billing", owner: true, collab: false, readonly: false },
              ].map((perm) => (
                <div key={perm.label} className="console-table-row grid grid-cols-4 gap-3 sm:gap-4 py-3 hover:bg-[#F5F5F7] rounded-lg px-3 transition-colors border-b border-[#E5E5EA] last:border-0">
                  <div className="console-table-cell text-[13px] sm:text-[15px] text-gray-800">{perm.label}</div>
                  <div className="console-table-cell text-center text-[13px] sm:text-[15px]">{perm.owner ? <span className="text-[#007A78]">✓</span> : <span className="text-gray-300">✗</span>}</div>
                  <div className="console-table-cell text-center text-[13px] sm:text-[15px]">{perm.collab ? <span className="text-[#007A78]">✓</span> : <span className="text-gray-300">✗</span>}</div>
                  <div className="console-table-cell text-center text-[13px] sm:text-[15px]">{perm.readonly ? <span className="text-[#007A78]">✓</span> : <span className="text-gray-300">✗</span>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
