"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2,
  Trash2,
  AlertTriangle,
  Building2,
  UserCog,
  ArrowRightLeft,
  Users,
  Mail,
  CheckCircle2,
} from "lucide-react"
import {
  getOwnedOrganizations,
  getEligibleTransferMembers,
  transferOwnership,
  deleteOrganization,
  requestAccountDeletion,
} from "@/actions/account"

interface OwnedOrg {
  id: string
  org_name: string
  org_slug: string
  member_count: number
  has_other_members: boolean
}

interface TransferMember {
  user_id: string
  email: string
  full_name: string | null
  role: string
}

export default function DangerPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState("")

  // Owned organizations state
  const [ownedOrgs, setOwnedOrgs] = useState<OwnedOrg[]>([])
  const [loadingOwnedOrgs, setLoadingOwnedOrgs] = useState(false)

  // Transfer ownership state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [selectedOrgForTransfer, setSelectedOrgForTransfer] = useState<OwnedOrg | null>(null)
  const [transferMembers, setTransferMembers] = useState<TransferMember[]>([])
  const [loadingTransferMembers, setLoadingTransferMembers] = useState(false)
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>("")
  const [isTransferring, setIsTransferring] = useState(false)

  // Delete org state
  const [deleteOrgDialogOpen, setDeleteOrgDialogOpen] = useState(false)
  const [selectedOrgForDelete, setSelectedOrgForDelete] = useState<OwnedOrg | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [isDeletingOrg, setIsDeletingOrg] = useState(false)

  // Account deletion state
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false)
  const [deletionRequested, setDeletionRequested] = useState(false)

  // Load owned organizations
  const loadOwnedOrganizations = useCallback(async () => {
    setLoadingOwnedOrgs(true)
    try {
      const result = await getOwnedOrganizations()
      if (result.success && result.data) {
        setOwnedOrgs(result.data)
      }
    } catch (err: unknown) {
      console.error("Failed to load owned orgs:", err)
    } finally {
      setLoadingOwnedOrgs(false)
    }
  }, [])

  const loadUserAndOrgs = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")
      await loadOwnedOrganizations()
    } catch (err: unknown) {
      console.error("Error loading user:", err)
      setError("Failed to load user data")
    } finally {
      setIsLoading(false)
    }
  }, [loadOwnedOrganizations, router])

  useEffect(() => {
    document.title = "Danger Zone | CloudAct.ai"
  }, [])

  useEffect(() => {
    loadUserAndOrgs()
  }, [orgSlug, loadUserAndOrgs])

  // Open transfer dialog and load members
  const openTransferDialog = async (org: OwnedOrg) => {
    setSelectedOrgForTransfer(org)
    setTransferDialogOpen(true)
    setLoadingTransferMembers(true)
    setSelectedNewOwner("")

    try {
      const result = await getEligibleTransferMembers(org.id)
      if (result.success && result.data) {
        setTransferMembers(result.data)
      } else {
        setTransferMembers([])
      }
    } catch (err: unknown) {
      console.error("Failed to load transfer members:", err)
      setTransferMembers([])
    } finally {
      setLoadingTransferMembers(false)
    }
  }

  // Handle ownership transfer
  const handleTransferOwnership = async () => {
    if (!selectedOrgForTransfer || !selectedNewOwner) return

    setIsTransferring(true)
    setError(null)

    try {
      const result = await transferOwnership(selectedOrgForTransfer.id, selectedNewOwner)
      if (result.success) {
        setSuccess(`Ownership of "${selectedOrgForTransfer.org_name}" transferred successfully!`)
        setTransferDialogOpen(false)
        setSelectedOrgForTransfer(null)
        await loadOwnedOrganizations()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to transfer ownership")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership")
    } finally {
      setIsTransferring(false)
    }
  }

  // Open delete org dialog
  const openDeleteOrgDialog = (org: OwnedOrg) => {
    setSelectedOrgForDelete(org)
    setDeleteConfirmName("")
    setDeleteOrgDialogOpen(true)
  }

  // Handle org deletion
  const handleDeleteOrg = async () => {
    if (!selectedOrgForDelete) return

    setIsDeletingOrg(true)
    setError(null)

    try {
      const result = await deleteOrganization(selectedOrgForDelete.id, deleteConfirmName)
      if (result.success) {
        setSuccess(`Organization "${selectedOrgForDelete.org_name}" deleted successfully!`)
        setDeleteOrgDialogOpen(false)
        setSelectedOrgForDelete(null)
        await loadOwnedOrganizations()
        if (selectedOrgForDelete.org_slug === orgSlug) {
          router.push("/dashboard")
        }
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to delete organization")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete organization")
    } finally {
      setIsDeletingOrg(false)
    }
  }

  // Request account deletion
  const handleRequestAccountDeletion = async () => {
    setIsRequestingDeletion(true)
    setError(null)

    try {
      const result = await requestAccountDeletion()
      if (result.success) {
        setDeletionRequested(true)
        setSuccess(result.message || "Verification email sent!")
      } else {
        setError(result.error || "Failed to request account deletion")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request account deletion")
    } finally {
      setIsRequestingDeletion(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-muted border-green-500/50">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      {/* Owned Organizations Management */}
      {loadingOwnedOrgs ? (
        <Card className="console-stat-card">
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
              <span className="ml-2 console-body text-gray-500">Loading organizations...</span>
            </div>
          </CardContent>
        </Card>
      ) : ownedOrgs.length > 0 ? (
        <Card className="console-stat-card border-amber-500/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              <CardTitle className="console-card-title text-amber-500">Organizations You Own</CardTitle>
            </div>
            <CardDescription className="console-subheading">
              You must transfer ownership or delete these organizations before you can delete your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ownedOrgs.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-[#007A78]" />
                  <div>
                    <p className="console-body font-medium">{org.org_name}</p>
                    <div className="flex items-center gap-2 console-small text-gray-500">
                      <Users className="h-3 w-3" />
                      <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
                      <Badge variant="outline" className="console-badge console-badge-teal ml-2">Owner</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {org.has_other_members ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTransferDialog(org)}
                      className="console-button-secondary"
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer
                    </Button>
                  ) : null}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openDeleteOrgDialog(org)}
                    className="console-button-coral"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Transfer Ownership Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer ownership of &quot;{selectedOrgForTransfer?.org_name}&quot; to another member.
              You will become a collaborator after the transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingTransferMembers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : transferMembers.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No other members available. Invite someone to the organization first, or delete the organization instead.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <Label>Select new owner</Label>
                <Select value={selectedNewOwner} onValueChange={setSelectedNewOwner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {transferMembers.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        <div className="flex items-center gap-2">
                          <UserCog className="h-4 w-4" />
                          <span>{member.full_name || member.email}</span>
                          <span className="text-muted-foreground">({member.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransferOwnership}
              disabled={!selectedNewOwner || isTransferring}
            >
              {isTransferring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferring...
                </>
              ) : (
                "Transfer Ownership"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={deleteOrgDialogOpen} onOpenChange={setDeleteOrgDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Organization</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{selectedOrgForDelete?.org_name}&quot; and all associated data.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                All organization data, members, invites, and settings will be permanently deleted.
                {selectedOrgForDelete?.member_count && selectedOrgForDelete.member_count > 1 && (
                  <span className="block mt-1">
                    This will affect {selectedOrgForDelete.member_count - 1} other member(s).
                  </span>
                )}
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="confirmName">
                Type <span className="font-bold">{selectedOrgForDelete?.org_name}</span> to confirm
              </Label>
              <Input
                id="confirmName"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Type organization name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrgDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrg}
              disabled={
                deleteConfirmName.toLowerCase() !== selectedOrgForDelete?.org_name.toLowerCase() ||
                isDeletingOrg
              }
            >
              {isDeletingOrg ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Organization
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Deletion Card */}
      <Card className="console-stat-card border-[#FF6E50]/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
            <CardTitle className="console-card-title text-[#FF6E50]">Delete Account</CardTitle>
          </div>
          <CardDescription className="console-subheading">Permanently delete your account and all associated data</CardDescription>
        </CardHeader>
        <CardContent>
          {deletionRequested ? (
            <Alert className="bg-muted border-green-500/50">
              <Mail className="h-4 w-4 text-green-500" />
              <AlertDescription>
                <p className="font-medium text-foreground">Verification email sent!</p>
                <p className="text-sm mt-1">
                  Please check your inbox and click the confirmation link to complete account deletion.
                  The link will expire in 30 minutes.
                </p>
              </AlertDescription>
            </Alert>
          ) : ownedOrgs.length > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You own {ownedOrgs.length} organization{ownedOrgs.length !== 1 ? "s" : ""}.
                Please transfer ownership or delete them before deleting your account.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Deleting your account will permanently remove you from all organizations and cannot be
                undone. Your data will be lost forever.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={ownedOrgs.length > 0 || isRequestingDeletion || deletionRequested}
                className="console-button-coral"
              >
                {isRequestingDeletion ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Requesting...
                  </>
                ) : deletionRequested ? (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Check Email
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Request Account Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  We will send a verification email to <span className="font-medium">{email}</span>.
                  You must click the link in the email to confirm the deletion.
                  <span className="block mt-2 text-destructive">
                    This action is permanent and cannot be undone.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRequestAccountDeletion}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Send Verification Email
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  )
}
