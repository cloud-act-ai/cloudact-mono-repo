import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact Us | CloudAct.ai - Get in Touch",
  description: "Contact CloudAct.ai for sales, support, partnerships, or demos. Our team is here to help you optimize your cloud costs.",
  openGraph: {
    title: "Contact Us | CloudAct.ai",
    description: "Get in touch with the CloudAct.ai team.",
    type: "website",
  },
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
