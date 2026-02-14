import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Solutions"),
  description: "Cloud cost optimization solutions for FinOps, Engineering, and Finance teams.",
  openGraph: {
    title: siteTitle("Solutions"),
    description: "Cloud cost optimization solutions for every team.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
