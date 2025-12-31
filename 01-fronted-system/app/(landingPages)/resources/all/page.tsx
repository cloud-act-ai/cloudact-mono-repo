import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "All Resources | CloudAct.ai",
  description: "Browse all CloudAct.ai resources including guides, tutorials, case studies, and documentation.",
}

export default function AllResourcesPage() {
  redirect("/resources")
}
