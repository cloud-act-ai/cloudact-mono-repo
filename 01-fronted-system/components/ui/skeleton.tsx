import { cn } from '@/lib/utils'

interface SkeletonProps extends React.ComponentProps<'div'> {
  variant?: 'default' | 'shimmer' | 'mint'
}

function Skeleton({
  className,
  variant = 'shimmer',
  ...props
}: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className={cn(
        'rounded-lg',
        variant === 'shimmer' && [
          'bg-slate-100/80',
          'relative overflow-hidden',
          'before:absolute before:inset-0 before:-translate-x-full',
          'before:animate-[shimmer_1.5s_ease-in-out_infinite]',
          'before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent',
          'dark:bg-slate-800/50 dark:before:via-white/10',
        ],
        variant === 'mint' && [
          'bg-[var(--cloudact-mint)]/[0.06]',
          'relative overflow-hidden',
          'before:absolute before:inset-0 before:-translate-x-full',
          'before:animate-[shimmer_1.5s_ease-in-out_infinite]',
          'before:bg-gradient-to-r before:from-transparent before:via-[var(--cloudact-mint)]/10 before:to-transparent',
        ],
        variant === 'default' && 'bg-slate-100 animate-pulse dark:bg-slate-800/50',
        className
      )}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export { Skeleton }
