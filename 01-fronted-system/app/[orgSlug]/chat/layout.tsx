export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden">
      {children}
    </div>
  )
}
