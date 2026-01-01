import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Resources & Learning Center | CloudAct.ai",
  description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
  openGraph: {
    title: "Resources & Learning Center | CloudAct.ai",
    description: "Guides, tutorials, case studies, and documentation for cloud cost optimization.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
