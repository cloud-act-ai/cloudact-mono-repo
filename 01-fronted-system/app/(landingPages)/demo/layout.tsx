import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Book a Demo | CloudAct.ai",
  description: "Schedule a personalized demo to see how CloudAct.ai can optimize your cloud costs.",
  openGraph: {
    title: "Book a Demo | CloudAct.ai",
    description: "Schedule a personalized demo.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
