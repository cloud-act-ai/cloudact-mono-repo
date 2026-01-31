import type { Metadata } from "next"
import PressContent from "./press-content"
import "../premium.css"

export const metadata: Metadata = {
  title: "Press & Media | CloudAct.ai - News, Press Releases & Media Resources",
  description: "Get the latest CloudAct.ai news, press releases, and media resources. Contact our press team for interviews, brand assets, and company information.",
  openGraph: {
    title: "Press & Media | CloudAct.ai",
    description: "Get the latest CloudAct.ai news, press releases, and media resources.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Press & Media | CloudAct.ai",
    description: "Get the latest CloudAct.ai news, press releases, and media resources.",
  },
}

export default function PressPage() {
  return <PressContent />
}
