import type { Metadata } from "next"
import { BlogPageClient } from "./client"

export const metadata: Metadata = {
  title: "Blog | CloudAct.ai",
  description: "Latest insights, tips, and best practices for cloud cost optimization from the CloudAct.ai team.",
  openGraph: {
    title: "Blog | CloudAct.ai",
    description: "Latest insights, tips, and best practices for cloud cost optimization from the CloudAct.ai team.",
    type: "website",
  },
}

export default function BlogPage() {
  return <BlogPageClient />
}
