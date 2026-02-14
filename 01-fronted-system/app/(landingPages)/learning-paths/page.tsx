import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: siteTitle("Learning Paths"),
  description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
  openGraph: {
    title: siteTitle("Learning Paths"),
    description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
    type: "website",
    url: "https://cloudact.ai/learning-paths",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle("Learning Paths"),
    description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
  },
}

export default function LearningPathsPage() {
  // Redirect to resources page for now - can be expanded later
  redirect("/resources")
}
