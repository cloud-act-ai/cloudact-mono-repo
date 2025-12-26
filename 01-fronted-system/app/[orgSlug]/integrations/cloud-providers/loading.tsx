import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading cloud providers">
      <div className="space-y-2">
        <Skeleton className="h-8 w-[200px] rounded-lg" />
        <Skeleton className="h-4 w-[300px] rounded-md" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[200px] rounded-2xl" />
        <Skeleton className="h-[200px] rounded-2xl" />
        <Skeleton className="h-[200px] rounded-2xl" />
      </div>
    </div>
  )
}
