import { redirect } from "next/navigation"

export default async function ProfileRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/settings/personal`)
}
