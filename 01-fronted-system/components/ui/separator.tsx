'use client'

import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'

import { cn } from '@/lib/utils'

interface SeparatorProps extends React.ComponentProps<typeof SeparatorPrimitive.Root> {
  label?: string
  labelClassName?: string
}

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  label,
  labelClassName,
  ...props
}: SeparatorProps) {
  // If label is provided, use the labeled separator pattern
  if (label && orientation === 'horizontal') {
    return (
      <div
        className={cn(
          'relative flex items-center my-4',
          className,
        )}
        role={decorative ? 'presentation' : 'separator'}
        aria-label={!decorative ? label : undefined}
      >
        <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/10" />
        <span
          className={cn(
            'px-3 text-sm font-medium text-muted-foreground',
            labelClassName,
          )}
        >
          {label}
        </span>
        <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/10" />
      </div>
    )
  }

  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // Brand color: Light gray rgba(0,0,0,0.06) for light mode
        'shrink-0',
        'bg-black/[0.06] dark:bg-white/10',
        // Horizontal: 1px height, full width, vertical margins
        'data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=horizontal]:my-4',
        // Vertical: 1px width, full height, horizontal margins
        'data-[orientation=vertical]:w-px data-[orientation=vertical]:h-full data-[orientation=vertical]:mx-4',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
