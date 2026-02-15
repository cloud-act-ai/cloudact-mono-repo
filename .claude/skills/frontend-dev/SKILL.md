---
name: frontend-dev
description: |
  Next.js frontend development for CloudAct. Pages, components, server actions, Supabase auth.
  Use when: creating pages, building components, implementing server actions, working with Supabase auth,
  or following CloudAct's Next.js patterns.
---

# Frontend Development

## Overview
CloudAct frontend uses Next.js 16 with React 19, TypeScript, Supabase auth, and Stripe billing.

## Environments

| Env | Frontend URL | API URL | Supabase Project | Stripe Mode | Env File |
|-----|-------------|---------|-----------------|-------------|----------|
| local | `http://localhost:3000` | `http://localhost:8000` | `kwroaccbrxppfiysqlzs` | TEST | `.env.local` |
| test/stage | Cloud Run URL | Cloud Run URL | `kwroaccbrxppfiysqlzs` | TEST | `.env.stage` |
| prod | `https://cloudact.ai` | `https://api.cloudact.ai` | `ovfxswhkkshouhsryzaf` | LIVE | `.env.prod` |

> **Note:** local/test/stage all use the same Supabase project. No separate `cloudact-stage`.

### Local Dev

```bash
REPO_ROOT=/Users/openclaw/.openclaw/workspace/cloudact-mono-repo

cd $REPO_ROOT/01-fronted-system && npx next dev --webpack --port 3000
```

### Environment Variables (Key Ones)

| Variable | Local | Prod |
|----------|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kwroaccbrxppfiysqlzs.supabase.co` | `https://ovfxswhkkshouhsryzaf.supabase.co` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `https://api.cloudact.ai` |
| `NEXT_PUBLIC_PIPELINE_URL` | `http://localhost:8001` | `https://pipeline.cloudact.ai` |
| `STRIPE_SECRET_KEY` | `sk_test_*` | `sk_live_*` |

## Key Locations
- **App Routes:** `01-fronted-system/app/`
- **Components:** `01-fronted-system/components/`
- **Server Actions:** `01-fronted-system/actions/`
- **Utilities:** `01-fronted-system/lib/`
- **Tests:** `01-fronted-system/tests/`

## Project Structure
```
01-fronted-system/
├── app/
│   ├── [orgSlug]/           # Org-scoped console
│   │   ├── layout.tsx       # Org layout with sidebar
│   │   ├── dashboard/       # Dashboard pages
│   │   ├── billing/         # Stripe billing
│   │   ├── cost-dashboards/ # Cost analytics
│   │   ├── integrations/    # Provider setup
│   │   ├── pipelines/       # Pipeline management
│   │   └── settings/        # Org settings
│   ├── auth/                # Auth pages
│   └── layout.tsx           # Root layout
├── actions/                 # Server actions
├── components/              # UI components
│   ├── ui/                  # Base components (shadcn)
│   ├── dashboard-sidebar.tsx
│   └── ...
├── lib/
│   ├── api-client.ts        # API wrapper
│   ├── nav-data.ts          # Shared nav groups, formatOrgName, getUserInitials
│   ├── costs/               # Cost helpers, types, design tokens
│   ├── supabase/            # Supabase client
│   └── utils.ts             # Helpers
└── supabase/                # Supabase migrations
```

## Brand & Design

See `/design` skill for full brand color system, typography, and button patterns.
See `/console-ui` skill for console component library, sidebar, and dashboard layouts.
See `/charts` skill for Recharts chart library and data visualizations.

**Quick ref:** Mint `#90FCA6` (primary), Coral `#FF6C5E` (secondary), DM Sans 14px base, light-only theme. Use `.console-*` CSS classes for typography.

## Theming Standard (CSS Variables)

All console components use CSS variables for colors — NOT hardcoded `slate-*` Tailwind classes. See `/design` skill "CSS Variable Migration Standard" for the complete mapping table.

**Quick mapping:**
- Text: `--text-primary` / `--text-secondary` / `--text-tertiary` / `--text-muted`
- Surfaces: `--surface-primary` / `--surface-secondary` / `--surface-hover`
- Borders: `--border-subtle` / `--border-medium`

**Example:** `text-slate-500` → `text-[var(--text-tertiary)]`, `border-slate-200` → `border-[var(--border-subtle)]`

## Shared Navigation

Navigation links are defined in `lib/nav-data.ts` (single source of truth). Both `dashboard-sidebar.tsx` and `mobile-nav.tsx` import from it. To add/change nav items, edit `getNavGroups()` in `lib/nav-data.ts`.

Shared utilities: `formatOrgName()`, `getUserInitials()`, `formatUserName()`, `NavItem`/`NavGroup` types.

## Instructions

### 1. Create New Page
```tsx
// app/[orgSlug]/my-feature/page.tsx
import { Suspense } from "react"
import { MyFeatureContent } from "@/components/my-feature-content"
import { MyFeatureLoading } from "./loading"

interface PageProps {
  params: { orgSlug: string }
  searchParams: { [key: string]: string | undefined }
}

export default async function MyFeaturePage({ params, searchParams }: PageProps) {
  const { orgSlug } = params

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">My Feature</h1>
      <Suspense fallback={<MyFeatureLoading />}>
        <MyFeatureContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  )
}
```

### 2. Create Loading State
```tsx
// app/[orgSlug]/my-feature/loading.tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function MyFeatureLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
```

