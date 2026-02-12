"use client"

/**
 * Conversation list for the history drawer.
 * Max 10 conversations — oldest auto-deleted when creating new ones.
 */

import { memo, useState, useRef, useEffect, useCallback } from "react"
import { MessageSquare, Plus, Loader2, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/lib/chat/constants"

interface ConversationListProps {
  conversations: Conversation[]
  activeId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onRename?: (id: string, title: string) => void
  onExport?: (id: string) => void
  loading?: boolean
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return "Yesterday"
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export const ConversationList = memo(function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onExport,
  loading,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingId])

  const handleStartRename = useCallback((conv: Conversation) => {
    setEditingId(conv.conversation_id)
    setEditTitle(conv.title || `Chat ${conv.conversation_id.slice(0, 8)}`)
  }, [])

  const handleFinishRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      onRename?.(editingId, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle("")
  }, [editingId, editTitle, onRename])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleFinishRename()
      } else if (e.key === "Escape") {
        setEditingId(null)
        setEditTitle("")
      }
    },
    [handleFinishRename]
  )

  return (
    <div className="flex flex-col pt-2">
      {/* New conversation button */}
      <div className="flex items-center justify-end px-4 pb-2">
        <button
          onClick={onNew}
          className="rounded-lg p-1.5 transition-colors text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-[var(--cloudact-indigo)]"
          title="New conversation"
          aria-label="Start new conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-slate-700" />
            <p className="text-xs text-gray-400 dark:text-slate-500">No conversations yet</p>
          </div>
        )}

        {conversations.map((conv) => (
          <button
            key={conv.conversation_id}
            onClick={() => onSelect(conv.conversation_id)}
            className={cn(
              "group mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              activeId === conv.conversation_id
                ? "bg-gray-200 dark:bg-slate-800 text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 hover:text-gray-700 dark:hover:text-slate-200"
            )}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              {editingId === conv.conversation_id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={handleEditKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-[var(--cloudact-indigo)]/40 bg-white px-1.5 py-0.5 text-sm text-gray-900 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  aria-label="Rename conversation"
                />
              ) : (
                <p
                  className="truncate text-sm"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleStartRename(conv)
                  }}
                  title="Double-click to rename"
                >
                  {conv.title || `Chat ${conv.conversation_id.slice(0, 8)}`}
                </p>
              )}
              <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-600">
                {formatRelativeTime(conv.last_message_at || conv.created_at)}
              </p>
            </div>
            {onExport && editingId !== conv.conversation_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onExport(conv.conversation_id)
                }}
                className="hidden flex-shrink-0 rounded p-1 text-gray-400 hover:text-[var(--cloudact-indigo)] group-hover:block"
                aria-label="Export conversation"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </button>
        ))}
      </div>
    </div>
  )
})
