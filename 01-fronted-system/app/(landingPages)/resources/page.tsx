import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { ResourcesPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Resources & Learning Center"),
  description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
  openGraph: {
    title: siteTitle("Resources & Learning Center"),
    description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
    type: "website",
  },
}

export default function ResourcesPage() {
  return <ResourcesPageClient />
}
