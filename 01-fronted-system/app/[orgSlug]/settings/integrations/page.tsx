import { redirect } from "next/navigation"

export default async function SettingsIntegrationsRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Integrations moved from settings to top-level
  redirect(`/${orgSlug}/integrations/cloud-providers`)
}
