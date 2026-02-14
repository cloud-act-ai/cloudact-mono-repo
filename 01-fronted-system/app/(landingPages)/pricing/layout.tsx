import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Pricing"),
  description: "Simple, transparent pricing for cloud cost optimization. Start free, scale as you grow.",
  openGraph: {
    title: siteTitle("Pricing"),
    description: "Simple, transparent pricing for cloud cost optimization.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
