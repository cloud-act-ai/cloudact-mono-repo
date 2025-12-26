import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6" role="status" aria-busy="true" aria-label="Loading edit form">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <div>
          <Skeleton className="h-8 w-64 mb-2 rounded-lg" />
          <Skeleton className="h-4 w-96 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-[150px] rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
    </div>
  )
}
