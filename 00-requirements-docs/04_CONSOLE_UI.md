# Console UI

**Status**: IMPLEMENTED (v1.5) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Authenticated dashboard layout, navigation, settings, and theming
> NOT public landing pages (see 04_LANDING_PAGES.md)
> NOT specific feature implementations (see individual docs)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{page}` | Page route | `dashboard`, `settings` |

---

## TERMINOLOGY

| Term | Definition | Example |
|------|------------|---------|
| **Console** | Authenticated app area | Dashboard |
| **Sidebar** | Main navigation | Left sidebar |
| **Breadcrumb** | Navigation path | Dashboard > Settings |
| **Theme** | Color scheme | Light, Dark, System |

---

## Layout Structure

### Console Layout

```
+-----------------------------------------------------------------------------+
|                           CONSOLE LAYOUT                                     |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +----------+  +----------------------------------------------------------+ |
|  | SIDEBAR  |  | HEADER                                                   | |
|  |          |  | +-- Breadcrumb                                          | |
|  | Logo     |  | +-- Search                                              | |
|  |          |  | +-- Notifications                                       | |
|  | Dashboard|  | +-- User Menu                                           | |
|  | Analytics|  +----------------------------------------------------------+ |
|  | Pipelines|  | MAIN CONTENT                                             | |
|  | Integrat.|  |                                                          | |
|  |   +Cloud |  |  Page-specific content                                  | |
|  |   +LLM   |  |                                                          | |
|  |   +SaaS  |  |                                                          | |
|  | Subscript|  |                                                          | |
|  |          |  |                                                          | |
|  | -------- |  |                                                          | |
|  | Settings |  |                                                          | |
|  | Help     |  |                                                          | |
|  |          |  |                                                          | |
|  | [Org]    |  |                                                          | |
|  | [User]   |  +----------------------------------------------------------+ |
|  +----------+                                                               |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Responsive Behavior

```
+---------------------------+  +---------------------------+
|   DESKTOP (lg+)           |  |   MOBILE (< lg)           |
+---------------------------+  +---------------------------+
|                           |  |                           |
| Sidebar visible           |  | Sidebar collapsed         |
| Fixed width (240px)       |  | Hamburger menu toggle     |
| Always expanded           |  | Overlay when open         |
|                           |  |                           |
+---------------------------+  +---------------------------+
```

---

## Sidebar Navigation

### Navigation Structure

```
+-----------------------------------------------------------------------------+
|                         SIDEBAR NAVIGATION                                   |
+-----------------------------------------------------------------------------+
|                                                                             |
|  [CloudAct Logo]                                                            |
|                                                                             |
|  MAIN                                                                       |
|  +-- Dashboard           [/dashboard]                                       |
|  +-- Analytics           [/analytics]                                       |
|  +-- Pipelines           [/pipelines]                                       |
|  +-- Subscriptions       [/subscriptions]                                   |
|                                                                             |
|  INTEGRATIONS (expandable)                                                  |
|  +-- Cloud Providers     [/settings/integrations/cloud]                     |
|  +-- LLM Providers       [/settings/integrations/llm]                       |
|  +-- Subscription Mgmt   [/settings/integrations/subscriptions]             |
|      +-- Claude Pro      [/subscriptions/claude_pro] (if enabled)           |
|      +-- Canva           [/subscriptions/canva] (if enabled)                |
|                                                                             |
|  SETTINGS                                                                   |
|  +-- Organization        [/settings/organization]                           |
|  +-- Team                [/settings/team]                                   |
|  +-- Billing             [/settings/billing]                                |
|  +-- Onboarding          [/settings/onboarding]                             |
|                                                                             |
|  HELP                                                                       |
|  +-- Documentation       [external link]                                    |
|  +-- Support             [/support]                                         |
|                                                                             |
|  ─────────────────                                                          |
|  [Org Switcher]                                                             |
|  [User Menu]                                                                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Sidebar Component

**File:** `01-fronted-system/components/dashboard-sidebar.tsx`

```typescript
interface SidebarProps {
  orgSlug: string
  currentPath: string
}

