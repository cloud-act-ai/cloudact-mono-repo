import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { DocumentationPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Documentation"),
  description: "Complete API reference, integration guides, and developer documentation for CloudAct.ai.",
  openGraph: {
    title: siteTitle("Documentation"),
    description: "Complete API reference, integration guides, and developer documentation for CloudAct.ai.",
    type: "website",
  },
}

export default function DocumentationPage() {
  return <DocumentationPageClient />
}
