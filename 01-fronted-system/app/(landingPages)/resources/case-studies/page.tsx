import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { CaseStudiesPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Case Studies"),
  description: "Real-world success stories from teams using CloudAct.ai for cloud cost optimization.",
  openGraph: {
    title: siteTitle("Case Studies"),
    description: "Real-world success stories from teams using CloudAct.ai for cloud cost optimization.",
    type: "website",
  },
}

export default function CaseStudiesPage() {
  return <CaseStudiesPageClient />
}