export function DashboardSidebar({ orgSlug, currentPath }: SidebarProps) {
  const { enabledProviders } = useEnabledProviders(orgSlug)

  return (
    <aside className="w-60 border-r bg-background">
      <Logo />
      <nav>
        <NavSection title="Main">
          <NavLink href={`/${orgSlug}/dashboard`} icon={Home}>Dashboard</NavLink>
          <NavLink href={`/${orgSlug}/analytics`} icon={BarChart}>Analytics</NavLink>
          <NavLink href={`/${orgSlug}/pipelines`} icon={Workflow}>Pipelines</NavLink>
        </NavSection>

        <NavSection title="Integrations" collapsible>
          <NavLink href={`/${orgSlug}/settings/integrations/cloud`}>
            Cloud Providers
          </NavLink>
          <NavLink href={`/${orgSlug}/settings/integrations/llm`}>
            LLM Providers
          </NavLink>
          <NavSection title="Subscriptions" badge={enabledProviders.length}>
            <NavLink href={`/${orgSlug}/settings/integrations/subscriptions`}>
              Manage
            </NavLink>
            {enabledProviders.map(p => (
              <NavLink key={p} href={`/${orgSlug}/subscriptions/${p}`}>
                {p}
              </NavLink>
            ))}
          </NavSection>
        </NavSection>

        <NavSection title="Settings">
          <NavLink href={`/${orgSlug}/settings/organization`}>Organization</NavLink>
          <NavLink href={`/${orgSlug}/settings/team`}>Team</NavLink>
          <NavLink href={`/${orgSlug}/settings/billing`}>Billing</NavLink>
        </NavSection>
      </nav>
      <UserMenu />
    </aside>
  )
}
```

---

## Settings Pages

### Settings Structure

```
+-----------------------------------------------------------------------------+
|                          SETTINGS STRUCTURE                                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  /settings                                                                  |
|  +-- /organization     Organization profile, branding                       |
|  +-- /team             Team members, roles, invites                         |
|  +-- /billing          Subscription, invoices, payment                      |
|  +-- /onboarding       Backend onboarding status                            |
|  +-- /integrations                                                          |
|      +-- /cloud        GCP, AWS (future), Azure (future)                   |
|      +-- /llm          OpenAI, Anthropic, Gemini                           |
|      +-- /subscriptions SaaS provider management                           |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Settings Page Layout

```
+-----------------------------------------------------------------------------+
|                         SETTINGS PAGE LAYOUT                                 |
+-----------------------------------------------------------------------------+
|  Settings > Organization                                                    |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +------------------+  +--------------------------------------------------+ |
|  | SETTINGS NAV     |  | CONTENT                                          | |
|  |                  |  |                                                  | |
|  | [x] Organization |  | Organization Settings                           | |
|  | [ ] Team         |  |                                                  | |
|  | [ ] Billing      |  | Organization Name                               | |
|  | [ ] Onboarding   |  | [Acme Corp___________________]                  | |
|  | [ ] Integrations |  |                                                  | |
|  |                  |  | Organization Slug                               | |
|  |                  |  | [acme_corp] (cannot be changed)                 | |
|  |                  |  |                                                  | |
|  |                  |  | [Save Changes]                                  | |
|  |                  |  |                                                  | |
|  +------------------+  +--------------------------------------------------+ |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Theme System

### Theme Provider

**File:** `01-fronted-system/components/theme-provider.tsx`

```typescript
import { ThemeProvider as NextThemeProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  )
}
```

### Theme Toggle

**File:** `01-fronted-system/components/theme-toggle.tsx`

```typescript
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-4 w-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### CSS Variables

**File:** `01-fronted-system/app/globals.css`

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... more variables */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... more variables */
}
```

---

## Component Library

### Base Components (shadcn/ui)

| Component | Usage |
|-----------|-------|
| `Button` | Actions, CTAs |
| `Card` | Content containers |
| `Dialog` | Modals, confirmations |
| `DropdownMenu` | Context menus |
| `Input` | Form inputs |
| `Select` | Dropdowns |
| `Table` | Data display |
| `Tabs` | Tabbed content |
| `Toast` | Notifications |
| `Tooltip` | Hints |

### Custom Components

| Component | Purpose | File |
|-----------|---------|------|
| `DashboardSidebar` | Main navigation | components/dashboard-sidebar.tsx |
| `DashboardHeader` | Top header bar | components/dashboard-header.tsx |
| `OrgSwitcher` | Organization selector | components/org-switcher.tsx |
| `UserMenu` | User dropdown | components/user-menu.tsx |
| `Breadcrumb` | Navigation path | components/breadcrumb.tsx |
| `DataTable` | Sortable/filterable table | components/data-table.tsx |
| `EmptyState` | No data placeholder | components/empty-state.tsx |
| `LoadingSkeleton` | Loading placeholders | components/loading-skeleton.tsx |

---

## User Menu

```
+-----------------------------------------------------------------------------+
|                           USER MENU                                          |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +--------------------+                                                     |
|  | [Avatar] John Doe  |                                                     |
|  | john@example.com   |                                                     |
|  +--------------------+                                                     |
|  | Profile Settings   |                                                     |
|  | Account Settings   |                                                     |
|  +--------------------+                                                     |
|  | Theme: [System v]  |                                                     |
|  +--------------------+                                                     |
|  | Sign Out           |                                                     |
|  +--------------------+                                                     |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Organization Switcher

