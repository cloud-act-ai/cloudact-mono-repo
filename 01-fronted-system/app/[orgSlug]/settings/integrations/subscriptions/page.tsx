import { redirect } from "next/navigation"

export default async function SettingsSubscriptionsRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Subscriptions moved to /integrations/subscriptions
  redirect(`/${orgSlug}/integrations/subscriptions`)
}
