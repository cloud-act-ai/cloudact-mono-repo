import { ChatLayout } from "@/components/chat/chat-layout"
import { getAuthContext } from "@/lib/auth-cache"

interface ConversationPageProps {
  params: Promise<{ orgSlug: string; conversationId: string }>
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { orgSlug } = await params
  const authCtx = await getAuthContext(orgSlug)

  return (
    <ChatLayout
      apiKey={authCtx?.apiKey}
      userId={authCtx?.auth?.user?.id}
    />
  )
}
