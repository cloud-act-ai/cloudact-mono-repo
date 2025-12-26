export default function CostDashboardsLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-2 mb-8">
        <div className="h-8 w-48 skeleton" />
        <div className="h-4 w-80 skeleton" />
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 skeleton rounded-xl" />
              <div className="h-4 w-24 skeleton" />
            </div>
            <div className="h-8 w-32 skeleton" />
            <div className="h-3 w-20 skeleton mt-2" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="h-5 w-40 skeleton mb-6" />
        <div className="h-64 skeleton rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="h-5 w-48 skeleton" />
        </div>
        <div className="divide-y divide-slate-200">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <div className="h-10 w-10 skeleton rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 skeleton" />
                <div className="h-3 w-24 skeleton" />
              </div>
              <div className="h-5 w-24 skeleton" />
              <div className="h-4 w-16 skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
