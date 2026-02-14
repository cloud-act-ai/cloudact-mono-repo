import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Quick Start", "Documentation"),
  description: "Get started with CloudAct.ai in 5 minutes. Connect your cloud providers, GenAI services, and SaaS subscriptions.",
  openGraph: {
    title: siteTitle("Quick Start"),
    description: "Get started with CloudAct.ai in 5 minutes.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function QuickStartLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
