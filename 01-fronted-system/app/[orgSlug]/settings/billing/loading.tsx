import { Skeleton } from "@/components/ui/skeleton"

export default function BillingLoading() {
  return (
    <div
      className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading billing information"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-7 sm:h-8 w-48 sm:w-56" />
            <Skeleton className="h-4 sm:h-5 w-64 sm:w-80" />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Plan Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <Skeleton variant="mint" className="h-14 w-14 rounded-2xl flex-shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-16 rounded-lg" />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-28" />
                ))}
              </div>
            </div>
          </div>
          <Skeleton variant="mint" className="h-11 w-36 rounded-xl" />
        </div>
      </div>

      {/* Payment Method Section */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>

      {/* Billing History Section */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden">
        <div className="py-8 flex flex-col items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
    </div>
  )
}
