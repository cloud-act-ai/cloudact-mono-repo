import { redirect } from "next/navigation"

export default async function MembersRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/settings/invite`)
}
