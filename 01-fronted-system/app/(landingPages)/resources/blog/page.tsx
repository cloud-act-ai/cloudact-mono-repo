import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Blog | CloudAct.ai",
  description: "Latest insights, tips, and best practices for cloud cost optimization from the CloudAct.ai team.",
}

export default function BlogPage() {
  redirect("/resources")
}
