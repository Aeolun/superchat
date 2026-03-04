// Chat View Component
// Displays flat chronological messages for chat channels (type=0)

import { Component, Show, Index } from 'solid-js'
import type { Message } from '../SuperChatCodec'
import { formatMessageTime, formatDateSeparator, shouldShowDateSeparator } from '../lib/utils/date-formatting'
import { isOwnMessage } from '../lib/utils/nickname'
import Icon from './Icon'

interface ChatViewProps {
  messages: Message[]
  loading: boolean
  onEdit: (message: Message) => void
  onDelete: (messageId: bigint) => void
}

const ChatView: Component<ChatViewProps> = (props) => {
  return (
    <div
      class="flex-1 p-4 bg-base-100"
    >
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="text-center text-base-content/50 py-8">
            <Show when={props.loading} fallback={<p>No messages yet. Start a conversation!</p>}>
              <span class="loading loading-spinner loading-md my-12"></span>
            </Show>
          </div>
        }
      >
        <div class="space-y-2">
          <Index each={props.messages}>
            {(message, index) => {
              const prevMessage = index > 0 ? props.messages[index - 1] : null
              const showDateSeparator = shouldShowDateSeparator(
                prevMessage?.created_at || null,
                message().created_at
              )
              const isOwn = () => isOwnMessage(message())
              const deleted = () => message().deleted_at?.present === 1

              return (
                <>
                  <Show when={showDateSeparator}>
                    <div class="flex items-center gap-4 my-4">
                      <div class="flex-1 border-t border-base-300"></div>
                      <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
                        {formatDateSeparator(message().created_at)}
                      </div>
                      <div class="flex-1 border-t border-base-300"></div>
                    </div>
                  </Show>
                  <div class="p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors relative group">
                    <div class="flex items-baseline gap-2 mb-1">
                      <span class="font-semibold text-xs text-secondary">{message().author_nickname}</span>
                      <span class="text-xs text-base-content/50">
                        {formatMessageTime(message().created_at)}
                      </span>
                      <Show when={message().edited_at?.present === 1 && !deleted()}>
                        <span class="text-xs text-base-content/40 italic">(edited)</span>
                      </Show>
                    </div>
                    <div class={`text-base whitespace-pre-wrap pr-16 ${deleted() ? 'italic text-base-content/40' : ''}`}>{message().content}</div>

                    <Show when={isOwn() && !deleted()}>
                      <div class="flex gap-0.5 absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
                        <button
                          onClick={() => props.onEdit(message())}
                          class="btn btn-xs btn-ghost"
                          title="Edit"
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          onClick={() => props.onDelete(message().message_id)}
                          class="btn btn-xs btn-ghost text-error/70 hover:text-error"
                          title="Delete"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </Show>
                  </div>
                </>
              )
            }}
          </Index>
        </div>
      </Show>
    </div>
  )
}

export default ChatView
