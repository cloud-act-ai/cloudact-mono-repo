import { Skeleton } from "@/components/ui/skeleton"

export default function PlansLoading() {
  return (
    <div
      className="max-w-5xl mx-auto space-y-6"
      role="status"
      aria-busy="true"
      aria-label="Loading plans"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-6"
          >
            {/* Plan Header */}
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-5 w-24" />
            </div>

            {/* Price */}
            <div className="mb-6">
              <Skeleton className="h-9 w-24" />
            </div>

            {/* Features */}
            <div className="space-y-3 mb-6">
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>

            {/* Button */}
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 p-6">
        <div className="flex justify-center">
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
    </div>
  )
}
