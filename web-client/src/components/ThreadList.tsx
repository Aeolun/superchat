// Thread List Component
// Displays root messages only (for forum channels)

import { Component, For, Show } from 'solid-js'
import type { Message } from '../SuperChatCodec'
import { formatMessageTime } from '../lib/utils/date-formatting'
import { selectors } from '../store/selectors'

/** Extract thread title: everything before the first double newline, or the full content */
function extractThreadTitle(content: string): { title: string; hasBody: boolean } {
  const idx = content.indexOf('\n\n')
  if (idx >= 0) {
    return { title: content.slice(0, idx), hasBody: true }
  }
  return { title: content, hasBody: false }
}

interface ThreadListProps {
  threads: Message[]
  onThreadClick: (threadId: bigint) => void
  selectedIndex: number
  isFocused: boolean
}

const ThreadList: Component<ThreadListProps> = (props) => {
  return (
    <div class="flex-1 overflow-y-auto p-4 bg-base-100">
      <Show
        when={props.threads.length > 0}
        fallback={
          <div class="text-center text-base-content/50 py-8">
            <p>No threads yet. Start a conversation!</p>
          </div>
        }
      >
        {/* Single grid so header and rows share column sizing */}
        <div class="grid grid-cols-[auto_1fr_auto_auto] text-xs">
          {/* Column headers */}
          <span class="px-3 py-2 font-semibold uppercase text-base-content/40 border-b border-base-300">Date</span>
          <span class="px-3 py-2 font-semibold uppercase text-base-content/40 border-b border-base-300">Title</span>
          <span class="px-3 py-2 font-semibold uppercase text-base-content/40 border-b border-base-300">Author</span>
          <span class="px-3 py-2 font-semibold uppercase text-base-content/40 border-b border-base-300 text-right">Replies</span>

          {/* Thread rows — subgrid wrapper gives us a styleable row element */}
          <For each={props.threads}>
            {(thread, index) => {
              const replyCount = selectors.getReplyCount(thread.message_id)
              const isSelected = () => props.isFocused && props.selectedIndex === index()
              const { title } = extractThreadTitle(thread.content)

              return (
                <div
                  onClick={() => props.onThreadClick(thread.message_id)}
                  class={`col-span-4 grid grid-cols-subgrid items-baseline border-b border-base-200 cursor-pointer transition-colors ${
                    isSelected() ? 'bg-primary/10 ring-2 ring-primary ring-offset-1 rounded' : 'hover:bg-base-200'
                  }`}
                >
                  <span class="px-3 py-2 text-base-content/50 whitespace-nowrap">
                    {formatMessageTime(thread.created_at)}
                  </span>
                  <span class="px-3 py-2 font-semibold truncate">
                    {title}
                  </span>
                  <span class="px-3 py-2 text-secondary font-semibold whitespace-nowrap">
                    {thread.author_nickname}
                  </span>
                  <span class="px-3 py-2 text-right">
                    <span class={`badge badge-xs ${replyCount > 0 ? 'badge-primary' : 'badge-ghost'}`}>
                      {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                  </span>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThreadList
