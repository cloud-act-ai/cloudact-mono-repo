import { redirect } from "next/navigation"
import { getAuthContext } from "@/lib/auth-cache"
import { AIChatSettingsClient } from "@/components/settings/ai-chat/ai-chat-settings-client"

interface AIChatSettingsPageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function AIChatSettingsPage({ params }: AIChatSettingsPageProps) {
  const { orgSlug } = await params
  const authCtx = await getAuthContext(orgSlug)

  if (!authCtx?.apiKey || !authCtx?.auth?.user?.id) {
    redirect(`/${orgSlug}/login`)
  }

  return (
    <AIChatSettingsClient
      apiKey={authCtx.apiKey}
      userId={authCtx.auth.user.id}
    />
  )
}
