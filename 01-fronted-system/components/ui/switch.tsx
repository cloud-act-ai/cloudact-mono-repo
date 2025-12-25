"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent outline-none transition-all',
        // Checked state - Mint (#90FCA6)
        'data-[state=checked]:bg-[#90FCA6]',
        // Unchecked state
        'data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
        // Focus state - Mint ring
        'focus-visible:ring-2 focus-visible:ring-[#90FCA6]/20 focus-visible:ring-offset-2',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 rounded-full ring-0 transition-transform',
          // Thumb background
          'bg-background',
          'dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground',
          // Transform states
          'data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
