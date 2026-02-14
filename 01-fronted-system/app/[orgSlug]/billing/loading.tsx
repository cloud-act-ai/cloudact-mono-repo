import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function BillingLoading() {
  return (
    <div className="container mx-auto py-10 max-w-7xl space-y-8" role="status" aria-busy="true" aria-label="Loading billing information">
      {/* Header Skeleton */}
      <div className="text-center space-y-2">
        <Skeleton className="h-9 w-64 mx-auto rounded-lg" />
        <Skeleton className="h-5 w-96 mx-auto rounded-md" />
      </div>

      {/* Current Subscription Banner Skeleton */}
      <Card className="bg-muted/50 rounded-2xl">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48 rounded-md" />
                <Skeleton className="h-4 w-64 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-10 w-40 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Pricing Cards Section */}
      <div>
        <Skeleton className="h-7 w-32 mb-4 rounded-lg" />
        <Skeleton className="h-5 w-96 mb-6 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col rounded-2xl">
              <CardHeader>
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-4 w-full mt-2 rounded-md" />
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <Skeleton className="h-10 w-24 rounded-lg" />
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                      <Skeleton className="h-4 flex-1 rounded-md" />
                    </div>
                  ))}
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method Skeleton */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-6 w-40 rounded-md" />
          </div>
          <Skeleton className="h-4 w-72 mt-2 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-16 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48 rounded-md" />
                <Skeleton className="h-4 w-32 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-9 w-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Invoice History Skeleton */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-6 w-36 rounded-md" />
          </div>
          <Skeleton className="h-4 w-64 mt-2 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-6">
            <div className="min-w-[500px] px-6 space-y-4">
              {/* Header row */}
              <div className="grid grid-cols-5 gap-4 pb-2 border-b">
                {["Invoice", "Date", "Amount", "Status", "Actions"].map((_, i) => (
                  <Skeleton key={i} className="h-4 w-16 rounded-md" />
                ))}
              </div>
              {/* Invoice rows */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-5 gap-4 items-center py-3">
                  <Skeleton className="h-4 w-20 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <div className="flex justify-end gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
