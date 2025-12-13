import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-xl border bg-background px-3 py-1 text-base outline-none transition-[color,border-color,box-shadow] md:text-sm',
        // Border - visible 1px solid
        'border-[rgba(0,0,0,0.1)] dark:border-[rgba(255,255,255,0.1)]',
        // Focus state - Teal (#007A78 light, #14B8A6 dark)
        'focus-visible:border-[#007A78] focus-visible:ring-2 focus-visible:ring-[#007A78]/20',
        'dark:focus-visible:border-[#14B8A6] dark:focus-visible:ring-[#14B8A6]/20',
        // Hover state - Teal
        'hover:border-[#007A78]/50 dark:hover:border-[#14B8A6]/50',
        // Error state - Coral (#FF6E50)
        'aria-invalid:border-[#FF6E50] aria-invalid:ring-2 aria-invalid:ring-[#FF6E50]/20',
        'aria-invalid:focus-visible:border-[#FF6E50] aria-invalid:focus-visible:ring-[#FF6E50]/20',
        // Placeholder
        'placeholder:text-muted-foreground',
        // Selection
        'selection:bg-primary selection:text-primary-foreground',
        // Disabled state
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
        // Dark mode
        'dark:bg-input/40',
        // File input
        'file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
