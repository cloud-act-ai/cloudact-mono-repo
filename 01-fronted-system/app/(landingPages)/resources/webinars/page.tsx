import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Webinars | CloudAct.ai",
  description: "Live and recorded webinars on cloud cost optimization, FinOps best practices, and CloudAct.ai features.",
}

export default function WebinarsPage() {
  redirect("/resources")
}
