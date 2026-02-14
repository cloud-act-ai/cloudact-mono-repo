import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { GuidesPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Guides"),
  description: "Step-by-step guides and tutorials for cloud cost optimization and CloudAct.ai features.",
  openGraph: {
    title: siteTitle("Guides"),
    description: "Step-by-step guides and tutorials for cloud cost optimization and CloudAct.ai features.",
    type: "website",
  },
}

export default function GuidesPage() {
  return <GuidesPageClient />
}
