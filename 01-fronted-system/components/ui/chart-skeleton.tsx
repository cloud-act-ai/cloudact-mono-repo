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
    <Card className="console-chart-card rounded-2xl" role="status" aria-busy="true" aria-label="Loading chart">
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
          {/* Simulated bar chart skeleton with rounded tops matching design system */}
          <Skeleton className="w-full h-[60%] rounded-t-lg" />
          <Skeleton className="w-full h-[85%] rounded-t-lg" />
          <Skeleton className="w-full h-[45%] rounded-t-lg" />
          <Skeleton className="w-full h-[70%] rounded-t-lg" />
          <Skeleton className="w-full h-[90%] rounded-t-lg" />
          <Skeleton className="w-full h-[55%] rounded-t-lg" />
          <Skeleton className="w-full h-[75%] rounded-t-lg" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-3 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}
