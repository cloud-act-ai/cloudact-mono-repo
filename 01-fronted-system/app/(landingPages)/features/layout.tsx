import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Features | CloudAct.ai",
  description: "Comprehensive cloud cost management features for GenAI, multi-cloud, and SaaS optimization.",
  openGraph: {
    title: "Features | CloudAct.ai",
    description: "Comprehensive cloud cost management features.",
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
