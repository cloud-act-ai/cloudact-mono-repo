import { Skeleton } from "./skeleton"
import { Card, CardContent, CardDescription, CardHeader } from "./card"

interface CardSkeletonProps {
  count?: number
  showDescription?: boolean
}

export function CardSkeleton({ count = 1, showDescription = false }: CardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="console-stat-card">
          <CardHeader className="pb-2">
            {showDescription && <CardDescription><Skeleton className="h-3 w-24" /></CardDescription>}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
