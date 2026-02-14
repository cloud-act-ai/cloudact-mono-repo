import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { WebinarsPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Webinars"),
  description: "Live and recorded webinars on cloud cost optimization, FinOps best practices, and CloudAct.ai features.",
  openGraph: {
    title: siteTitle("Webinars"),
    description: "Live and recorded webinars on cloud cost optimization, FinOps best practices, and CloudAct.ai features.",
    type: "website",
  },
}

export default function WebinarsPage() {
  return <WebinarsPageClient />
}
