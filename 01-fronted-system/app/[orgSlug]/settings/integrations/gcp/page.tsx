import { redirect } from "next/navigation"

export default async function GCPRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/integrations/cloud-providers/gcp`)
}
