import { Component, Show, createEffect, onCleanup, untrack, ParentProps } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { store, storeActions, ViewState, ModalState } from '../store/app-store'
import { selectors } from '../store/selectors'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { safeLog } from '../lib/utils/safe-log'
import Icon from '../components/Icon'

/** Format retention hours as a human-readable duration */
function formatRetention(hours: number): string {
  if (hours % 24 === 0) return `${hours / 24}d`
  return `${hours}h`
}

const ChannelLayout: Component<ParentProps> = (props) => {
  const params = useParams()
  const navigate = useNavigate()
  const client = getProtocolBridge().getClient()

  const isConnected = selectors.isConnected
  const currentChannel = selectors.currentChannel
  const currentThreadList = selectors.currentThreadList
  const currentChannelMessages = selectors.currentChannelMessages
  const isCurrentChannelChat = selectors.isCurrentChannelChat
  const isCurrentChannelForum = selectors.isCurrentChannelForum
  const isCurrentChannelDM = selectors.isCurrentChannelDM
  const currentDMChannel = selectors.currentDMChannel

  // Join channel when params change (gated on connection)
  // Only isConnected() and params.channelId are tracked — other store reads
  // are wrapped in untrack() so subscription confirmations and DM state changes
  // don't re-trigger this effect and wipe activeThreadId.
  createEffect(() => {
    if (!isConnected()) return

    const channelId = BigInt(params.channelId)
    safeLog('Route: joining channel', channelId)

    // Unsubscribe from previous channel if different
    untrack(() => {
      if (store.subscribedChannelId !== null && store.subscribedChannelId !== channelId) {
        client.unsubscribeChannel(store.subscribedChannelId)
        store.setSubscribedChannelId(null)
      }
    })

    // Clear state for new channel
    store.setActiveThreadId(null)
    storeActions.clearCompose()
    storeActions.closeMobilePanels()

    // Clear unread count for DMs
    untrack(() => {
      const dm = store.dmChannels.get(channelId)
      if (dm) {
        storeActions.addDMChannel({ ...dm, unreadCount: 0 })
      }
    })

    client.joinChannel(channelId)
  })

  // Cleanup on unmount: unsubscribe from channel
  onCleanup(() => {
    if (store.subscribedChannelId !== null) {
      client.unsubscribeChannel(store.subscribedChannelId)
      store.setSubscribedChannelId(null)
    }
  })

  const handleBackToThreadList = () => {
    navigate(`/channel/${params.channelId}`)
  }

  return (
    <Show when={currentChannel()} fallback={
      <div class="flex-1 flex items-center justify-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    }>
      {/* Channel Header */}
      <div class="border-b border-base-300 p-4 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2">
          {/* Mobile: sidebar toggle */}
          <button
            onClick={() => storeActions.toggleMobileSidebar()}
            class="btn btn-ghost btn-sm btn-circle md:hidden"
            title="Channels"
          >
            <Icon name="list" size={20} />
          </button>

          {/* Back button for thread detail view */}
          <Show when={isCurrentChannelForum() && store.currentView === ViewState.ThreadDetail}>
            <button
              onClick={handleBackToThreadList}
              class="btn btn-ghost btn-sm btn-circle"
              title="Back to thread list"
            >
              <Icon name="arrow-left" size={18} />
            </button>
          </Show>

          <span class="font-mono text-primary text-lg">
            {currentChannel()!.type === 0 ? '>' : '#'}
          </span>
          <h3 class="font-bold text-lg">{currentChannel()!.name}</h3>
          <Show when={store.subscribedChannelId === currentChannel()!.channel_id}>
            <span class="badge badge-success badge-sm">Live</span>
          </Show>
          <Show when={isCurrentChannelDM()}>
            <Show when={currentDMChannel()?.isEncrypted}>
              <span class="badge badge-info badge-sm gap-1" title="Ephemeral encryption - keys lost on page close"><Icon name="lock" size={12} /> Encrypted (session only)</span>
            </Show>
            <Show when={currentDMChannel()?.participantLeft}>
              <span class="badge badge-warning badge-sm">Partner left</span>
            </Show>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          {/* New Thread button for forum channels in thread list view */}
          <Show when={isCurrentChannelForum() && store.currentView !== ViewState.ThreadDetail}>
            <button
              onClick={() => {
                storeActions.clearCompose()
                storeActions.openModal(ModalState.Compose)
              }}
              class="btn btn-primary btn-sm gap-1"
            >
              <Icon name="plus" size={16} />
              <span class="hidden sm:inline">New Thread</span>
            </button>
          </Show>
          <div class="text-sm text-base-content/70 hidden sm:block">
            <Show
              when={isCurrentChannelChat()}
              fallback={
                <span>{currentThreadList().length} threads</span>
              }
            >
              <span>{currentChannelMessages().length} messages</span>
            </Show>
            <Show when={currentChannel()!.retention_hours > 0}>
              <span class="text-base-content/50"> · {formatRetention(currentChannel()!.retention_hours)} retention</span>
            </Show>
          </div>
          {/* Mobile: users panel toggle */}
          <button
            onClick={() => storeActions.toggleMobileUsers()}
            class="btn btn-ghost btn-sm btn-circle md:hidden"
            title="Online users"
          >
            <Icon name="users" size={20} />
          </button>
        </div>
      </div>

      {/* Route children: ChannelContent or ThreadDetailPage */}
      {props.children}
    </Show>
  )
}

export default ChannelLayout
