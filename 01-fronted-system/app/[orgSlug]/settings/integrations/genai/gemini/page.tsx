import { redirect } from "next/navigation"

export default async function GeminiRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/integrations/genai/gemini`)
}
