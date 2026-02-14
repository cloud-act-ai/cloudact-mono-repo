import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Resources & Learning Center"),
  description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
  openGraph: {
    title: siteTitle("Resources & Learning Center"),
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
