"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
    <AccordionPrimitive.Item
        ref={ref}
        className={cn("border-b border-[var(--border-subtle)] dark:border-[var(--text-secondary)]", className)}
        {...props}
    />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger
            ref={ref}
            className={cn(
                "flex flex-1 items-center justify-between py-4 px-1 font-medium text-base transition-colors duration-150 ease-in-out",
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
            <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-200 ease-in-out text-[var(--text-tertiary)] dark:text-[var(--text-muted)]"
                aria-hidden="true"
            />
        </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
        {...props}
    >
        <div className={cn("pb-4 pt-2 px-1 text-[var(--text-secondary)] dark:text-[var(--text-muted)]", className)}>
            {children}
        </div>
    </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
