import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("API Reference", "Documentation"),
  description: "CloudAct.ai REST API documentation. Authentication, endpoints, rate limits, and code examples.",
  openGraph: {
    title: siteTitle("API Reference"),
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