```
+-----------------------------------------------------------------------------+
|                       ORGANIZATION SWITCHER                                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +------------------------+                                                  |
|  | [Logo] Acme Corp      v|                                                  |
|  +------------------------+                                                  |
|  | [Logo] Personal        |                                                  |
|  | [Logo] Startup Inc     |                                                  |
|  | [Logo] Acme Corp     * | <- Current                                       |
|  +------------------------+                                                  |
|  | + Create Organization  |                                                  |
|  +------------------------+                                                  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Implementation Status

### Completed

| Component | File |
|-----------|------|
| Console layout | app/(console)/layout.tsx |
| Dashboard sidebar | components/dashboard-sidebar.tsx |
| Dashboard header | components/dashboard-header.tsx |
| Organization switcher | components/org-switcher.tsx |
| User menu | components/user-menu.tsx |
| Theme provider | components/theme-provider.tsx |
| Theme toggle | components/theme-toggle.tsx |
| Breadcrumb | components/breadcrumb.tsx |
| Settings layout | app/[orgSlug]/settings/layout.tsx |
| Organization settings | app/[orgSlug]/settings/organization/page.tsx |
| Team settings | app/[orgSlug]/settings/team/page.tsx |
| Billing settings | app/[orgSlug]/settings/billing/page.tsx |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| Keyboard shortcuts | Power user features | P3 |
| Command palette | Quick navigation | P3 |
| Customizable sidebar | Reorder, hide items | P4 |
| Dashboard widgets | Customizable layouts | P4 |
| Notification center | In-app notifications | P2 |

---

## Accessibility

### Standards

| Standard | Implementation |
|----------|----------------|
| WCAG 2.1 AA | Color contrast, focus states |
| Keyboard navigation | Tab order, arrow keys |
| Screen readers | ARIA labels, roles |
| Reduced motion | Respects prefers-reduced-motion |

### Focus Management

```typescript
// Focus visible styles
.focus-visible:outline-none
.focus-visible:ring-2
.focus-visible:ring-ring
.focus-visible:ring-offset-2
```

---

## File References

### Layout Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/(console)/layout.tsx` | Console layout |
| `01-fronted-system/app/[orgSlug]/layout.tsx` | Org-specific layout |
| `01-fronted-system/app/[orgSlug]/settings/layout.tsx` | Settings layout |

### Component Files

| File | Purpose |
|------|---------|
| `01-fronted-system/components/dashboard-sidebar.tsx` | Sidebar navigation |
| `01-fronted-system/components/dashboard-header.tsx` | Top header |
| `01-fronted-system/components/org-switcher.tsx` | Org dropdown |
| `01-fronted-system/components/user-menu.tsx` | User dropdown |
| `01-fronted-system/components/theme-provider.tsx` | Theme context |
| `01-fronted-system/components/theme-toggle.tsx` | Theme switch |
| `01-fronted-system/components/breadcrumb.tsx` | Navigation path |

### Settings Pages

| File | Purpose |
|------|---------|
| `01-fronted-system/app/[orgSlug]/settings/organization/page.tsx` | Org settings |
| `01-fronted-system/app/[orgSlug]/settings/team/page.tsx` | Team management |
| `01-fronted-system/app/[orgSlug]/settings/billing/page.tsx` | Billing page |
| `01-fronted-system/app/[orgSlug]/settings/onboarding/page.tsx` | Onboarding status |

### Style Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/globals.css` | Global styles, CSS variables |
| `01-fronted-system/tailwind.config.ts` | Tailwind configuration |
| `01-fronted-system/components.json` | shadcn/ui config |

---

**Version**: 1.5 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
