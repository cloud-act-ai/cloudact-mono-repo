import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Request Demo | CloudAct.ai - See Our Platform in Action",
  description: "Book a personalized demo of CloudAct.ai. See how we track GenAI, cloud, and SaaS costs in real-time. 30-minute session with our experts.",
  openGraph: {
    title: "Request Demo | CloudAct.ai",
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
