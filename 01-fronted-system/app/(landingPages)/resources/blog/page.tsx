import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { BlogPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Blog"),
  description: "Latest insights, tips, and best practices for cloud cost optimization from the CloudAct.ai team.",
  openGraph: {
    title: siteTitle("Blog"),
    description: "Latest insights, tips, and best practices for cloud cost optimization from the CloudAct.ai team.",
    type: "website",
  },
}

export default function BlogPage() {
  return <BlogPageClient />
}
