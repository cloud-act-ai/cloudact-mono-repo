import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API Reference | CloudAct.ai Documentation",
  description: "CloudAct.ai REST API documentation. Authentication, endpoints, rate limits, and code examples.",
  openGraph: {
    title: "API Reference | CloudAct.ai",
    description: "CloudAct.ai REST API documentation.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function APIReferenceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
