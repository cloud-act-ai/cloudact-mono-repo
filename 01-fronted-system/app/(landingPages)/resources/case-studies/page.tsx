import type { Metadata } from "next"
import { CaseStudiesPageClient } from "./client"

export const metadata: Metadata = {
  title: "Case Studies | CloudAct.ai",
  description: "Real-world success stories from teams using CloudAct.ai for cloud cost optimization.",
  openGraph: {
    title: "Case Studies | CloudAct.ai",
    description: "Real-world success stories from teams using CloudAct.ai for cloud cost optimization.",
    type: "website",
  },
}

export default function CaseStudiesPage() {
  return <CaseStudiesPageClient />
}
