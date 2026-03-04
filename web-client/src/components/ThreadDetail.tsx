// Thread Detail Component
// Displays a thread with all nested replies

import { Component, For, Show } from 'solid-js'
import type { Message } from '../SuperChatCodec'
import { formatMessageTime } from '../lib/utils/date-formatting'
import { isOwnMessage } from '../lib/utils/nickname'
import Icon from './Icon'

// Message with nested replies (from selector)
interface MessageWithReplies extends Message {
  replies: MessageWithReplies[]
}

interface ThreadDetailProps {
  thread: MessageWithReplies | null
  onReply: (messageId: bigint, message: Message) => void
  onEdit: (message: Message) => void
  onDelete: (messageId: bigint) => void
  onBack: () => void
  selectedMessageId: bigint | null
  isFocused: boolean
}

/** Check if a message has been soft-deleted */
const isDeleted = (msg: Message) => msg.deleted_at?.present === 1

/** Action buttons shown on each message (reply, edit, delete) */
const MessageActions: Component<{
  message: Message
  onReply: (messageId: bigint, message: Message) => void
  onEdit: (message: Message) => void
  onDelete: (messageId: bigint) => void
}> = (props) => {
  const isOwn = () => isOwnMessage(props.message)
  const deleted = () => isDeleted(props.message)

  return (
    <Show when={!deleted()}>
      <div class="flex gap-0.5 absolute top-2 right-2">
        <button
          onClick={() => props.onReply(props.message.message_id, props.message)}
          class="btn btn-xs btn-ghost"
          title="Reply"
        >
          <Icon name="arrow-bend-up-left" size={16} />
        </button>
        <Show when={isOwn()}>
          <button
            onClick={() => props.onEdit(props.message)}
            class="btn btn-xs btn-ghost"
            title="Edit"
          >
            <Icon name="pencil" size={16} />
          </button>
          <button
            onClick={() => props.onDelete(props.message.message_id)}
            class="btn btn-xs btn-ghost text-error/70 hover:text-error"
            title="Delete"
          >
            <Icon name="trash" size={16} />
          </button>
        </Show>
      </div>
    </Show>
  )
}

/** Small "(edited)" indicator - only for non-deleted messages */
const EditedIndicator: Component<{ message: Message }> = (props) => (
  <Show when={props.message.edited_at?.present === 1 && !isDeleted(props.message)}>
    <span class="text-xs text-base-content/40 italic">(edited)</span>
  </Show>
)

const ThreadDetail: Component<ThreadDetailProps> = (props) => {
  const isRootSelected = () => props.isFocused && props.thread && props.selectedMessageId === props.thread.message_id

  return (
    <div class="flex-1 overflow-y-auto p-4 bg-base-100">
      <Show when={props.thread}>
        {(thread) => (
          <div class="space-y-4">
            {/* Root Message (highlighted) */}
            <div class={`card bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg border-l-4 border-primary relative ${
              isRootSelected() ? 'ring-2 ring-primary ring-offset-2' : ''
            }`}>
              <div class="card-body p-4">
                <MessageActions
                  message={thread()}
                  onReply={props.onReply}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                />

                <div class="flex items-baseline gap-2 mb-2">
                  <span class="font-semibold text-xs text-secondary">{thread().author_nickname}</span>
                  <span class="text-xs text-base-content/50">
                    {formatMessageTime(thread().created_at)}
                  </span>
                  <EditedIndicator message={thread()} />
                </div>
                <div class={`text-base whitespace-pre-wrap pr-20 ${isDeleted(thread()) ? 'italic text-base-content/40' : ''}`}>
                  {(() => {
                    if (isDeleted(thread())) return thread().content
                    const idx = thread().content.indexOf('\n\n')
                    if (idx < 0) return thread().content
                    return <>
                      <span class="font-bold">{thread().content.slice(0, idx)}</span>
                      {thread().content.slice(idx)}
                    </>
                  })()}
                </div>
              </div>
            </div>

            {/* Nested Replies */}
            <Show when={thread().replies.length > 0}>
              <div class="space-y-3">
                <For each={thread().replies}>
                  {(reply) => (
                    <MessageWithRepliesComponent
                      message={reply}
                      depth={1}
                      onReply={props.onReply}
                      onEdit={props.onEdit}
                      onDelete={props.onDelete}
                      selectedMessageId={props.selectedMessageId}
                      isFocused={props.isFocused}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

// Recursive component for rendering nested replies
interface MessageWithRepliesComponentProps {
  message: MessageWithReplies
  depth: number
  onReply: (messageId: bigint, message: Message) => void
  onEdit: (message: Message) => void
  onDelete: (messageId: bigint) => void
  selectedMessageId: bigint | null
  isFocused: boolean
}

const MessageWithRepliesComponent: Component<MessageWithRepliesComponentProps> = (props) => {
  const isSelected = () => props.isFocused && props.selectedMessageId === props.message.message_id

  return (
    <div class={props.depth > 0 ? `ml-6 border-l-2 border-base-300 pl-4` : ''}>
      <div class={`card bg-base-200 hover:bg-base-300 transition-colors relative ${
        isSelected() ? 'ring-2 ring-primary ring-offset-1' : ''
      }`}>
        <div class="card-body p-3">
          <MessageActions
            message={props.message}
            onReply={props.onReply}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
          />

          <div class="flex items-baseline gap-2 mb-1">
            <span class="font-semibold text-xs text-secondary">{props.message.author_nickname}</span>
            <span class="text-xs text-base-content/50">
              {formatMessageTime(props.message.created_at)}
            </span>
            <EditedIndicator message={props.message} />
          </div>
          <div class={`text-base whitespace-pre-wrap pr-20 ${isDeleted(props.message) ? 'italic text-base-content/40' : ''}`}>
            {props.message.content}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      <Show when={props.message.replies.length > 0}>
        <div class="mt-3 space-y-3">
          <For each={props.message.replies}>
            {(reply) => (
              <MessageWithRepliesComponent
                message={reply}
                depth={props.depth + 1}
                onReply={props.onReply}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
                selectedMessageId={props.selectedMessageId}
                isFocused={props.isFocused}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThreadDetail
