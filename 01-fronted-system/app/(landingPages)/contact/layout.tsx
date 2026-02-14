import type { Metadata } from "next"
import { siteTitle } from "@/lib/site"

export const metadata: Metadata = {
  title: siteTitle("Contact Us", "Get in Touch"),
  description: "Contact CloudAct.ai for sales, support, partnerships, or demos. Our team is here to help you optimize your cloud costs.",
  openGraph: {
    title: siteTitle("Contact Us"),
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
