# Pagination Component

A fully accessible, brand-compliant pagination component for the CloudAct platform.

## Features

- **Brand Colors**: Teal (#007A78) for active pages, light teal hover states
- **Accessibility**: 44px minimum touch targets, proper ARIA labels, keyboard navigation
- **Responsive**: Works on mobile and desktop
- **Disabled States**: Proper visual feedback for disabled buttons
- **Focus States**: Visible focus indicators for keyboard users
- **Icon Support**: ChevronLeft and ChevronRight icons from lucide-react

## Design Specifications

### Colors

| State | Background | Text | Border | Hover Background |
|-------|------------|------|--------|------------------|
| Active | #007A78 (Teal) | White | #007A78 | #005F5D (Dark Teal) |
| Inactive | White | #374151 (Gray) | #E5E7EB | #F0FDFA (Light Teal) |
| Disabled | #F3F4F6 (Gray) | #9CA3AF (Light Gray) | #E5E7EB | N/A |
| Hover | #F0FDFA | #007A78 | #007A78/30 | N/A |

### Spacing and Sizing

- **Touch Target**: Minimum 44px × 44px (WCAG AAA)
- **Gap Between Items**: 4px (gap-1)
- **Border Radius**: 12px (rounded-xl)
- **Previous/Next Min Width**: 100px
- **Icon Size**: 16px (h-4 w-4)

### Typography

- **Font Weight**: 600 (semibold)
- **Font Size**: 14px (text-sm)

## Usage

### Basic Pagination

```tsx
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function MyComponent() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
```

### With Ellipsis

```tsx
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function MyComponent() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>5</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">10</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
```

### With State Management

```tsx
"use client"

import { useState } from "react"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function MyComponent() {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 10

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            disabled={currentPage === 1}
            onClick={(e) => {
              e.preventDefault()
              if (currentPage > 1) setCurrentPage(currentPage - 1)
            }}
          />
        </PaginationItem>

        {/* Page numbers */}
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <PaginationItem key={page}>
            <PaginationLink
              href="#"
              isActive={currentPage === page}
              onClick={(e) => {
                e.preventDefault()
                setCurrentPage(page)
              }}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            href="#"
            disabled={currentPage === totalPages}
            onClick={(e) => {
              e.preventDefault()
              if (currentPage < totalPages) setCurrentPage(currentPage + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
```

### Disabled States

```tsx
<PaginationPrevious href="#" disabled />
<PaginationLink href="#" disabled>2</PaginationLink>
<PaginationNext href="#" disabled />
```

## API Reference

### Pagination

Main container for pagination components.

**Props**: Standard `nav` element props

### PaginationContent

Container for pagination items (renders as `ul`).

**Props**: Standard `ul` element props

### PaginationItem

Individual pagination item wrapper (renders as `li`).

**Props**: Standard `li` element props

### PaginationLink

Clickable page number or link.

**Props**:
- `isActive?: boolean` - Whether this page is currently active
- `disabled?: boolean` - Whether the link is disabled
- `size?: "default" | "sm" | "lg" | "icon"` - Size variant
- Plus all standard `a` element props

### PaginationPrevious

Previous page button with left chevron icon.

**Props**:
- `disabled?: boolean` - Whether the button is disabled
- Plus all `PaginationLink` props

### PaginationNext

Next page button with right chevron icon.

**Props**:
- `disabled?: boolean` - Whether the button is disabled
- Plus all `PaginationLink` props

### PaginationEllipsis

Ellipsis indicator for skipped pages.

**Props**: Standard `span` element props

## Accessibility

- **ARIA Labels**: Proper labels for screen readers
  - `aria-label="pagination"` on the nav
  - `aria-label="Go to previous page"` on Previous
  - `aria-label="Go to next page"` on Next
  - `aria-current="page"` on active page
  - `aria-disabled="true"` on disabled elements
- **Keyboard Navigation**: Full keyboard support
- **Touch Targets**: Minimum 44px × 44px for all interactive elements
- **Focus Indicators**: Visible focus ring with 2px offset
- **Screen Reader Text**: Hidden text for ellipsis ("More pages")

## Examples

See `pagination-example.tsx` for comprehensive usage examples including:
- Basic pagination
- Full pagination with page numbers
- Disabled states
- State management
- Helper functions

## Checklist

✅ 1. Active page button uses Teal (#007A78) background
✅ 2. Hover state uses Light Teal (#F0FDFA) background
✅ 3. Disabled state styled with gray colors
✅ 4. Previous/Next buttons styled with icons
✅ 5. Ellipsis styled appropriately
✅ 6. Proper spacing between items (4px gap)
✅ 7. Touch targets minimum 44px × 44px
✅ 8. Focus states visible with ring-2 and offset-2
✅ 9. Border radius consistent (rounded-xl = 12px)
✅ 10. Icons sized correctly (16px = h-4 w-4)

## Testing

The component has been designed with the following in mind:
- Visual regression testing for all states
- Keyboard navigation testing
- Screen reader compatibility
- Touch target size verification
- Color contrast compliance (WCAG AA)
