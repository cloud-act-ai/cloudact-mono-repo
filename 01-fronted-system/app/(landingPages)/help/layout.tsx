import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Help Center"),
  description: "Find answers to your questions about CloudAct.ai features, integrations, and troubleshooting.",
  openGraph: {
    title: siteTitle("Help Center"),
    description: "Get help with CloudAct.ai.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
