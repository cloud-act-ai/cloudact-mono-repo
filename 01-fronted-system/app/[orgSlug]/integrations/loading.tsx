import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading integrations"
    >
      {/* Header Skeleton */}
      <div className="flex items-start gap-3 sm:gap-4">
        <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 sm:h-8 w-40 sm:w-52" />
          <Skeleton className="h-4 sm:h-5 w-60 sm:w-80" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 sm:gap-6 py-4 sm:py-5 px-5 sm:px-6 bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton variant="mint" className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-5 sm:h-6 w-8" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="h-6 sm:h-8 w-px bg-slate-200" />
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-5 sm:h-6 w-8" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Provider Cards Grid */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <Skeleton variant="mint" className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex-shrink-0" />
                  <div className="space-y-1.5 min-w-0">
                    <Skeleton className="h-4 w-24 sm:w-28" />
                    <Skeleton className="h-3 w-32 sm:w-36" />
                  </div>
                </div>
                <Skeleton variant="mint" className="h-8 w-16 sm:w-20 rounded-lg sm:rounded-xl flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
