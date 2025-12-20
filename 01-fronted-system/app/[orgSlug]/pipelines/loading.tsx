export default function PipelinesLoading() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-[34px] w-64 bg-[#007A78]/5 rounded-lg animate-pulse" />
        <div className="h-5 w-96 bg-[#007A78]/5 rounded-lg animate-pulse" />
      </div>

      {/* Info Alert Skeleton */}
      <div className="health-card bg-[#007A78]/5 p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-[#E5E5EA] rounded-full animate-pulse" />
          <div className="h-5 flex-1 bg-[#E5E5EA] rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Available Pipelines Section */}
      <div className="space-y-4">
        <div className="h-[22px] w-48 bg-[#007A78]/5 rounded-lg animate-pulse" />

        {/* Pipelines Table Skeleton */}
        <div className="health-card p-0 overflow-hidden">
          {/* Table Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5EA]">
            <div className="h-5 w-64 bg-[#007A78]/5 rounded-lg animate-pulse" />
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#E5E5EA]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-4 sm:px-6 py-4 flex items-center gap-4">
                {/* Pipeline Name */}
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 bg-[#007A78]/5 rounded-lg animate-pulse" />
                  <div className="h-4 w-64 bg-[#007A78]/5 rounded-lg animate-pulse" />
                </div>

                {/* Provider Badge */}
                <div className="h-6 w-16 bg-[#007A78]/5 rounded-full animate-pulse" />

                {/* Domain Badge */}
                <div className="h-6 w-20 bg-[#007A78]/5 rounded-full animate-pulse" />

                {/* Status Badge */}
                <div className="h-6 w-24 bg-[#007A78]/5 rounded-full animate-pulse" />

                {/* Run Button */}
                <div className="h-11 w-24 bg-[#007A78]/5 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Run History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-[22px] w-32 bg-[#007A78]/5 rounded-lg animate-pulse" />
          <div className="h-11 w-28 bg-[#007A78]/5 rounded-xl animate-pulse" />
        </div>

        {/* History Table Skeleton */}
        <div className="health-card p-0 overflow-hidden">
          <div className="divide-y divide-[#E5E5EA]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 sm:px-6 py-4 flex items-center gap-4">
                {/* Expand Icon */}
                <div className="h-4 w-4 bg-[#007A78]/5 rounded animate-pulse" />

                {/* Pipeline Info */}
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-40 bg-[#007A78]/5 rounded-lg animate-pulse" />
                  <div className="h-3 w-24 bg-[#007A78]/5 rounded-lg animate-pulse" />
                </div>

                {/* Status */}
                <div className="h-6 w-20 bg-[#007A78]/5 rounded-full animate-pulse" />

                {/* Started */}
                <div className="h-4 w-32 bg-[#007A78]/5 rounded-lg animate-pulse" />

                {/* Duration */}
                <div className="h-4 w-16 bg-[#007A78]/5 rounded-lg animate-pulse" />

                {/* Trigger */}
                <div className="h-6 w-20 bg-[#007A78]/5 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coming Soon Section */}
      <div className="health-card p-6 sm:p-8 text-center">
        <div className="h-4 w-96 mx-auto bg-[#007A78]/5 rounded-lg animate-pulse" />
      </div>
    </div>
  )
}
