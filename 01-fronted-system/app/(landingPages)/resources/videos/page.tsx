import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"
import { VideosPageClient } from "./client"

export const metadata: Metadata = {
  title: siteTitle("Video Tutorials"),
  description: "Video tutorials and walkthroughs for CloudAct.ai features and cloud cost optimization.",
  openGraph: {
    title: siteTitle("Video Tutorials"),
    description: "Video tutorials and walkthroughs for CloudAct.ai features and cloud cost optimization.",
    type: "website",
  },
}

export default function VideosPage() {
  return <VideosPageClient />
}
