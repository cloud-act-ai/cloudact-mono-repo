import { redirect } from "next/navigation"

export default async function OrgRootRedirectPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Redirect org root to cost dashboards overview
  redirect(`/${orgSlug}/cost-dashboards/overview`)
}
