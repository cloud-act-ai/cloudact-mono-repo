'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto scrollbar-hide rounded-xl"
    >
      <table
        data-slot="table"
        className={cn(
          'w-full caption-bottom text-[13px] sm:text-sm',
          'border-separate border-spacing-0',
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        '[&_tr]:border-b [&_tr]:border-slate-100',
        'bg-slate-50/80 sticky top-0 z-10',
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        '[&_tr:last-child]:border-0',
        'divide-y divide-slate-100',
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-slate-50/50 border-t border-slate-200 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-slate-100 transition-colors duration-150',
        'hover:bg-[var(--cloudact-mint)]/[0.04]',
        'data-[state=selected]:bg-[var(--cloudact-mint)]/10',
        'focus-within:bg-[var(--cloudact-mint)]/[0.06]',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-11 px-3 sm:px-4 text-left align-middle font-semibold whitespace-nowrap',
        'text-[11px] sm:text-[12px] text-slate-500 uppercase tracking-wider',
        '[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        'first:rounded-tl-xl last:rounded-tr-xl',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-3 sm:px-4 py-3 sm:py-3.5 align-middle',
        'text-slate-700 font-medium',
        '[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        'text-slate-500 mt-4 text-[12px] sm:text-[13px] font-medium',
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
