import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading subscriptions">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-[150px] rounded-lg" />
          <Skeleton className="h-4 w-[250px] rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-[100px] rounded-2xl" />
        <Skeleton className="h-[100px] rounded-2xl" />
        <Skeleton className="h-[100px] rounded-2xl" />
      </div>
      <Skeleton className="h-[300px] rounded-2xl" />
    </div>
  )
}
