import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Solutions | CloudAct.ai",
  description: "Cloud cost optimization solutions for FinOps, Engineering, and Finance teams.",
  openGraph: {
    title: "Solutions | CloudAct.ai",
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
