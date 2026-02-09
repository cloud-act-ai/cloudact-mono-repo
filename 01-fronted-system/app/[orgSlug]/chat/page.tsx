import { ChatLayout } from "@/components/chat/chat-layout"
import { getAuthContext } from "@/lib/auth-cache"

interface ChatPageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { orgSlug } = await params
  const authCtx = await getAuthContext(orgSlug)

  return (
    <ChatLayout
      apiKey={authCtx?.apiKey}
      userId={authCtx?.auth?.user?.id}
    />
  )
}
