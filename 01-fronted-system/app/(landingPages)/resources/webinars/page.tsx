import type { Metadata } from "next"
import { WebinarsPageClient } from "./client"

export const metadata: Metadata = {
  title: "Webinars | CloudAct.ai",
  description: "Live and recorded webinars on cloud cost optimization, FinOps best practices, and CloudAct.ai features.",
  openGraph: {
    title: "Webinars | CloudAct.ai",
    description: "Live and recorded webinars on cloud cost optimization, FinOps best practices, and CloudAct.ai features.",
    type: "website",
  },
}

export default function WebinarsPage() {
  return <WebinarsPageClient />
}
