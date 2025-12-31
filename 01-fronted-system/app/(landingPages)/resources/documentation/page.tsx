import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Documentation | CloudAct.ai",
  description: "Complete API reference, integration guides, and developer documentation for CloudAct.ai.",
}

export default function DocumentationPage() {
  // Redirect to the main docs page
  redirect("/docs")
}
