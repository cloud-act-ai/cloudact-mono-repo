import type { Metadata } from "next"
import { DocumentationPageClient } from "./client"

export const metadata: Metadata = {
  title: "Documentation | CloudAct.ai",
  description: "Complete API reference, integration guides, and developer documentation for CloudAct.ai.",
  openGraph: {
    title: "Documentation | CloudAct.ai",
    description: "Complete API reference, integration guides, and developer documentation for CloudAct.ai.",
    type: "website",
  },
}

export default function DocumentationPage() {
  return <DocumentationPageClient />
}
