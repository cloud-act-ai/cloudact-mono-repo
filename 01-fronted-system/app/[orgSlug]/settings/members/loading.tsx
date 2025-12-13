import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function MembersLoading() {
  return (
    <div className="container mx-auto py-10 max-w-6xl space-y-8" role="status" aria-busy="true" aria-label="Loading team members">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-5 w-64 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Members Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-5 gap-4 pb-2 border-b">
              {["Name", "Email", "Role", "Status", "Actions"].map((_, i) => (
                <Skeleton key={i} className="h-4 w-16 rounded-md" />
              ))}
            </div>
            {/* Data rows */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-5 gap-4 items-center py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invites Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-4 gap-4 pb-2 border-b">
              {["Email", "Role", "Sent", "Actions"].map((_, i) => (
                <Skeleton key={i} className="h-4 w-16 rounded-md" />
              ))}
            </div>
            {/* Data rows */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-4 gap-4 items-center py-3">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-md" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
