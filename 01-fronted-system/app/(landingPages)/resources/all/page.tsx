import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { AllResourcesPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("All Resources"),
  description: "Browse all CloudAct.ai resources including guides, tutorials, case studies, and documentation.",
  openGraph: {
    title: siteTitle("All Resources"),
    description: "Browse all CloudAct.ai resources including guides, tutorials, case studies, and documentation.",
    type: "website",
  },
}

export default function AllResourcesPage() {
  return <AllResourcesPageClient />
}
