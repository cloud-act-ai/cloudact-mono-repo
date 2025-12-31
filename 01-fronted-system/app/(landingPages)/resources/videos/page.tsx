import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Video Tutorials | CloudAct.ai",
  description: "Video tutorials and walkthroughs for CloudAct.ai features and cloud cost optimization.",
}

export default function VideosPage() {
  redirect("/resources")
}
