"use client"

/**
 * Sidebar list of conversations.
 */

import { useState } from "react"
import { MessageSquare, Plus, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/lib/chat/constants"

interface ConversationListProps {
  conversations: Conversation[]
  activeId?: string
  onSelect: (id: string) => void
  onNew: () => void
  loading?: boolean
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  loading,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-300">Conversations</h3>
        <button
          onClick={onNew}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-[#90FCA6]"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-700" />
            <p className="text-xs text-slate-500">No conversations yet</p>
          </div>
        )}

        {conversations.map((conv) => (
          <button
            key={conv.conversation_id}
            onClick={() => onSelect(conv.conversation_id)}
            className={cn(
              "group mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              activeId === conv.conversation_id
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            )}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {conv.title || `Chat ${conv.conversation_id.slice(0, 8)}`}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {conv.provider} · {conv.message_count} msgs
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
