import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Request Demo", "See Our Platform in Action"),
  description: "Book a personalized demo of CloudAct.ai. See how we track GenAI, cloud, and SaaS costs in real-time. 30-minute session with our experts.",
  openGraph: {
    title: siteTitle("Request Demo"),
    description: "See CloudAct.ai in action with a personalized demo.",
    type: "website",
  },
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
