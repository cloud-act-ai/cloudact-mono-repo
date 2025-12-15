import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-[80px] w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base outline-none transition-[color,border-color,box-shadow] md:text-sm',
        // Border - visible 1px solid
        'border-[rgba(0,0,0,0.1)] dark:border-[rgba(255,255,255,0.1)]',
        // Focus state - Teal (#007A78)
        'focus-visible:border-[#007A78] focus-visible:ring-2 focus-visible:ring-[#007A78]/20',
        // Hover state - Teal
        'hover:border-[#007A78]/50',
        // Error state - Coral (#FF6E50)
        'aria-invalid:border-[#FF6E50] aria-invalid:ring-2 aria-invalid:ring-[#FF6E50]/20',
        'aria-invalid:focus-visible:border-[#FF6E50] aria-invalid:focus-visible:ring-[#FF6E50]/20',
        // Placeholder
        'placeholder:text-[#8E8E93]',
        // Selection
        'selection:bg-primary selection:text-primary-foreground',
        // Disabled state
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
        // Dark mode
        'dark:bg-input/30',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
