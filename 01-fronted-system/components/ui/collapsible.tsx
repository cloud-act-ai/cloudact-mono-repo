"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = React.forwardRef<
    React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & {
        showChevron?: boolean
    }
>(({ className, children, showChevron = true, ...props }, ref) => (
    <CollapsiblePrimitive.Trigger
        ref={ref}
        className={cn(
            "flex w-full items-center justify-between py-3 px-1 font-medium text-base transition-colors duration-150 ease-in-out",
            "hover:bg-[#90FCA6]/10 hover:text-[#000000] dark:hover:bg-[#90FCA6]/10 dark:hover:text-[#000000]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90FCA6] focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "text-[var(--text-primary)] dark:text-[var(--surface-secondary)]",
            "[&[data-state=open]>svg]:rotate-180",
            className
        )}
        {...props}
    >
        {children}
        {showChevron && (
            <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-200 ease-in-out text-[var(--text-tertiary)] dark:text-[var(--text-muted)]"
                aria-hidden="true"
            />
        )}
    </CollapsiblePrimitive.Trigger>
))
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName

const CollapsibleContent = React.forwardRef<
    React.ElementRef<typeof CollapsiblePrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <CollapsiblePrimitive.Content
        ref={ref}
        className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
        {...props}
    >
        <div className={cn("pb-4 pt-2 px-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]", className)}>
            {children}
        </div>
    </CollapsiblePrimitive.Content>
))

CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
