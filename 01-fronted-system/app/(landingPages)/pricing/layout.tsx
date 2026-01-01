import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing | CloudAct.ai",
  description: "Simple, transparent pricing for cloud cost optimization. Start free, scale as you grow.",
  openGraph: {
    title: "Pricing | CloudAct.ai",
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
