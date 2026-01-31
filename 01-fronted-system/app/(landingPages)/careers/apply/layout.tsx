import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Apply for a Position | CloudAct.ai Careers",
  description: "Submit your application to join the CloudAct.ai team. Help companies manage their cloud and GenAI costs.",
  openGraph: {
    title: "Apply for a Position | CloudAct.ai Careers",
    description: "Submit your application to join the CloudAct.ai team. Help companies manage their cloud and GenAI costs.",
    type: "website",
    url: "https://cloudact.ai/careers/apply",
  },
  twitter: {
    card: "summary_large_image",
    title: "Apply for a Position | CloudAct.ai Careers",
    description: "Submit your application to join the CloudAct.ai team. Help companies manage their cloud and GenAI costs.",
  },
}

export default function CareerApplyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
