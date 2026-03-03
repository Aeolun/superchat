// ABOUTME: Modal dialog for composing messages (new threads, replies, and edits)
// ABOUTME: Provides focused writing experience with keyboard shortcuts

import { Component, Show, createSignal, onMount, onCleanup } from 'solid-js'
import type { Message } from '../SuperChatCodec'

interface ComposeModalProps {
  replyTo: Message | null  // null = new thread, Message = reply
  channelName: string
  editMessageId?: bigint | null  // Set when editing an existing message
  editContent?: string           // Pre-populated content for edit mode
  onSend: (content: string) => void
  onCancel: () => void
}

const ComposeModal: Component<ComposeModalProps> = (props) => {
  const isEditMode = () => !!props.editMessageId
  const [content, setContent] = createSignal(props.editContent || '')
  let textareaRef: HTMLTextAreaElement | undefined

  // Focus textarea when modal mounts
  onMount(() => {
    textareaRef?.focus()
  })

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (content().trim()) {
        props.onSend(content().trim())
        setContent('')
      }
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault()
      props.onCancel()
      setContent('')
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  const title = () => {
    if (isEditMode()) {
      return 'Edit message'
    }
    if (props.replyTo) {
      return `Reply to ${props.replyTo.author_nickname}`
    }
    return `New thread in #${props.channelName}`
  }

  const submitLabel = () => isEditMode() ? 'Save' : 'Send'

  return (
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div class="p-4 border-b border-base-300">
          <h2 class="text-lg font-bold">{title()}</h2>
          <Show when={props.replyTo && !isEditMode()}>
            <div class="mt-2 p-3 bg-base-200 rounded-lg text-sm">
              <div class="text-base-content/60 mb-1">Replying to:</div>
              <div class="text-base-content/80 line-clamp-3">
                {props.replyTo!.content}
              </div>
            </div>
          </Show>
        </div>

        {/* Textarea */}
        <div class="flex-1 p-4 overflow-hidden">
          <textarea
            ref={textareaRef}
            class="textarea textarea-bordered w-full h-full min-h-[200px] resize-none text-base"
            placeholder="Write your message..."
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
          />
        </div>

        {/* Footer with shortcuts */}
        <div class="p-4 border-t border-base-300 flex justify-between items-center">
          <div class="text-xs text-base-content/50 font-mono space-x-4">
            <span>[Ctrl+Enter] {submitLabel()}</span>
            <span>[Esc] Cancel</span>
          </div>
          <div class="space-x-2">
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => {
                props.onCancel()
                setContent('')
              }}
            >
              Cancel
            </button>
            <button
              class="btn btn-primary btn-sm"
              disabled={!content().trim()}
              onClick={() => {
                if (content().trim()) {
                  props.onSend(content().trim())
                  setContent('')
                }
              }}
            >
              {submitLabel()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ComposeModal
