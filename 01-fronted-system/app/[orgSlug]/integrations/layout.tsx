import { Metadata } from "next"

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params
  return {
    title: `Integrations | ${orgSlug}`,
    description: "Connect your cloud providers, LLM APIs, and SaaS subscriptions",
  }
}

export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
