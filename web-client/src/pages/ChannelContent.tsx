import { Component, Show, createEffect, createSignal, onMount } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { store, storeActions, ViewState, FocusArea } from '../store/app-store'
import { selectors } from '../store/selectors'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { encryptMessage } from '../lib/crypto'
import ChatView from '../components/ChatView'
import ThreadList from '../components/ThreadList'

const ChannelContent: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const client = getProtocolBridge().getClient()
  let messageScrollContainer: HTMLDivElement | undefined
  let chatInputRef: HTMLTextAreaElement | undefined

  const [userHasScrolledUp, setUserHasScrolledUp] = createSignal(false)
  const [chatInput, setChatInput] = createSignal('')

  const currentChannel = selectors.currentChannel
  const currentChannelMessages = selectors.currentChannelMessages
  const currentThreadList = selectors.currentThreadList
  const isCurrentChannelChat = selectors.isCurrentChannelChat
  const isCurrentChannelForum = selectors.isCurrentChannelForum

  // Set the right ViewState
  onMount(() => {
    const channel = currentChannel()
    if (channel && channel.type === 0) {
      store.setCurrentView(ViewState.ChatView)
    } else {
      store.setCurrentView(ViewState.ThreadList)
    }
  })

  // Update ViewState when channel data arrives (might not be available on first mount)
  createEffect(() => {
    const channel = currentChannel()
    if (channel) {
      if (channel.type === 0) {
        store.setCurrentView(ViewState.ChatView)
      } else {
        store.setCurrentView(ViewState.ThreadList)
      }
    }
  })

  // Auto-focus chat input when entering a chat channel
  createEffect(() => {
    const channel = currentChannel()
    if (channel && channel.type === 0 && chatInputRef) {
      setTimeout(() => chatInputRef?.focus(), 100)
    }
  })

  // Clear chat input when channel changes
  createEffect(() => {
    void params.channelId // track reactively
    setChatInput('')
    setUserHasScrolledUp(false)
  })

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    const messages = currentChannelMessages()
    const container = messageScrollContainer

    if (!container || messages.length === 0) return

    const isNearBottom = () => {
      const threshold = 100
      return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    }

    if (!userHasScrolledUp() || isNearBottom()) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight
      }, 50)
    }
  })

  const handleScroll = (e: Event) => {
    const container = e.target as HTMLDivElement
    const threshold = 100
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    setUserHasScrolledUp(!isAtBottom)
  }

  const handleChatSend = async () => {
    const content = chatInput().trim()
    if (!content || !currentChannel()) return

    const channelId = currentChannel()!.channel_id
    const key = store.dmChannelKeys.get(channelId)

    if (key) {
      const plaintext = new TextEncoder().encode(content)
      const encrypted = await encryptMessage(key, plaintext)
      client.postMessageRaw(channelId, encrypted, null)
    } else {
      client.postMessage(channelId, content, null)
    }

    setChatInput('')
  }

  const handleChatInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }

  const handleThreadClick = (threadId: bigint) => {
    navigate(`/channel/${params.channelId}/thread/${threadId}`)
  }

  return (
    <>
      <Show when={isCurrentChannelChat()}>
        {/* Chat Channel: Flat message list + inline input */}
        <div class="relative flex-1 flex flex-col overflow-hidden">
          <div
            ref={messageScrollContainer}
            onScroll={handleScroll}
            class="flex-1 overflow-auto"
          >
            <ChatView
              messages={currentChannelMessages()}
            />
          </div>
          {/* Scroll indicator */}
          <Show when={userHasScrolledUp()}>
            <div class="absolute bottom-16 right-4 badge badge-primary gap-2 pointer-events-none">
              <span>v</span>
              <span>Scrolled up</span>
            </div>
          </Show>
        </div>
        {/* Inline chat input */}
        <div class="border-t border-base-300 p-3 bg-base-100">
          <div class="flex gap-2">
            <textarea
              ref={chatInputRef}
              value={chatInput()}
              onInput={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={handleChatInputKeyDown}
              placeholder="Type a message..."
              rows={2}
              class="textarea textarea-bordered flex-1 resize-none focus:textarea-primary"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput().trim()}
              class="btn btn-primary self-end"
            >
              Send
            </button>
          </div>
        </div>
      </Show>

      <Show when={isCurrentChannelForum()}>
        <ThreadList
          threads={currentThreadList()}
          onThreadClick={handleThreadClick}
          selectedIndex={store.selectedMessageIndex}
          isFocused={store.focusArea === FocusArea.Content}
        />
      </Show>
    </>
  )
}

export default ChannelContent
