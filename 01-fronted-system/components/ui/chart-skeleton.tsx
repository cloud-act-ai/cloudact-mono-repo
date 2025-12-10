import { Skeleton } from "./skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card"

interface ChartSkeletonProps {
  title?: string
  description?: string
  height?: string
}

export function ChartSkeleton({
  title = "Loading chart...",
  description,
  height = "h-[300px]"
}: ChartSkeletonProps) {
  return (
    <Card className="console-chart-card">
      <CardHeader>
        <CardTitle className="console-card-title">
          {title}
        </CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className={`${height} flex items-end justify-between gap-2 px-4`}>
          {/* Simulated bar chart skeleton */}
          <Skeleton className="w-full h-[60%] rounded-t-md" />
          <Skeleton className="w-full h-[85%] rounded-t-md" />
          <Skeleton className="w-full h-[45%] rounded-t-md" />
          <Skeleton className="w-full h-[70%] rounded-t-md" />
          <Skeleton className="w-full h-[90%] rounded-t-md" />
          <Skeleton className="w-full h-[55%] rounded-t-md" />
          <Skeleton className="w-full h-[75%] rounded-t-md" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}
