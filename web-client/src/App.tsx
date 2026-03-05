import { Component, createEffect, onCleanup, onMount, For, Show, createSignal, createMemo, ParentProps } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { getProtocolBridge, destroyProtocolBridge } from './lib/protocol-bridge'
import { store, storeActions, ViewState, ModalState, FocusArea } from './store/app-store'
import { selectors } from './store/selectors'
import ServerSelector from './components/ServerSelector'
import ComposeModal from './components/ComposeModal'
import StartDMModal from './components/StartDMModal'
import DMRequestModal from './components/DMRequestModal'
import EncryptionSetupModal from './components/EncryptionSetupModal'
import PasswordModal from './components/PasswordModal'
import RegisterModal from './components/RegisterModal'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'
import CreateChannelModal from './components/CreateChannelModal'
import CreateSubchannelModal from './components/CreateSubchannelModal'
import ChangeNicknameModal from './components/ChangeNicknameModal'
import ChangePasswordModal from './components/ChangePasswordModal'
import { DM_TARGET_BY_USER_ID, DM_TARGET_BY_SESSION_ID, type Message } from './SuperChatCodec'
import Icon from './components/Icon'
import { encryptMessage } from './lib/crypto'
import { safeLog } from './lib/utils/safe-log'
import { isOwnMessage } from './lib/utils/nickname'
import {
  CommandExecutor,
  ViewState as CmdViewState,
  ModalState as CmdModalState,
  useKeyboardShortcuts,
  useFooterShortcuts
} from './lib/commands'

