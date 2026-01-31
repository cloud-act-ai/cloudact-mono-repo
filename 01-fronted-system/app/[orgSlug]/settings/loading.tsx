import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
    >
      {/* Header Skeleton - Premium pattern */}
      <div className="flex items-start gap-3 sm:gap-4">
        <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 sm:h-8 w-40 sm:w-48" />
          <Skeleton className="h-4 sm:h-5 w-64 sm:w-80" />
        </div>
      </div>

      {/* Settings Cards - Enterprise admin pattern */}
      <div className="space-y-4 sm:space-y-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* Card Header */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100">
              <div className="flex items-center gap-3 sm:gap-4">
                <Skeleton variant="mint" className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-32 sm:w-40" />
                  <Skeleton className="h-3.5 w-48 sm:w-64" />
                </div>
              </div>
            </div>

            {/* Card Content */}
            <div className="px-5 sm:px-6 py-5 sm:py-6 space-y-5">
              {/* Form field */}
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 sm:h-11 w-full rounded-xl" />
              </div>
              {/* Form field */}
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 sm:h-11 w-full rounded-xl" />
              </div>
              {/* Actions */}
              <div className="flex justify-end gap-2.5 pt-2">
                <Skeleton className="h-10 w-20 rounded-xl" />
                <Skeleton variant="mint" className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
