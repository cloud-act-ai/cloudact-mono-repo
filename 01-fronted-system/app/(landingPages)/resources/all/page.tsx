import type { Metadata } from "next"
import { AllResourcesPageClient } from "./client"

export const metadata: Metadata = {
  title: "All Resources | CloudAct.ai",
  description: "Browse all CloudAct.ai resources including guides, tutorials, case studies, and documentation.",
  openGraph: {
    title: "All Resources | CloudAct.ai",
    description: "Browse all CloudAct.ai resources including guides, tutorials, case studies, and documentation.",
    type: "website",
  },
}

export default function AllResourcesPage() {
  return <AllResourcesPageClient />
}
