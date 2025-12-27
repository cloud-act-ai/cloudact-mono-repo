import { Skeleton } from "@/components/ui/skeleton"

/**
 * Root loading state for org routes.
 * Provides consistent skeleton UI during page transitions to prevent layout flash.
 */
export default function OrgRootLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300" role="status" aria-busy="true" aria-label="Loading page">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-[250px] rounded-lg" />
        <Skeleton className="h-4 w-[350px] rounded-md" />
      </div>

      {/* Content area skeleton */}
      <div className="space-y-6">
        {/* Stats row skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-[100px] rounded-2xl" />
          <Skeleton className="h-[100px] rounded-2xl" />
          <Skeleton className="h-[100px] rounded-2xl" />
          <Skeleton className="h-[100px] rounded-2xl" />
        </div>

        {/* Main content skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-[300px] rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-[200px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
