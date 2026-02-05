import { Skeleton } from "@/components/ui/skeleton"

export default function QuotaUsageLoading() {
  return (
    <div
      className="space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading usage and quotas"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <Skeleton variant="mint" className="h-12 w-12 rounded-2xl flex-shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-5 w-64" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resource Usage Section */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />

        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden">
          {[1, 2].map((i) => (
            <div key={i} className="px-5 py-5 border-b border-slate-100 last:border-b-0">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <div className="ml-16 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Limits Section */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-44" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-6 text-center">
              <Skeleton className="h-14 w-14 rounded-2xl mx-auto mb-4" />
              <Skeleton className="h-3 w-16 mx-auto mb-2" />
              <Skeleton className="h-9 w-20 mx-auto mb-2" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-6">
        <div className="text-center py-4 space-y-4">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton variant="mint" className="h-12 w-64 mx-auto rounded-xl" />
        </div>
      </div>
    </div>
  )
}