### 3. Create Server Action
```tsx
// actions/my-feature.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { apiClient } from "@/lib/api-client"
import { revalidatePath } from "next/cache"

export async function createFeature(orgSlug: string, data: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const response = await apiClient.post(`/api/v1/my-feature/${orgSlug}`, {
    name: data.get("name"),
    description: data.get("description"),
    amount: parseFloat(data.get("amount") as string),
  })

  revalidatePath(`/${orgSlug}/my-feature`)
  return response
}

export async function listFeatures(orgSlug: string) {
  const response = await apiClient.get(`/api/v1/my-feature/${orgSlug}`)
  return response.data
}
```

### 4. Create Component
```tsx
// components/my-feature-content.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createFeature, listFeatures } from "@/actions/my-feature"
import useSWR from "swr"

interface Props {
  orgSlug: string
}

export function MyFeatureContent({ orgSlug }: Props) {
  const { data: features, mutate } = useSWR(
    `features-${orgSlug}`,
    () => listFeatures(orgSlug)
  )
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    try {
      await createFeature(orgSlug, formData)
      mutate()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create Feature</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <Input name="name" placeholder="Feature name" required />
            <Input name="amount" type="number" placeholder="Amount" required />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <div className="grid gap-4">
        {features?.map((feature) => (
          <Card key={feature.id}>
            <CardContent className="pt-4">
              <h3 className="font-semibold">{feature.name}</h3>
              <p className="text-muted-foreground">${feature.amount}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

### 5. Add to Sidebar Navigation
```tsx
// lib/nav-data.ts — Single source of truth for all navigation
// Add new items to getNavGroups() — both sidebar and mobile nav pick it up
import { getNavGroups } from "@/lib/nav-data"
```

### 6. Create API Client Call
```tsx
// lib/api-client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PIPELINE_URL = process.env.NEXT_PUBLIC_PIPELINE_URL || "http://localhost:8001"

export const apiClient = {
  async get(path: string) {
    const res = await fetch(`${API_URL}${path}`, {
      headers: await getAuthHeaders(),
    })
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  },

  async post(path: string, body: any) {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        ...await getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  },
}

// Use PIPELINE_URL for pipeline runs (port 8001)
export const pipelineClient = {
  async runPipeline(orgSlug: string, provider: string, domain: string, pipeline: string) {
    const res = await fetch(
      `${PIPELINE_URL}/api/v1/pipelines/run/${orgSlug}/${provider}/${domain}/${pipeline}`,
      { method: "POST", headers: await getAuthHeaders() }
    )
    return res.json()
  },
}
```

### 7. Add Tests
```tsx
// tests/my-feature/my-feature.test.ts
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MyFeatureContent } from "@/components/my-feature-content"

describe("MyFeatureContent", () => {
  it("renders create form", () => {
    render(<MyFeatureContent orgSlug="test_org" />)
    expect(screen.getByText("Create Feature")).toBeInTheDocument()
  })
})
```

## UI Patterns

### Form with Validation (Zod)
```tsx
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

const schema = z.object({
  name: z.string().min(1, "Required"),
  amount: z.number().positive("Must be positive"),
})

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  })
  // ...
}
```

### Data Table
```tsx
import { DataTable } from "@/components/ui/data-table"

const columns = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "amount", header: "Amount" },
  { accessorKey: "status", header: "Status" },
]

<DataTable columns={columns} data={features} />
```

### Charts

See `/charts` skill for full Recharts component library (CostTrendChart, CostRingChart, MetricGrid, etc.).

## Port Routing
| URL Pattern | Service | Port |
|-------------|---------|------|
| `/api/v1/*` (except pipelines) | api-service | 8000 |
| `/api/v1/pipelines/run/*` | pipeline-service | 8001 |

## Validation Checklist
- [ ] Page created in app/[orgSlug]/
- [ ] Loading state added
- [ ] Server action implemented
- [ ] Component uses proper patterns
- [ ] Sidebar navigation updated
- [ ] Tests written
- [ ] Brand colors used correctly

## Example Prompts

```
# Creating Pages
"Create a new page for analytics"
"Add a settings page under org"
"Implement loading state for page"

# Components
"Create a data table component"
"Add a form with validation"
"Build a chart for cost data"

# Server Actions
"Create server action for form submit"
"Implement data fetching action"
"Add revalidation after mutation"

# Patterns
"How do I use SWR for data fetching?"
"Add Supabase auth to page"
"Implement proper error handling"

# Styling
"Use the correct brand colors"
"Add badge with mint color"
```

## Source Specifications

Requirements consolidated from:
- `00_CONSOLE_UI_DESIGN_STANDARDS.md` - Console UI design standards and component patterns
- `00_INTERNATIONALIZATION.md` - Internationalization and localization requirements

## Development Rules (Non-Negotiable)

- **No over-engineering** - Simple, direct fixes. Don't add features or refactor beyond what was asked.
- **Multi-tenancy support** - Proper `orgSlug` isolation in every page and component
- **Don't break existing functionality** - Run `npm run build` and `npm run test` before/after changes
- **Reusability and repeatability** - Follow existing component patterns. Use shadcn/ui primitives.
- **Enterprise-grade for 10k customers** - Must scale. Proper loading states, error boundaries, pagination.
- **Update skills with learnings** - Document UI patterns and fixes in skill files

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `design` | Brand colors, typography, button system |
| `console-ui` | Console component library, sidebar, dashboard layouts |
| `charts` | Recharts chart library for data visualizations |
| `home-page` | Landing page patterns (different from console) |
| `api-dev` | Backend endpoints |
| `test-orchestration` | Frontend testing |
| `integration-setup` | Provider pages |
