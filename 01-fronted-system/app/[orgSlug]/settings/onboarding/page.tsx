import { redirect } from "next/navigation"

export default async function OnboardingRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Onboarding settings merged into organization settings
  redirect(`/${orgSlug}/settings/organization`)
}
