import { Skeleton } from "@/components/ui/skeleton"

export default function InviteLoading() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-0 space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading team members"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-7 sm:h-8 w-40 sm:w-52" />
            <Skeleton className="h-4 sm:h-5 w-56 sm:w-72" />
          </div>
        </div>
        <Skeleton variant="mint" className="h-10 sm:h-11 w-full sm:w-36 rounded-lg sm:rounded-xl" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-6 sm:h-7 w-10 sm:w-14" />
                <Skeleton className="h-3 sm:h-4 w-14 sm:w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Member Cards */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-4 border-b border-[var(--border-subtle)] last:border-b-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-28 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
