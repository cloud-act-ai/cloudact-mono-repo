import { redirect } from "next/navigation"

export default async function DashboardRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ success?: string }>
}) {
  const { orgSlug } = await params
  const { success } = await searchParams

  // Redirect to new cost dashboards overview with any query params
  const queryString = success ? `?success=${success}` : ""
  redirect(`/${orgSlug}/cost-dashboards/overview${queryString}`)
}
