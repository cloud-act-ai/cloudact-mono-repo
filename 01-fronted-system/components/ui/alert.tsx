import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground border-border',
        destructive:
          'bg-[#FF6E50]/5 dark:bg-[#FF6E50]/10 border-[#FF6E50] text-[#FF6E50] dark:text-[#FF6E50] [&>svg]:text-[#FF6E50]',
        success:
          'bg-[#007A78]/5 dark:bg-[#007A78]/10 border-[#007A78] text-[#007A78] dark:text-[#007A78] [&>svg]:text-[#007A78]',
        warning:
          'bg-[#FF6E50]/5 dark:bg-[#FF6E50]/10 border-[#FF6E50] text-[#FF6E50] dark:text-[#FF6E50] [&>svg]:text-[#FF6E50]',
        info:
          'bg-teal-50 dark:bg-teal-950 border-[#007A78] text-teal-900 dark:text-teal-200 [&>svg]:text-[#007A78]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-[#8E8E93] col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
