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
        <div class="space-y-3">
          <For each={props.threads}>
            {(thread, index) => {
              const replyCount = selectors.getReplyCount(thread.message_id)
              const isSelected = () => props.isFocused && props.selectedIndex === index()
              const { title, hasBody } = extractThreadTitle(thread.content)

              return (
                <div
                  onClick={() => props.onThreadClick(thread.message_id)}
                  class={`card bg-gradient-to-br from-base-200 to-base-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border ${
                    isSelected() ? 'border-primary ring-2 ring-primary' : 'border-base-300'
                  }`}
                >
                  <div class="card-body p-4">
                    {/* Thread Header */}
                    <div class="flex items-start justify-between gap-4 mb-2">
                      <div class="flex items-baseline gap-2">
                        <Show when={isSelected()}>
                          <span class="text-primary font-bold">▶</span>
                        </Show>
                        <span class="font-semibold text-xs text-secondary">{thread.author_nickname}</span>
                        <span class="text-xs text-base-content/50">
                          {formatMessageTime(thread.created_at)}
                        </span>
                      </div>
                      <Show when={replyCount > 0}>
                        <div class="badge badge-primary badge-sm">
                          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                        </div>
                      </Show>
                    </div>

                    {/* Thread Title (before first double newline) */}
                    <div class={`text-base whitespace-pre-wrap ${hasBody ? 'font-semibold' : 'line-clamp-3'}`}>
                      {title}
                    </div>
                  </div>
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
