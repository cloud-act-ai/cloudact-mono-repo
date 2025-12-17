import { redirect } from "next/navigation"

export default async function SettingsCloudRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Cloud providers moved to /integrations/cloud-providers
  redirect(`/${orgSlug}/integrations/cloud-providers`)
}
