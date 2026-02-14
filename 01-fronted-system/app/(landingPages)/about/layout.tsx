import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("About Us"),
  description: "Learn about CloudAct.ai's mission to bring transparency and intelligence to cloud cost management.",
  openGraph: {
    title: siteTitle("About Us"),
    description: "Learn about CloudAct.ai's mission.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
