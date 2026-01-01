import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact Us | CloudAct.ai",
  description: "Get in touch with the CloudAct.ai team for sales, support, or partnership inquiries.",
  openGraph: {
    title: "Contact Us | CloudAct.ai",
    description: "Get in touch with CloudAct.ai.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
