import { cn } from '@/lib/utils'

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'teal' | 'coral' | 'default'
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-3',
  xl: 'h-16 w-16 border-4',
}

const variantClasses = {
  teal: 'border-[#007A78] border-t-transparent',
  coral: 'border-[#FF6E50] border-t-transparent',
  default: 'border-[#007A78] border-t-transparent',
}

function Spinner({
  size = 'md',
  variant = 'teal',
  className,
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        'inline-block animate-spin rounded-full',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export { Spinner }
