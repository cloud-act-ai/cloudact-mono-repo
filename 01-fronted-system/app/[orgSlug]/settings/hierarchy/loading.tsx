import { Skeleton } from "@/components/ui/skeleton"

export default function HierarchyLoading() {
  return (
    <div
      className="space-y-4 sm:space-y-6 lg:space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading hierarchy settings"
    >
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <Skeleton variant="mint" className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl flex-shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-7 sm:h-8 w-52 sm:w-64" />
          <Skeleton className="h-4 sm:h-5 w-56 sm:w-72" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Skeleton variant="mint" className="h-10 sm:h-11 w-28 sm:w-32 rounded-xl" />
        <Skeleton className="h-10 sm:h-11 w-28 sm:w-36 rounded-xl" />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-28 rounded-t-lg flex-shrink-0" />
          ))}
        </div>
      </div>

      {/* Tree View Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 min-h-[400px]">
        <div className="space-y-2">
          {/* Root level items */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-3 py-2.5 px-3">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
              </div>
              {/* Child items */}
              {i === 1 && [1, 2].map((j) => (
                <div key={j} className="flex items-center gap-3 py-2.5 px-3" style={{ paddingLeft: "40px" }}>
                  <Skeleton className="h-6 w-6 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-14 rounded" />
                  <Skeleton className="h-5 w-16 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
