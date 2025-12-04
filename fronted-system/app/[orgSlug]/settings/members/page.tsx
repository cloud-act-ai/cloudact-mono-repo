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

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
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
    fetchData()
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
      fetchData()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to invite member"
      toast.error(errorMessage)
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
      fetchData()
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
      fetchData()
    } else {
      toast.error(result.error || "Failed to update role")
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    const result = await cancelInvite(orgSlug, inviteId)
    if (result.success) {
      toast.success("Invitation cancelled")
      fetchData()
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
    } catch (error) {
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
      } catch (fallbackError) {
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
        <Alert variant="destructive">
          <AlertDescription>
            Seat limit is not configured for this organization. Please contact support to configure your seat limit.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="console-page-title">Team Members</h1>
          <p className="console-subheading">
            Manage who has access to your organization ({currentSeats}/{seatLimit ?? "N/A"} seats used)
          </p>
        </div>
        {isOwner && (
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!seatLimit || seatsAvailable <= 0} className="console-button-primary">
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
                    className="w-full"
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
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)} className="console-button-secondary">
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={isInviting || !inviteEmail || !validateEmail(inviteEmail)} className="console-button-primary">
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

      <Card className="console-stat-card">
        <CardHeader>
          <CardTitle className="console-card-title flex items-center gap-2">
            <Users className="h-5 w-5 text-[#007A78]" />
            Active Members ({members.length})
          </CardTitle>
          <CardDescription className="console-subheading">People who have access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-gray-500/50 mb-4" />
              <h3 className="console-heading">No team members yet</h3>
              <p className="console-subheading mt-1 mb-4">
                Get started by inviting your first team member
              </p>
              {isOwner && (
                <Button onClick={() => setIsInviteDialogOpen(true)} disabled={!seatLimit || seatsAvailable <= 0} className="console-button-primary">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
                  <div className="space-y-1 min-w-0">
                    <p className="console-body font-medium truncate">{member.profiles?.full_name || member.profiles?.email || "Unknown"}</p>
                    <p className="console-small text-gray-500 truncate">{member.profiles?.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOwner && member.role !== "owner" ? (
                      <Select value={member.role} onValueChange={(v: "collaborator" | "read_only") => handleUpdateRole(member.user_id, v)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collaborator">Collaborator</SelectItem>
                          <SelectItem value="read_only">Read Only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={member.role === "owner" ? "default" : "secondary"} className={member.role === "owner" ? "console-badge console-badge-teal capitalize" : "console-badge capitalize"}>
                        {member.role === "read_only" ? "Read Only" : member.role}
                      </Badge>
                    )}
                    {isOwner && member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMemberToRemove(member.user_id)}
                        className="text-[#FF6E50] hover:text-[#FF6E50] hover:bg-[#FFF5F3]"
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
        </CardContent>
      </Card>
      <AlertDialog open={memberToRemove !== null} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member? They will lose access to this organization immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {invites.length > 0 && (
        <Card className="console-stat-card">
          <CardHeader>
            <CardTitle className="console-card-title flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#007A78]" />
              Pending Invites ({invites.length})
            </CardTitle>
            <CardDescription className="console-subheading">Invitations that haven't been accepted yet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invites.map((invite) => (
                <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
                  <div className="space-y-1 min-w-0">
                    <p className="console-body font-medium truncate">{invite.email}</p>
                    <p className="console-small text-gray-500">
                      Invited {new Date(invite.created_at).toLocaleDateString()} • Expires{" "}
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="console-badge capitalize">
                      {invite.role === "read_only" ? "Read Only" : invite.role}
                    </Badge>
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(invite.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="console-stat-card">
        <CardHeader>
          <CardTitle className="console-card-title flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#007A78]" />
            Role Permissions
          </CardTitle>
          <CardDescription className="console-subheading">What each role can do in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="min-w-[400px] space-y-4">
              <div className="grid grid-cols-4 gap-4 text-sm font-medium border-b pb-2">
                <div>Permission</div>
                <div className="text-center">Owner</div>
                <div className="text-center">Collaborator</div>
                <div className="text-center">Read Only</div>
              </div>
              {[
                { label: "View data", owner: true, collab: true, readonly: true },
                { label: "Edit data", owner: true, collab: true, readonly: false },
                { label: "Invite members", owner: true, collab: false, readonly: false },
                { label: "Manage roles", owner: true, collab: false, readonly: false },
                { label: "Access billing", owner: true, collab: false, readonly: false },
              ].map((perm) => (
                <div key={perm.label} className="grid grid-cols-4 gap-4 console-body">
                  <div className="text-gray-500">{perm.label}</div>
                  <div className="text-center">{perm.owner ? "✓" : "✗"}</div>
                  <div className="text-center">{perm.collab ? "✓" : "✗"}</div>
                  <div className="text-center">{perm.readonly ? "✓" : "✗"}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
