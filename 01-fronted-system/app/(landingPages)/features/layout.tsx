import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Features | CloudAct.ai - GenAI & Cloud Cost Intelligence",
  description: "Comprehensive cost tracking for GenAI, multi-cloud, and SaaS. Real-time dashboards, AI recommendations, anomaly detection, and budget controls.",
  openGraph: {
    title: "Features | CloudAct.ai",
    description: "Enterprise-grade cost intelligence for GenAI, cloud, and SaaS spending.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
