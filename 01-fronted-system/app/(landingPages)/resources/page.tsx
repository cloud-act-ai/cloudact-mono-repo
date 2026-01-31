import type { Metadata } from "next"
import { ResourcesPageClient } from "./client"

export const metadata: Metadata = {
  title: "Resources & Learning Center | CloudAct.ai",
  description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
  openGraph: {
    title: "Resources & Learning Center | CloudAct.ai",
    description: "Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation.",
    type: "website",
  },
}

export default function ResourcesPage() {
  return <ResourcesPageClient />
}
