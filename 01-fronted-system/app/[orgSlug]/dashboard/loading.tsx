import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24 sm:w-28" />
        <Skeleton className="h-8 sm:h-9 w-48 sm:w-56" />
      </div>

      {/* Stats Row Skeleton */}
      <div className="flex items-center gap-4 sm:gap-6 py-4 sm:py-5 px-5 sm:px-6 bg-slate-50/50 rounded-xl sm:rounded-2xl border border-slate-100">
        <Skeleton variant="mint" className="h-2.5 w-2.5 rounded-full" />
        <Skeleton className="h-4 w-16" />
        <div className="h-5 w-px bg-slate-200" />
        <Skeleton className="h-4 w-24 sm:w-32" />
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
        <Skeleton className="h-4 w-20 sm:w-24 hidden sm:block" />
      </div>

      {/* Quick Access Cards */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <Skeleton variant="mint" className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-5 w-5" />
              </div>
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      </div>

      {/* Integrations Cards */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton variant="mint" className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
