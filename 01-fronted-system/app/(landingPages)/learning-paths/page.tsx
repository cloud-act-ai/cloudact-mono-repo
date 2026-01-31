import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Learning Paths | CloudAct.ai",
  description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
  openGraph: {
    title: "Learning Paths | CloudAct.ai",
    description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
    type: "website",
    url: "https://cloudact.ai/learning-paths",
  },
  twitter: {
    card: "summary_large_image",
    title: "Learning Paths | CloudAct.ai",
    description: "Structured learning paths for cloud cost optimization. From beginner to advanced.",
  },
}

export default function LearningPathsPage() {
  // Redirect to resources page for now - can be expanded later
  redirect("/resources")
}
