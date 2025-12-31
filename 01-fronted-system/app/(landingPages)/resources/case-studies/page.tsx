import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Case Studies | CloudAct.ai",
  description: "Real-world success stories from teams using CloudAct.ai for cloud cost optimization.",
}

export default function CaseStudiesPage() {
  redirect("/resources")
}
