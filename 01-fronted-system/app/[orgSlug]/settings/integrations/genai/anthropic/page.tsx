import { redirect } from "next/navigation"

export default async function AnthropicRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/integrations/genai/anthropic`)
}
