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
        // Focus state - Mint
        'focus-visible:border-[var(--cloudact-mint)] focus-visible:ring-2 focus-visible:ring-[var(--cloudact-mint)]/20',
        'dark:focus-visible:border-[var(--cloudact-mint-light)] dark:focus-visible:ring-[var(--cloudact-mint-light)]/20',
        // Hover state - Mint
        'hover:border-[var(--cloudact-mint)]/50 dark:hover:border-[var(--cloudact-mint-light)]/50',
        // Error state - Coral
        'aria-invalid:border-[var(--cloudact-coral)] aria-invalid:ring-2 aria-invalid:ring-[var(--cloudact-coral)]/20',
        'aria-invalid:focus-visible:border-[var(--cloudact-coral)] aria-invalid:focus-visible:ring-[var(--cloudact-coral)]/20',
        // Placeholder
        'placeholder:text-[#8E8E93]',
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
