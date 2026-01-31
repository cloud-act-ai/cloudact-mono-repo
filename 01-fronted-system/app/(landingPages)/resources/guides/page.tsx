import type { Metadata } from "next"
import { GuidesPageClient } from "./client"

export const metadata: Metadata = {
  title: "Guides | CloudAct.ai",
  description: "Step-by-step guides and tutorials for cloud cost optimization and CloudAct.ai features.",
  openGraph: {
    title: "Guides | CloudAct.ai",
    description: "Step-by-step guides and tutorials for cloud cost optimization and CloudAct.ai features.",
    type: "website",
  },
}

export default function GuidesPage() {
  return <GuidesPageClient />
}
