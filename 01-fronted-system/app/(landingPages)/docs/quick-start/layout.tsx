import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quick Start | CloudAct.ai Documentation",
  description: "Get started with CloudAct.ai in 5 minutes. Connect your cloud providers, GenAI services, and SaaS subscriptions.",
  openGraph: {
    title: "Quick Start | CloudAct.ai",
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
