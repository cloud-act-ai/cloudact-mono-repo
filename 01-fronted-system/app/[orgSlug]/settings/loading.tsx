import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="container mx-auto py-10 max-w-7xl space-y-8" role="status" aria-busy="true" aria-label="Loading settings">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-md" />
      </div>

      {/* Settings Cards */}
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-40 rounded-md" />
                  <Skeleton className="h-4 w-64 rounded-md" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
              <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-20 rounded-xl" />
                <Skeleton className="h-10 w-24 rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
