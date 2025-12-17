import { redirect } from "next/navigation"

export default async function DangerRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Danger zone is now part of organization settings
  redirect(`/${orgSlug}/settings/organization`)
}
