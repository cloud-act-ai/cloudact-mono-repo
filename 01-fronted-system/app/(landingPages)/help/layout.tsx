import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Help Center | CloudAct.ai",
  description: "Find answers to your questions about CloudAct.ai features, integrations, and troubleshooting.",
  openGraph: {
    title: "Help Center | CloudAct.ai",
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
