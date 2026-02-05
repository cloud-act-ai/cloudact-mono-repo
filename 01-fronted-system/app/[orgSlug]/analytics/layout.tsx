import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Analytics | CloudAct",
  description: "Deep insights into your cloud and AI spending patterns",
}

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
