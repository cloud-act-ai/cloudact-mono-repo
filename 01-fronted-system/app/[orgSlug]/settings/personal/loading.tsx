import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading personal settings">
      <div className="space-y-2">
        <Skeleton className="h-8 w-[200px] rounded-lg" />
        <Skeleton className="h-4 w-[300px] rounded-md" />
      </div>
      <Skeleton className="h-[300px] rounded-2xl" />
    </div>
  )
}
