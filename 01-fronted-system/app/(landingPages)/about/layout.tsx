import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About Us | CloudAct.ai",
  description: "Learn about CloudAct.ai's mission to bring transparency and intelligence to cloud cost management.",
  openGraph: {
    title: "About Us | CloudAct.ai",
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
