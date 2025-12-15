import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 aria-invalid:outline-destructive transition-all overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-sm [a&]:hover:bg-primary/90 [a&]:hover:shadow',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground shadow-sm [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-sm [a&]:hover:bg-destructive/90 [a&]:hover:shadow',
        outline:
          'text-foreground border-border bg-background [a&]:hover:bg-accent [a&]:hover:text-accent-foreground [a&]:hover:border-ring',
        success:
          'border-transparent bg-[#007A78] text-white shadow-sm [a&]:hover:bg-[#005F5D] dark:bg-[#007A78] dark:[a&]:hover:bg-[#005F5D]',
        warning:
          'border-transparent bg-[#FF6E50] text-white shadow-sm [a&]:hover:bg-[#E55A3C] dark:bg-[#FF6E50] dark:[a&]:hover:bg-[#E55A3C]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
