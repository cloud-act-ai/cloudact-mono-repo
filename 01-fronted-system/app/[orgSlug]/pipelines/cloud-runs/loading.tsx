export default function CostRunsLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Header Skeleton */}
      <div className="mb-10">
        <div className="h-8 w-64 skeleton" />
        <div className="h-4 w-96 skeleton mt-2" />
      </div>

      {/* Stats Row Skeleton */}
      <div className="flex items-center gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 skeleton rounded-xl" />
            <div>
              <div className="h-6 w-8 skeleton" />
              <div className="h-3 w-16 skeleton mt-1" />
            </div>
          </div>
        ))}
      </div>

      {/* Info Card Skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 skeleton rounded-full" />
          <div className="h-5 flex-1 skeleton" />
        </div>
      </div>

      {/* Pipeline Section Skeleton */}
      <div className="space-y-4">
        <div className="h-4 w-40 skeleton" />
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="h-5 w-56 skeleton" />
          </div>
          <div className="divide-y divide-slate-200">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 skeleton" />
                  <div className="h-4 w-64 skeleton" />
                </div>
                <div className="h-6 w-20 skeleton rounded-full" />
                <div className="h-11 w-24 skeleton rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Run History Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 skeleton" />
          <div className="h-9 w-24 skeleton rounded-lg" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-200">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="h-4 w-4 skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 skeleton" />
                  <div className="h-3 w-24 skeleton" />
                </div>
                <div className="h-6 w-20 skeleton rounded-full" />
                <div className="h-4 w-28 skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
