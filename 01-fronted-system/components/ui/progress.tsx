import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  variant?: 'teal' | 'coral' | 'default'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const variantClasses = {
  teal: 'bg-[var(--cloudact-mint)] dark:bg-[var(--cloudact-mint-light)]',
  coral: 'bg-[var(--cloudact-coral)] dark:bg-[var(--cloudact-coral-light)]',
  default: 'bg-primary',
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value = 0,
      max = 100,
      variant = 'teal',
      size = 'md',
      showLabel = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    return (
      <div className="w-full space-y-1">
        <div
          ref={ref}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={`Progress: ${percentage.toFixed(0)}%`}
          className={cn(
            'relative w-full overflow-hidden rounded-full bg-muted dark:bg-muted/50',
            sizeClasses[size],
            className
          )}
          {...props}
        >
          <div
            className={cn(
              'h-full transition-all duration-300 ease-in-out rounded-full',
              variantClasses[variant]
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && (
          <div className="text-xs text-[#8E8E93] text-right">
            {percentage.toFixed(0)}%
          </div>
        )}
      </div>
    )
  }
)

Progress.displayName = 'Progress'

export { Progress }
