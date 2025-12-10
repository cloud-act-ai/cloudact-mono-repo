import type React from "react"

// Note: The sidebar is already rendered by the parent [orgSlug]/layout.tsx
// This nested layout just passes through children and can add dashboard-specific
// wrapping if needed in the future

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
