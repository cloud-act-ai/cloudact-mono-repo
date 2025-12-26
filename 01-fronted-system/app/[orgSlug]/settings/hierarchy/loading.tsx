import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading hierarchy">
      <div className="space-y-2">
        <Skeleton className="h-8 w-[250px] rounded-lg" />
        <Skeleton className="h-4 w-[400px] rounded-md" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-[500px] rounded-2xl" />
    </div>
  )
}
