import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SubscriptionsLoading() {
  return (
    <div className="container mx-auto py-10 max-w-6xl space-y-8" role="status" aria-busy="true" aria-label="Loading subscriptions">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-md" />
      </div>

      {/* Provider Tabs */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      {/* Subscriptions Content */}
      <div className="space-y-6">
        {/* Summary Card */}
        <Card className="rounded-2xl">
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-64 mt-2 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-8 w-32 rounded-lg" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Subscriptions Table */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40 rounded-md" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Header row */}
              <div className="grid grid-cols-6 gap-4 pb-2 border-b">
                {["Plan", "Quantity", "Price", "Billing", "Status", "Actions"].map((_, i) => (
                  <Skeleton key={i} className="h-4 w-16 rounded-md" />
                ))}
              </div>
              {/* Data rows */}
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-6 gap-4 items-center py-3">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-4 w-20 rounded-md" />
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
      </div>
    </div>
  )
}