const App: Component<ParentProps> = (props) => {
  const navigate = useNavigate()
  let bridge = getProtocolBridge()
  let client = bridge.getClient()

  // True until onMount has checked localStorage for saved credentials
  const [checkingCredentials, setCheckingCredentials] = createSignal(true)

  // Initialize with connection screen
  const isConnected = selectors.isConnected
  const isConnecting = selectors.isConnecting
  const channels = selectors.channelsArray
  const currentChannel = selectors.currentChannel
  const currentChannelMessages = selectors.currentChannelMessages
  const currentThreadList = selectors.currentThreadList
  const currentThread = selectors.currentThread
  const isCurrentChannelChat = selectors.isCurrentChannelChat
  const isCurrentChannelForum = selectors.isCurrentChannelForum
  const formattedTrafficStats = selectors.formattedTrafficStats
  const dmChannels = selectors.dmChannelsArray
  const isCurrentChannelDM = selectors.isCurrentChannelDM
  const currentDMChannel = selectors.currentDMChannel
  const onlineUsers = selectors.onlineUsers

  // Flatten thread messages for keyboard navigation (used by command handler)
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

  // Command executor for keyboard shortcuts
  const commandExecutor: CommandExecutor = {
    getCurrentView: () => {
      if (!isConnected()) return CmdViewState.ChannelList
      if (!currentChannel()) return CmdViewState.ChannelList
      if (isCurrentChannelChat()) return CmdViewState.ChatView
      if (store.currentView === ViewState.ThreadDetail) return CmdViewState.ThreadDetail
      return CmdViewState.ThreadList
    },
    getActiveModal: () => {
      switch (store.activeModal) {
        case ModalState.Help: return CmdModalState.Help
        case ModalState.Compose: return CmdModalState.Compose
        case ModalState.ServerSelector: return CmdModalState.ServerSelector
        case ModalState.ConfirmDelete: return CmdModalState.ConfirmDelete
        case ModalState.CreateSubchannel: return CmdModalState.CreateSubchannel
        case ModalState.StartDM: return CmdModalState.StartDM
        case ModalState.DMRequest: return CmdModalState.DMRequest
        case ModalState.EncryptionSetup: return CmdModalState.EncryptionSetup
        default: return CmdModalState.None
      }
    },
    hasSelectedChannel: () => store.activeChannelId !== null,
    hasSelectedMessage: () => store.selectedMessageIndex >= 0,
    hasSelectedOwnMessage: () => {
      const messages = flattenedThreadMessages()
      const idx = store.selectedMessageIndex
      return idx >= 0 && idx < messages.length && isOwnMessage(messages[idx])
    },
    hasSelectedThread: () => currentThreadList().length > 0 && store.selectedThreadListIndex >= 0,
    hasComposeContent: () => store.compose.content.trim().length > 0,
    canGoBack: () => {
      return store.activeModal !== ModalState.None ||
             store.currentView === ViewState.ThreadDetail ||
             store.focusArea === FocusArea.Content ||
             store.activeChannelId !== null
    },
    isAdmin: () => {
      const sid = store.selfSessionId
      if (!sid) return false
      const entry = store.serverRoster.get(sid)
      return entry ? (entry.userFlags & 0x01) !== 0 : false
    },
    isConnected: () => isConnected(),
    isRegistered: () => store.isRegistered
  }

  // Get footer shortcuts text
  const footerShortcuts = useFooterShortcuts(commandExecutor)

  // Handle keyboard commands
  const handleCommand = (actionId: string) => {
    safeLog('[Keyboard] Command:', actionId)

    switch (actionId) {
      case 'help':
        storeActions.openModal(ModalState.Help)
        break

      case 'quit':
        handleDisconnect()
        break

      case 'go-back': {
        if (store.activeModal !== ModalState.None) {
          storeActions.closeModal()
        } else if (store.compose.replyToId !== null) {
          storeActions.clearCompose()
        } else if (store.focusArea === FocusArea.Content) {
          if (store.currentView === ViewState.ThreadDetail) {
            // Forum: go back to thread list via router
            if (store.activeChannelId !== null) {
              const base = store.activeSubchannelId
                ? `/channel/${store.activeChannelId}/sub/${store.activeSubchannelId}`
                : `/channel/${store.activeChannelId}`
              navigate(base)
            }
          } else if (isCurrentChannelChat()) {
            // Chat channel: go back to channel list
            navigate('/')
          } else {
            // Forum thread list: switch focus to sidebar first
            store.setFocusArea(FocusArea.Sidebar)
          }
        } else {
          // Already in sidebar, deselect channel
          if (store.activeChannelId !== null) {
            navigate('/')
          }
        }
        break
      }

      case 'navigate-up':
        if (store.focusArea === FocusArea.Sidebar) {
          const newIndex = Math.max(0, store.selectedChannelIndex - 1)
          store.setSelectedChannelIndex(newIndex)
        } else if (store.currentView === ViewState.ThreadList) {
          const newIndex = Math.max(0, store.selectedThreadListIndex - 1)
          store.setSelectedThreadListIndex(newIndex)
        } else {
          const newIndex = Math.max(0, store.selectedMessageIndex - 1)
          store.setSelectedMessageIndex(newIndex)
        }
        break

      case 'navigate-down':
        if (store.focusArea === FocusArea.Sidebar) {
          const maxIndex = channels().length - 1
          const newIndex = Math.min(maxIndex, store.selectedChannelIndex + 1)
          store.setSelectedChannelIndex(newIndex)
        } else if (store.currentView === ViewState.ThreadList) {
          const maxIndex = currentThreadList().length - 1
          const newIndex = Math.min(Math.max(0, maxIndex), store.selectedThreadListIndex + 1)
          store.setSelectedThreadListIndex(newIndex)
        } else {
          let maxIndex = 0
          if (isCurrentChannelChat()) {
            maxIndex = currentChannelMessages().length - 1
          } else if (store.currentView === ViewState.ThreadDetail) {
            maxIndex = flattenedThreadMessages().length - 1
          }
          const newIndex = Math.min(Math.max(0, maxIndex), store.selectedMessageIndex + 1)
          store.setSelectedMessageIndex(newIndex)
        }
        break

      case 'select':
        if (store.focusArea === FocusArea.Sidebar) {
          const channelsList = channels()
          if (channelsList.length > 0 && store.selectedChannelIndex < channelsList.length) {
            const channel = channelsList[store.selectedChannelIndex]
            navigate(`/channel/${channel.channel_id}`)
            store.setFocusArea(FocusArea.Content)
            store.setSelectedMessageIndex(0)
          }
        } else if (store.currentView === ViewState.ThreadList) {
          const threads = currentThreadList()
          if (threads.length > 0 && store.selectedThreadListIndex < threads.length) {
            const thread = threads[store.selectedThreadListIndex]
            if (store.activeChannelId !== null) {
              const base = store.activeSubchannelId
                ? `/channel/${store.activeChannelId}/sub/${store.activeSubchannelId}`
                : `/channel/${store.activeChannelId}`
              navigate(`${base}/thread/${thread.message_id}`)
              store.setSelectedMessageIndex(0)
            }
          }
        }
        break

      case 'switch-focus':
        storeActions.toggleFocus()
        break

      case 'compose-new-thread':
        if (currentChannel()) {
          storeActions.clearCompose()
          storeActions.openModal(ModalState.Compose)
        }
        break

      case 'compose-reply':
        if (store.currentView === ViewState.ThreadDetail) {
          const messages = flattenedThreadMessages()
          const idx = store.selectedMessageIndex
          if (idx >= 0 && idx < messages.length) {
            const msg = messages[idx]
            safeLog('Replying to:', msg.message_id)
            storeActions.updateCompose({
              replyToId: msg.message_id,
              replyToMessage: msg
            })
            storeActions.openModal(ModalState.Compose)
          }
        }
        break

      case 'start-dm':
        storeActions.openModal(ModalState.StartDM)
        break

      case 'register-nickname':
        storeActions.openModal(ModalState.Register)
        break

      case 'go-anonymous': {
        // Full disconnect/reconnect to avoid server linking sessions
        const url = store.serverUrl
        const nick = store.nickname
        const throttle = store.traffic.throttleBytesPerSecond

        if (store.subscribedChannelId !== null) {
          client.unsubscribeChannel(store.subscribedChannelId, store.activeSubchannelId ?? undefined)
        }

        // Clear auth state
        sessionStorage.removeItem('superchat_auth_hash')
        store.setIsRegistered(false)
        store.setUserId(0n)

        // Disconnect and reconnect as anonymous
        client.disconnect()
        storeActions.resetConnection()
        navigate('/')

        // Reconnect with same nickname but no auth
        setTimeout(() => {
          store.setServerUrl(url)
          store.setNickname(nick)
          storeActions.updateTraffic({ throttleBytesPerSecond: throttle })
          client.connect(url, nick)
        }, 100)
        break
      }

      case 'change-nickname':
        storeActions.openModal(ModalState.ChangeNickname)
        break

      case 'change-password':
        storeActions.openModal(ModalState.ChangePassword)
        break

      case 'edit-message': {
        const messages = flattenedThreadMessages()
        const idx = store.selectedMessageIndex
        if (idx >= 0 && idx < messages.length) {
          const msg = messages[idx]
          if (isOwnMessage(msg)) {
            storeActions.updateCompose({
              editMessageId: msg.message_id,
              editMessageContent: msg.content,
              replyToId: null,
              replyToMessage: null
            })
            storeActions.openModal(ModalState.Compose)
          }
        }
        break
      }

      case 'delete-message': {
        const messages = flattenedThreadMessages()
        const idx = store.selectedMessageIndex
        if (idx >= 0 && idx < messages.length) {
          const msg = messages[idx]
          store.setConfirmDeleteMessageId(msg.message_id)
          storeActions.openModal(ModalState.ConfirmDelete)
        }
        break
      }

      case 'create-channel':
        storeActions.openModal(ModalState.CreateChannel)
        break

      case 'create-subchannel':
        storeActions.openModal(ModalState.CreateSubchannel)
        break

      default:
        safeLog('[Keyboard] Unhandled command:', actionId)
    }
  }

  // Set up keyboard shortcuts
  useKeyboardShortcuts(
    commandExecutor,
    handleCommand,
    () => isConnected() || store.activeModal === ModalState.Help
  )

  // Cleanup on unmount
  onCleanup(() => {
    client.disconnect()
    destroyProtocolBridge()
  })

  // Auto-connect on page load if saved credentials exist
  onMount(() => {
    const savedUrl = localStorage.getItem('superchat_last_url')
    const savedNickname = localStorage.getItem('superchat_nickname')
    const savedThrottle = localStorage.getItem('superchat_throttle_speed')

    if (savedUrl && savedNickname) {
      const throttleBps = savedThrottle ? parseInt(savedThrottle, 10) : 0
      handleConnect(savedUrl, savedNickname, throttleBps)
      // Keep checkingCredentials true — the connecting/connected state
      // will hide the ServerSelector. Only clear it once we know we're
      // NOT auto-connecting (no saved credentials).
    } else {
      setCheckingCredentials(false)
    }
  })

  // Update window title based on current view
  createEffect(() => {
    const channel = currentChannel()
    const thread = currentThread()
    const view = store.currentView

    if (!channel) {
      document.title = 'SuperChat'
      return
    }

    const prefix = channel.type === 0 ? '>' : '#'
    const channelLabel = `${prefix}${channel.name}`

    if (view === ViewState.ThreadDetail && thread) {
      const preview = thread.content.length > 40
        ? thread.content.slice(0, 40) + '...'
        : thread.content
      document.title = `${preview} - ${channelLabel} - SuperChat`
    } else {
      document.title = `${channelLabel} - SuperChat`
    }
  })

  // Auto-request message list when channel changes
  createEffect(() => {
    const channelId = store.activeChannelId
    const subId = store.activeSubchannelId ?? undefined
    if (channelId !== null) {
      safeLog('Active channel changed to:', channelId, 'sub:', subId)

      if (storeActions.isChannelLoaded(channelId)) {
        // Already loaded — fetch only messages we missed (after_id)
        const latestId = storeActions.getChannelLatestMessageId(channelId)
        if (latestId) {
          client.listMessages(channelId, 0n, 100, latestId, subId)
        }
      } else {
        // First visit — full fetch
        client.listMessages(channelId, 0n, 100, undefined, subId)
      }

      client.subscribeChannel(channelId, subId)
    }
  })

  const handleConnect = (url: string, nickname: string, throttleBps: number) => {
    safeLog('Connecting:', { url, nickname, throttleBps })
    store.setServerUrl(url)
    store.setNickname(nickname)
    storeActions.updateTraffic({ throttleBytesPerSecond: throttleBps })

    client.connect(url, nickname)
  }

  const handleDisconnect = () => {
    if (store.subscribedChannelId !== null) {
      client.unsubscribeChannel(store.subscribedChannelId, store.activeSubchannelId ?? undefined)
    }

    localStorage.removeItem('superchat_last_url')

    client.disconnect()
    store.setNickname('')
    store.setServerUrl('')
    storeActions.resetConnection()
    navigate('/')
  }

  const handleComposeSend = async (content: string) => {
    // Edit mode: send edit instead of new message
    if (store.compose.editMessageId) {
      client.editMessage(store.compose.editMessageId, content)
      storeActions.clearCompose()
      storeActions.closeModal()
      return
    }

    if (!currentChannel()) return

    const channelId = currentChannel()!.channel_id
    const key = store.dmChannelKeys.get(channelId)
    const subId = store.activeSubchannelId ?? undefined

    if (key) {
      const plaintext = new TextEncoder().encode(content)
      const encrypted = await encryptMessage(key, plaintext)
      client.postMessageRaw(channelId, encrypted, store.compose.replyToId, subId)
    } else {
      client.postMessage(channelId, content, store.compose.replyToId, subId)
    }

    storeActions.clearCompose()
    storeActions.closeModal()
  }

  const handleComposeCancel = () => {
    storeActions.clearCompose()
    storeActions.closeModal()
  }

  const handleLeaveDMPermanent = (channelId: bigint) => {
    client.leaveChannel(channelId, true)
    storeActions.removeDMChannel(channelId)
    storeActions.removeDMChannelKey(channelId)

    if (store.activeChannelId === channelId) {
      navigate('/')
    }
  }

  return (
    <div class="min-h-screen bg-base-100 flex flex-col overflow-hidden">
      {/* Server Selector - shown only after credential check confirms no auto-connect */}
      <Show when={!checkingCredentials() && !isConnected() && !isConnecting()}>
        <ServerSelector onConnect={handleConnect} />
      </Show>

      {/* Connecting State */}
      <Show when={isConnecting()}>
        <div class="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
          <div class="text-center">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="mt-4 text-lg">Connecting to server...</p>
          </div>
        </div>
      </Show>

      {/* Main App UI */}
      <Show when={isConnected()}>
        <div class="flex h-screen overflow-hidden">
          {/* Mobile backdrop */}
          <Show when={store.mobileSidebarOpen || store.mobileUsersOpen}>
            <div
              class="fixed inset-0 bg-black/50 z-30 md:hidden"
              onClick={() => storeActions.closeMobilePanels()}
            />
          </Show>

          {/* Sidebar - Channel List */}
          <div class={`${store.mobileSidebarOpen ? 'flex' : 'hidden'} md:flex w-64 bg-base-200 border-r border-base-300 flex-col fixed md:relative inset-y-0 left-0 z-40`}>
            <div class="p-4 border-b border-base-300 flex-shrink-0">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <h2 class="font-bold text-lg">SuperChat</h2>
                  <p class="text-sm text-base-content/70">
                    {store.isRegistered ? '' : '~'}{store.nickname}
                    <Show when={!store.isRegistered}>
                      {' '}<Show
                        when={store.nicknameIsRegistered}
                        fallback={
                          <button
                            class="link link-primary text-xs"
                            onClick={() => storeActions.openModal(ModalState.Register)}
                            title="Register your nickname (Ctrl+R)"
                          >Register</button>
                        }
                      >
                        <button
                          class="link link-primary text-xs"
                          onClick={() => storeActions.openModal(ModalState.Password)}
                          title="Login to your registered nickname"
                        >Login</button>
                      </Show>
                    </Show>
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  class="btn btn-ghost btn-sm btn-circle"
                  title="Disconnect"
                >
                  <Icon name="sign-out" size={16} />
                </button>
              </div>
              {/* Traffic Stats */}
              <div class="text-xs text-base-content/50 font-mono">
                {formattedTrafficStats()}
              </div>
            </div>

            <div class="p-4 flex-1 overflow-y-auto">
              {/* DM Channels */}
              <Show when={dmChannels().length > 0 || Array.from(store.outgoingDMInvites.values()).length > 0 || Array.from(store.pendingDMInvites.values()).length > 0}>
                <h3 class="font-semibold text-sm uppercase text-base-content/70 mb-2">
                  Direct Messages
                </h3>
                <div class="space-y-1 mb-4">
                  {/* Active DM channels */}
                  <For each={dmChannels()}>
                    {(dm) => {
                      const isSelected = () => store.activeChannelId === dm.channelId
                      return (
                        <div class="flex items-center gap-1">
                          <button
                            onClick={() => {
                              storeActions.closeMobilePanels()
                              navigate(`/channel/${dm.channelId}`)
                            }}
                            class={`btn btn-ghost btn-sm flex-1 justify-start text-left gap-1 ${
                              isSelected() ? 'btn-active' : ''
                            }`}
                          >
                            {dm.isEncrypted
                              ? <Icon name="lock" size={14} />
                              : <Icon name="envelope" size={14} />
                            }
                            <span class="truncate">{dm.otherNickname}</span>
                            <Show when={dm.participantLeft}>
                              <span class="badge badge-xs badge-warning">left</span>
                            </Show>
                            <Show when={dm.unreadCount > 0}>
                              <span class="badge badge-xs badge-primary">{dm.unreadCount}</span>
                            </Show>
                          </button>
                          <button
                            onClick={() => handleLeaveDMPermanent(dm.channelId)}
                            class="btn btn-ghost btn-xs opacity-50 hover:opacity-100"
                            title="Leave DM permanently"
                          >
                            x
                          </button>
                        </div>
                      )
                    }}
                  </For>

                  {/* Outgoing DM invites (waiting for acceptance) */}
                  <For each={Array.from(store.outgoingDMInvites.values())}>
                    {(invite) => (
                      <div class="flex items-center gap-2 px-3 py-1 text-sm text-base-content/50">
                        <span class="loading loading-spinner loading-xs"></span>
                        <span class="truncate">{invite.toNickname}</span>
                        <span class="text-xs">(pending)</span>
                      </div>
                    )}
                  </For>

                  {/* Pending incoming DM requests */}
                  <For each={Array.from(store.pendingDMInvites.values())}>
                    {(invite) => (
                      <button
                        onClick={() => {
                          store.setActiveDMInvite(invite)
                          storeActions.openModal(ModalState.DMRequest)
                        }}
                        class="btn btn-ghost btn-sm w-full justify-start text-left gap-1 text-warning"
                      >
                        <span class="text-xs">!</span>
                        <span class="truncate">{invite.fromNickname}</span>
                        <span class="badge badge-xs badge-warning">request</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <h3 class="font-semibold text-sm uppercase text-base-content/70 mb-2">
                Channels
              </h3>
              <div class="space-y-1">
                <For each={channels()}>
                  {(channel, index) => {
                    const isSelected = () => store.activeChannelId === channel.channel_id && store.activeSubchannelId === null
                    const isKeyboardSelected = () =>
                      store.focusArea === FocusArea.Sidebar && store.selectedChannelIndex === index()
                    const isExpanded = () => store.expandedChannelId === channel.channel_id
                    const hasSubs = () => channel.has_subchannels > 0 || channel.subchannel_count > 0
                    const subs = () => store.subchannels.get(channel.channel_id) || []

                    return (
                      <>
                        <div class="flex items-center">
                          <Show when={hasSubs()}>
                            <button
                              onClick={() => {
                                storeActions.toggleExpandChannel(channel.channel_id)
                                if (!isExpanded() && subs().length === 0) {
                                  store.setLoadingSubchannels(true)
                                  client.getSubchannels(channel.channel_id)
                                }
                              }}
                              class="btn btn-ghost btn-xs btn-circle flex-shrink-0"
                              title={isExpanded() ? 'Collapse' : 'Expand'}
                            >
                              <Icon name={isExpanded() ? 'caret-down' : 'caret-right'} size={12} />
                            </button>
                          </Show>
                          <button
                            onClick={() => {
                              store.setSelectedChannelIndex(index())
                              store.setActiveSubchannelId(null)
                              storeActions.closeMobilePanels()
                              navigate(`/channel/${channel.channel_id}`)
                            }}
                            class={`btn btn-ghost flex-1 justify-start text-left ${
                              isSelected() ? 'btn-active' : ''
                            } ${isKeyboardSelected() ? 'ring-2 ring-primary ring-offset-1' : ''} ${
                              hasSubs() ? '' : 'ml-6'
                            }`}
                          >
                            <span class="font-mono text-primary">
                              {channel.type === 0 ? '>' : '#'}
                            </span>
                            <span class="truncate">{channel.name}</span>
                            <Show when={hasSubs()}>
                              <span class="badge badge-xs badge-ghost ml-auto">{channel.subchannel_count}</span>
                            </Show>
                          </button>
                        </div>
                        {/* Expanded subchannels */}
                        <Show when={isExpanded()}>
                          <Show when={store.loadingSubchannels && subs().length === 0}>
                            <div class="ml-10 text-xs text-base-content/50 py-1">Loading...</div>
                          </Show>
                          <For each={subs()}>
                            {(sub) => {
                              const isSubSelected = () =>
                                store.activeChannelId === channel.channel_id && store.activeSubchannelId === sub.id
                              return (
                                <button
                                  onClick={() => {
                                    storeActions.closeMobilePanels()
                                    navigate(`/channel/${channel.channel_id}/sub/${sub.id}`)
                                  }}
                                  class={`btn btn-ghost btn-sm w-full justify-start text-left ml-8 ${
                                    isSubSelected() ? 'btn-active' : ''
                                  }`}
                                >
                                  <span class="font-mono text-secondary text-xs">
                                    {sub.type === 0 ? '>' : '#'}
                                  </span>
                                  <span class="truncate text-sm">{sub.name}</span>
                                </button>
                              )
                            }}
                          </For>
                        </Show>
                      </>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>

          {/* Main Content Area - Route children render here */}
          <div class="flex-1 flex flex-col overflow-hidden">
            {props.children}

            {/* Keyboard shortcuts footer (hidden on mobile - no keyboard) */}
            <div class="border-t border-base-300 px-4 py-2 flex-shrink-0 bg-base-200 hidden md:block">
              <div class="flex justify-between items-center">
                <div class="text-xs text-base-content/60 font-mono">
                  {footerShortcuts()}
                </div>
                <div class="text-xs text-base-content/40">
                  <Show when={store.focusArea === FocusArea.Sidebar}>
                    <span class="badge badge-outline badge-xs">Sidebar</span>
                  </Show>
                  <Show when={store.focusArea === FocusArea.Content}>
                    <span class="badge badge-outline badge-xs">Content</span>
                  </Show>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Online Users */}
          <div class={`${store.mobileUsersOpen ? 'flex' : 'hidden'} md:flex w-48 bg-base-200 border-l border-base-300 flex-col fixed md:relative inset-y-0 right-0 z-40`}>
            <div class="p-3 border-b border-base-300 flex-shrink-0">
              <h3 class="font-semibold text-sm uppercase text-base-content/70">
                Online ({onlineUsers().length})
              </h3>
            </div>
            <div class="p-2 flex-1 overflow-y-auto">
              <Show
                when={onlineUsers().length > 0}
                fallback={
                  <div class="text-xs text-base-content/50 p-2">No users yet</div>
                }
              >
                <div class="space-y-0.5">
                  <For each={onlineUsers()}>
                    {(user) => {
                      const isSelf = () => user.sessionId === store.selfSessionId
                      const flagPrefix = () => {
                        if (user.userFlags & 1) return '$'  // admin
                        if (user.userFlags & 2) return '@'  // moderator
                        return ''
                      }
                      return (
                        <div
                          class={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                            isSelf() ? 'text-primary' : 'text-base-content/80 hover:bg-base-300 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!isSelf()) {
                              const client = bridge.getClient()
                              if (user.isRegistered && user.userId !== null) {
                                client.startDM(DM_TARGET_BY_USER_ID, user.userId, null, false)
                              } else {
                                client.startDM(DM_TARGET_BY_SESSION_ID, user.sessionId, null, false)
                              }
                            }
                          }}
                          title={isSelf() ? 'You' : `Click to DM ${user.nickname}`}
                        >
                          <span class="font-mono text-xs text-primary shrink-0">
                            {flagPrefix()}{user.isRegistered ? '' : '~'}
                          </span>
                          <span class="truncate">{user.nickname}</span>
                          <Show when={isSelf()}>
                            <span class="text-xs text-base-content/40 shrink-0">(you)</span>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Help Modal */}
      <Show when={store.activeModal === ModalState.Help}>
        <div
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => storeActions.closeModal()}
        >
          <div
            class="bg-base-100 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="p-4 border-b border-base-300 flex justify-between items-center">
              <h2 class="text-lg font-bold">Keyboard Shortcuts</h2>
              <button
                onClick={() => storeActions.closeModal()}
                class="btn btn-ghost btn-sm btn-circle"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[60vh]">
              <div class="space-y-4">
                <div>
                  <h3 class="font-semibold text-sm text-base-content/70 mb-2">Navigation</h3>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Up/Down or K/J</span>
                      <span class="text-base-content/70">Move selection</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Enter</span>
                      <span class="text-base-content/70">Select item</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Tab</span>
                      <span class="text-base-content/70">Switch focus (sidebar/content)</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Esc</span>
                      <span class="text-base-content/70">Go back / Close</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 class="font-semibold text-sm text-base-content/70 mb-2">Messaging</h3>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">N</span>
                      <span class="text-base-content/70">New thread (forum)</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">R</span>
                      <span class="text-base-content/70">Reply to message</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">I</span>
                      <span class="text-base-content/70">Focus compose (chat)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 class="font-semibold text-sm text-base-content/70 mb-2">Direct Messages</h3>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Ctrl+D</span>
                      <span class="text-base-content/70">Start DM with user</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 class="font-semibold text-sm text-base-content/70 mb-2">General</h3>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">H or ?</span>
                      <span class="text-base-content/70">Show this help</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="font-mono text-primary">Q</span>
                      <span class="text-base-content/70">Disconnect</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="p-4 border-t border-base-300 text-center">
              <span class="text-xs text-base-content/50">Press Esc to close</span>
            </div>
          </div>
        </div>
      </Show>

      {/* Compose Modal */}
      <Show when={store.activeModal === ModalState.Compose}>
        <ComposeModal
          replyTo={store.compose.replyToMessage}
          channelName={currentChannel()?.name || ''}
          editMessageId={store.compose.editMessageId}
          editContent={store.compose.editMessageContent}
          onSend={handleComposeSend}
          onCancel={handleComposeCancel}
        />
      </Show>

      {/* Self-contained modals (read from store) */}
      <StartDMModal />
      <DMRequestModal />
      <EncryptionSetupModal />
      <PasswordModal />
      <RegisterModal />
      <ConfirmDeleteModal />
      <CreateChannelModal />
      <CreateSubchannelModal />
      <ChangeNicknameModal />
      <ChangePasswordModal />
    </div>
  )
}

export default App
