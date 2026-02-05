import { Skeleton } from "@/components/ui/skeleton"

export default function PersonalSettingsLoading() {
  return (
    <div
      className="space-y-4 sm:space-y-6 lg:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading personal settings"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <Skeleton variant="mint" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-7 sm:h-8 w-40 sm:w-48" />
            <Skeleton className="h-4 sm:h-5 w-64 sm:w-80" />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 -mb-px">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-t-lg" />
          ))}
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 sm:p-8 space-y-7">
          {/* Email field */}
          <div className="flex items-start gap-5">
            <div className="w-1 h-16 rounded-full bg-gradient-to-b from-[#90FCA6] to-[#6EE890]" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>

          <Skeleton className="h-px w-full" />

          {/* Name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>

          {/* Phone field */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-12 w-28 rounded-xl" />
              <Skeleton className="h-12 flex-1 rounded-xl" />
            </div>
            <Skeleton className="h-3 w-56" />
          </div>

          {/* Timezone field */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>

        {/* Save Footer */}
        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50">
          <Skeleton variant="mint" className="h-11 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
