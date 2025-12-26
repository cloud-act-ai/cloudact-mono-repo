import { redirect } from "next/navigation"

export default async function SettingsLLMRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // LLM integrations moved to /integrations/genai
  redirect(`/${orgSlug}/integrations/genai`)
}
