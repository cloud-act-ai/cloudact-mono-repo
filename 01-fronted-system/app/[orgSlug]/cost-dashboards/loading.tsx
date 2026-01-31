import { Skeleton } from "@/components/ui/skeleton"

export default function CostDashboardsLoading() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading cost dashboards"
    >
      {/* Header Skeleton - Premium pattern */}
      <div className="flex items-start gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 sm:h-8 w-40 sm:w-48" />
          <Skeleton className="h-4 sm:h-5 w-64 sm:w-80" />
        </div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton variant="mint" className="h-10 w-10 rounded-xl flex-shrink-0" />
              <Skeleton className="h-4 w-20 sm:w-24" />
            </div>
            <Skeleton className="h-7 sm:h-8 w-28 sm:w-32" />
            <Skeleton className="h-3 w-16 sm:w-20 mt-2" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <Skeleton className="h-5 w-36 sm:w-40 mb-4 sm:mb-6" />
        <Skeleton className="h-52 sm:h-64 w-full rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
          <Skeleton className="h-5 w-40 sm:w-48" />
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 sm:px-6 py-4 flex items-center gap-3 sm:gap-4">
              <Skeleton variant="mint" className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-32 sm:w-40" />
                <Skeleton className="h-3 w-20 sm:w-24" />
              </div>
              <Skeleton className="h-5 w-20 sm:w-24 flex-shrink-0 hidden sm:block" />
              <Skeleton className="h-4 w-12 sm:w-16 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
