import { Component, createEffect, createMemo, onCleanup, untrack } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { store, storeActions, ViewState, ModalState, FocusArea } from '../store/app-store'
import { selectors } from '../store/selectors'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { safeLog } from '../lib/utils/safe-log'
import ThreadDetail from '../components/ThreadDetail'
import type { Message } from '../SuperChatCodec'

const ThreadDetailPage: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const client = getProtocolBridge().getClient()

  const isConnected = selectors.isConnected
  const currentThread = selectors.currentThread

  // Flatten thread messages for keyboard navigation
  const flattenedThreadMessages = createMemo(() => {
    const thread = currentThread()
    if (!thread) return []

    const result: Message[] = []
    const flatten = (msg: typeof thread) => {
      result.push(msg)
      for (const reply of msg.replies) {
        flatten(reply)
      }
    }
    flatten(thread)
    return result
  })

  // Selected message ID for keyboard navigation highlighting
  const selectedMessageId = createMemo((): bigint | null => {
    if (store.focusArea !== FocusArea.Content) return null
    const messages = flattenedThreadMessages()
    if (store.selectedMessageIndex >= 0 && store.selectedMessageIndex < messages.length) {
      return messages[store.selectedMessageIndex].message_id
    }
    return null
  })

  // Subscribe to thread when params change
  // Only isConnected() and route params are tracked — subscribedThreadId
  // is read inside untrack() to avoid re-running on subscription confirmation.
  createEffect(() => {
    if (!isConnected() || !params.threadId || !params.channelId) return

    const threadId = BigInt(params.threadId)
    const channelId = BigInt(params.channelId)
    safeLog('Route: opening thread', threadId)

    // Unsubscribe from previous thread if different
    untrack(() => {
      if (store.subscribedThreadId !== null && store.subscribedThreadId !== threadId) {
        client.unsubscribeThread(store.subscribedThreadId)
      }
    })

    store.setActiveThreadId(threadId)
    store.setCurrentView(ViewState.ThreadDetail)
    store.setSelectedMessageIndex(0)

    client.subscribeThread(threadId)
    client.listMessagesForThread(channelId, threadId, 100)
  })

  // Cleanup on unmount: unsubscribe from thread
  onCleanup(() => {
    if (store.subscribedThreadId !== null) {
      client.unsubscribeThread(store.subscribedThreadId)
      store.setSubscribedThreadId(null)
    }
    store.setActiveThreadId(null)
    store.setCurrentView(ViewState.ThreadList)
    storeActions.clearCompose()
  })

  const handleBack = () => {
    navigate(`/channel/${params.channelId}`)
  }

  const handleReply = (messageId: bigint, message: Message) => {
    safeLog('Replying to:', messageId)
    storeActions.updateCompose({
      replyToId: messageId,
      replyToMessage: message
    })
    storeActions.openModal(ModalState.Compose)
  }

  const handleEdit = (message: Message) => {
    storeActions.updateCompose({
      editMessageId: message.message_id,
      editMessageContent: message.content,
      replyToId: null,
      replyToMessage: null
    })
    storeActions.openModal(ModalState.Compose)
  }

  const handleDelete = (messageId: bigint) => {
    store.setConfirmDeleteMessageId(messageId)
    storeActions.openModal(ModalState.ConfirmDelete)
  }

  return (
    <ThreadDetail
      thread={currentThread()}
      onReply={handleReply}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onBack={handleBack}
      selectedMessageId={selectedMessageId()}
      isFocused={store.focusArea === FocusArea.Content}
    />
  )
}

export default ThreadDetailPage
