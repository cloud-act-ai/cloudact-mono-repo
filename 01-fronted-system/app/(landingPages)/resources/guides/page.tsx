import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Guides | CloudAct.ai",
  description: "Step-by-step guides and tutorials for cloud cost optimization and CloudAct.ai features.",
}

export default function GuidesPage() {
  redirect("/resources")
}
