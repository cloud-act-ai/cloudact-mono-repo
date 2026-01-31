import type { Metadata } from "next"
import { VideosPageClient } from "./client"

export const metadata: Metadata = {
  title: "Video Tutorials | CloudAct.ai",
  description: "Video tutorials and walkthroughs for CloudAct.ai features and cloud cost optimization.",
  openGraph: {
    title: "Video Tutorials | CloudAct.ai",
    description: "Video tutorials and walkthroughs for CloudAct.ai features and cloud cost optimization.",
    type: "website",
  },
}

export default function VideosPage() {
  return <VideosPageClient />
}
