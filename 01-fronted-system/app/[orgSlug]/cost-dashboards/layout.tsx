import { Metadata } from "next"

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params
  return {
    title: `Cost Dashboards | ${orgSlug}`,
    description: "View and analyze your organization's costs",
  }
}

export default function CostDashboardsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
