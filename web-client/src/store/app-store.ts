// Global application store using SolidJS signals + createStore
// Manages all client state: connection, channels, messages, UI state

import { createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { Channel, Message } from '../SuperChatCodec'

// Stringify bigint for use as object key (BigInt can't be object keys)
export const k = (id: bigint) => String(id)

// Per-channel message data stored in a SolidJS store for deep fine-grained reactivity
export interface ChannelData {
  messages: Record<string, Message>      // msgId (string) -> Message
  threadIds: string[]                    // root message IDs for this channel
  replyIndex: Record<string, string[]>   // parentId -> child message IDs
  latestMessageId: string | null         // highest message ID seen (for after_id on revisit)
}

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

// View states for forum channels
export enum ViewState {
  ChannelList = 'channel-list',  // Used when no channel selected
  ThreadList = 'thread-list',
  ThreadDetail = 'thread-detail',
  ChatView = 'chat-view'
}

// Modal states for keyboard navigation context
export enum ModalState {
  None = 'none',
  Compose = 'compose',
  Help = 'help',
  ServerSelector = 'server-selector',
  ConfirmDelete = 'confirm-delete',
  StartDM = 'start-dm',
  DMRequest = 'dm-request',
  EncryptionSetup = 'encryption-setup',
  Password = 'password',
  Register = 'register',
  CreateChannel = 'create-channel'
}

// Focus area for keyboard navigation
export enum FocusArea {
  Sidebar = 'sidebar',
  Content = 'content'
}

// UI state for compose area
export interface ComposeState {
  content: string
  replyToId: bigint | null
  replyToMessage: Message | null
  editMessageId: bigint | null
  editMessageContent: string
}

// DM channel info
export interface DMChannel {
  channelId: bigint
  otherUserId: bigint | null
  otherNickname: string
  isEncrypted: boolean
  otherPubKey: Uint8Array | null
  unreadCount: number
  participantLeft: boolean
}

// Incoming DM invite
export interface DMInvite {
  channelId: bigint
  fromUserId: bigint | null
  fromNickname: string
  encryptionStatus: number
}

// Outgoing DM invite (waiting for acceptance)
export interface OutgoingDMInvite {
  channelId: bigint
  toUserId: bigint | null
  toNickname: string
}

// Presence entry for server roster
export interface PresenceEntry {
  sessionId: bigint
  nickname: string
  isRegistered: boolean
  userId: bigint | null
  userFlags: number
}

// Traffic statistics
export interface TrafficStats {
  bytesSent: number
  bytesReceived: number
  throttleBytesPerSecond: number
}

// Per-channel message store (SolidJS createStore for deep reactivity)
export const [channelStore, setChannelStore] = createStore<{
  data: Record<string, ChannelData>
}>({
  data: {}
})

// Create signals for each store property
const [connectionState, setConnectionState] = createSignal<ConnectionState>('disconnected')
const [serverUrl, setServerUrl] = createSignal<string>('')
const [nickname, setNickname] = createSignal<string>('')
const [userId, setUserId] = createSignal<bigint | null>(null)
const [isRegistered, setIsRegistered] = createSignal<boolean>(false)
const [errorMessage, setErrorMessage] = createSignal<string>('')

// Data stores (using Maps for O(1) lookups)
const [channels, setChannels] = createSignal<Map<bigint, Channel>>(new Map())

// UI state
const [activeChannelId, setActiveChannelId] = createSignal<bigint | null>(null)
const [currentView, setCurrentView] = createSignal<ViewState>(ViewState.ThreadList)
const [activeThreadId, setActiveThreadId] = createSignal<bigint | null>(null)
const [compose, setCompose] = createSignal<ComposeState>({
  content: '',
  replyToId: null,
  replyToMessage: null,
  editMessageId: null,
  editMessageContent: ''
})
const [confirmDeleteMessageId, setConfirmDeleteMessageId] = createSignal<bigint | null>(null)

// Modal and focus state for keyboard navigation
const [activeModal, setActiveModal] = createSignal<ModalState>(ModalState.None)
const [focusArea, setFocusArea] = createSignal<FocusArea>(FocusArea.Sidebar)

// Selection indices for keyboard navigation
const [selectedChannelIndex, setSelectedChannelIndex] = createSignal<number>(0)
const [selectedMessageIndex, setSelectedMessageIndex] = createSignal<number>(0)

// Subscription tracking
const [subscribedChannelId, setSubscribedChannelId] = createSignal<bigint | null>(null)
const [subscribedThreadId, setSubscribedThreadId] = createSignal<bigint | null>(null)

// Traffic stats
const [traffic, setTraffic] = createSignal<TrafficStats>({
  bytesSent: 0,
  bytesReceived: 0,
  throttleBytesPerSecond: 0
})

// DM state
const [dmChannels, setDmChannels] = createSignal<Map<bigint, DMChannel>>(new Map())
const [pendingDMInvites, setPendingDMInvites] = createSignal<Map<bigint, DMInvite>>(new Map())
const [outgoingDMInvites, setOutgoingDMInvites] = createSignal<Map<bigint, OutgoingDMInvite>>(new Map())
const [dmChannelKeys, setDmChannelKeys] = createSignal<Map<bigint, Uint8Array>>(new Map())
const [encryptionKeyPub, setEncryptionKeyPub] = createSignal<Uint8Array | null>(null)
const [encryptionKeyPriv, setEncryptionKeyPriv] = createSignal<Uint8Array | null>(null)
const [serverRoster, setServerRoster] = createSignal<Map<bigint, PresenceEntry>>(new Map())
const [selfSessionId, setSelfSessionId] = createSignal<bigint | null>(null)
const [activeDMInvite, setActiveDMInvite] = createSignal<DMInvite | null>(null)
const [pendingEncryptionChannelId, setPendingEncryptionChannelId] = createSignal<bigint | null>(null)
const [encryptionSetupReason, setEncryptionSetupReason] = createSignal<string>('')
const [pendingAuthNickname, setPendingAuthNickname] = createSignal<string>('')
const [nicknameIsRegistered, setNicknameIsRegistered] = createSignal<boolean>(false)
const [authError, setAuthError] = createSignal<string>('')

// Mobile panel toggles (only effective below md breakpoint)
const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false)
const [mobileUsersOpen, setMobileUsersOpen] = createSignal(false)

// Export the store as an object with getters and setters
export const store = {
  // Connection state
  get connectionState() { return connectionState() },
  setConnectionState,

  get serverUrl() { return serverUrl() },
  setServerUrl,

  get nickname() { return nickname() },
  setNickname,

  get userId() { return userId() },
  setUserId,

  get isRegistered() { return isRegistered() },
  setIsRegistered,

  get errorMessage() { return errorMessage() },
  setErrorMessage,

  // Data
  get channels() { return channels() },
  setChannels,

  // UI state
  get activeChannelId() { return activeChannelId() },
  setActiveChannelId,

  get currentView() { return currentView() },
  setCurrentView,

  get activeThreadId() { return activeThreadId() },
  setActiveThreadId,

  get compose() { return compose() },
  setCompose,

  get confirmDeleteMessageId() { return confirmDeleteMessageId() },
  setConfirmDeleteMessageId,

  // Modal and focus state
  get activeModal() { return activeModal() },
  setActiveModal,

  get focusArea() { return focusArea() },
  setFocusArea,

  // Selection indices
  get selectedChannelIndex() { return selectedChannelIndex() },
  setSelectedChannelIndex,

  get selectedMessageIndex() { return selectedMessageIndex() },
  setSelectedMessageIndex,

  // Subscriptions
  get subscribedChannelId() { return subscribedChannelId() },
  setSubscribedChannelId,

  get subscribedThreadId() { return subscribedThreadId() },
  setSubscribedThreadId,

  // Traffic
  get traffic() { return traffic() },
  setTraffic,

  // DM state
  get dmChannels() { return dmChannels() },
  setDmChannels,

  get pendingDMInvites() { return pendingDMInvites() },
  setPendingDMInvites,

  get outgoingDMInvites() { return outgoingDMInvites() },
  setOutgoingDMInvites,

  get dmChannelKeys() { return dmChannelKeys() },
  setDmChannelKeys,

  get encryptionKeyPub() { return encryptionKeyPub() },
  setEncryptionKeyPub,

  get encryptionKeyPriv() { return encryptionKeyPriv() },
  setEncryptionKeyPriv,

  get serverRoster() { return serverRoster() },
  setServerRoster,

  get selfSessionId() { return selfSessionId() },
  setSelfSessionId,

  get activeDMInvite() { return activeDMInvite() },
  setActiveDMInvite,

  get pendingEncryptionChannelId() { return pendingEncryptionChannelId() },
  setPendingEncryptionChannelId,

  get encryptionSetupReason() { return encryptionSetupReason() },
  setEncryptionSetupReason,

  get pendingAuthNickname() { return pendingAuthNickname() },
  setPendingAuthNickname,

  get nicknameIsRegistered() { return nicknameIsRegistered() },
  setNicknameIsRegistered,

  get authError() { return authError() },
  setAuthError,

  // Mobile panels
  get mobileSidebarOpen() { return mobileSidebarOpen() },
  setMobileSidebarOpen,

  get mobileUsersOpen() { return mobileUsersOpen() },
  setMobileUsersOpen,
}

// Helper actions for common operations
export const storeActions = {
  // Add or update a channel
  addChannel(channel: Channel) {
    setChannels(prev => new Map(prev).set(channel.channel_id, channel))
  },

  // Add or update multiple channels
  addChannels(channelList: Channel[]) {
    setChannels(prev => {
      const newMap = new Map(prev)
      channelList.forEach(ch => newMap.set(ch.channel_id, ch))
      return newMap
    })
  },

  // Ensure a channel's data slot exists
  ensureChannelData(channelId: bigint) {
    const key = k(channelId)
    if (!channelStore.data[key]) {
      setChannelStore('data', key, {
        messages: {},
        threadIds: [],
        replyIndex: {},
        latestMessageId: null
      })
    }
  },

  // Add or update a single message in its channel's store
  addMessage(message: Message) {
    const chKey = k(message.channel_id)
    this.ensureChannelData(message.channel_id)
    const msgKey = k(message.message_id)

    // Add message
    setChannelStore('data', chKey, 'messages', msgKey, message)

    // Update latestMessageId
    const current = channelStore.data[chKey].latestMessageId
    if (!current || BigInt(msgKey) > BigInt(current)) {
      setChannelStore('data', chKey, 'latestMessageId', msgKey)
    }

    // Update indexes incrementally
    if (message.parent_id.present === 0) {
      // Root message — add to threadIds if not already there
      const existing = channelStore.data[chKey].threadIds
      if (!existing.includes(msgKey)) {
        setChannelStore('data', chKey, 'threadIds', [...existing, msgKey])
      }
    } else {
      // Reply — add to replyIndex
      const parentKey = k(message.parent_id.value!)
      const existing = channelStore.data[chKey].replyIndex[parentKey] || []
      if (!existing.includes(msgKey)) {
        setChannelStore('data', chKey, 'replyIndex', parentKey, [...existing, msgKey])
      }
    }
  },

  // Add or update multiple messages (batch, grouped by channel)
  addMessages(messageList: Message[]) {
    // Group by channel
    const byChannel = new Map<string, Message[]>()
    for (const msg of messageList) {
      const chKey = k(msg.channel_id)
      let list = byChannel.get(chKey)
      if (!list) {
        list = []
        byChannel.set(chKey, list)
      }
      list.push(msg)
    }

    for (const [chKey, msgs] of byChannel) {
      const channelId = BigInt(chKey)
      this.ensureChannelData(channelId)

      // Build messages dict, threadIds, replyIndex, and latestMessageId for this batch
      const newMessages: Record<string, Message> = { ...channelStore.data[chKey].messages }
      const threadIdSet = new Set(channelStore.data[chKey].threadIds)
      const newReplyIndex: Record<string, string[]> = {}
      // Copy existing replyIndex
      for (const [parentKey, children] of Object.entries(channelStore.data[chKey].replyIndex)) {
        newReplyIndex[parentKey] = [...children]
      }

      let latestId = channelStore.data[chKey].latestMessageId

      for (const msg of msgs) {
        const msgKey = k(msg.message_id)
        newMessages[msgKey] = msg

        if (!latestId || BigInt(msgKey) > BigInt(latestId)) {
          latestId = msgKey
        }

        if (msg.parent_id.present === 0) {
          threadIdSet.add(msgKey)
        } else {
          const parentKey = k(msg.parent_id.value!)
          if (!newReplyIndex[parentKey]) {
            newReplyIndex[parentKey] = []
          }
          if (!newReplyIndex[parentKey].includes(msgKey)) {
            newReplyIndex[parentKey].push(msgKey)
          }
        }
      }

      setChannelStore('data', chKey, {
        messages: newMessages,
        threadIds: Array.from(threadIdSet),
        replyIndex: newReplyIndex,
        latestMessageId: latestId
      })
    }
  },

  // Clear all per-channel message data (e.g., on disconnect)
  clearMessages() {
    setChannelStore('data', {})
  },

  // Check if a channel has been loaded
  isChannelLoaded(channelId: bigint): boolean {
    return !!channelStore.data[k(channelId)]
  },

  // Get the latest message ID for a channel (for after_id incremental fetch)
  getChannelLatestMessageId(channelId: bigint): bigint | null {
    const data = channelStore.data[k(channelId)]
    if (!data?.latestMessageId) return null
    return BigInt(data.latestMessageId)
  },

  // Update compose state
  updateCompose(updates: Partial<ComposeState>) {
    setCompose(prev => ({ ...prev, ...updates }))
  },

  // Clear compose state
  clearCompose() {
    setCompose({
      content: '',
      replyToId: null,
      replyToMessage: null,
      editMessageId: null,
      editMessageContent: ''
    })
  },

  // Update traffic stats
  updateTraffic(updates: Partial<TrafficStats>) {
    setTraffic(prev => ({ ...prev, ...updates }))
  },

  // Add bytes to traffic counters
  addTrafficBytes(sent: number = 0, received: number = 0) {
    setTraffic(prev => ({
      ...prev,
      bytesSent: prev.bytesSent + sent,
      bytesReceived: prev.bytesReceived + received
    }))
  },

  // Reset connection state (preserves nickname/serverUrl — they're user identity, not session state)
  resetConnection() {
    setConnectionState('disconnected')
    setUserId(null)
    setIsRegistered(false)
    setNicknameIsRegistered(false)
    setErrorMessage('')
    setActiveChannelId(null)
    setCurrentView(ViewState.ThreadList)
    setActiveThreadId(null)
    setSubscribedChannelId(null)
    setSubscribedThreadId(null)
    setActiveModal(ModalState.None)
    setFocusArea(FocusArea.Sidebar)
    setSelectedChannelIndex(0)
    setSelectedMessageIndex(0)
    this.clearMessages()
    this.clearCompose()
    this.clearDMState()
  },

  // Open/close modals
  openModal(modal: ModalState) {
    setActiveModal(modal)
  },

  closeModal() {
    setActiveModal(ModalState.None)
  },

  // Find which channel a message belongs to (scans all channels)
  findMessageChannel(messageId: bigint): string | null {
    const msgKey = k(messageId)
    for (const chKey of Object.keys(channelStore.data)) {
      if (channelStore.data[chKey].messages[msgKey]) {
        return chKey
      }
    }
    return null
  },

  // Update a message's content and edited_at timestamp (for MESSAGE_EDITED broadcast)
  updateMessageContent(messageId: bigint, content: string, editedAt: bigint) {
    const msgKey = k(messageId)
    const chKey = this.findMessageChannel(messageId)
    if (!chKey) return

    setChannelStore('data', chKey, 'messages', msgKey, {
      ...channelStore.data[chKey].messages[msgKey],
      content,
      edited_at: { present: 1, value: editedAt }
    })
  },

  // Soft-delete a message: replace content with deletion marker, keep the message
  // and its reply tree intact so children aren't orphaned
  softDeleteMessage(messageId: bigint, replacementContent: string, deletedAt: bigint) {
    const msgKey = k(messageId)
    const chKey = this.findMessageChannel(messageId)
    if (!chKey) return

    const msg = channelStore.data[chKey]?.messages[msgKey]
    if (!msg) return

    setChannelStore('data', chKey, 'messages', msgKey, {
      ...msg,
      content: replacementContent,
      deleted_at: { present: 1, value: deletedAt }
    })

    // Decrement parent's reply_count if this is a reply
    if (msg.parent_id.present === 1 && msg.parent_id.value !== undefined) {
      const parentKey = k(msg.parent_id.value)
      const parent = channelStore.data[chKey]?.messages[parentKey]
      if (parent && parent.reply_count > 0) {
        setChannelStore('data', chKey, 'messages', parentKey, {
          ...parent,
          reply_count: parent.reply_count - 1
        })
      }
    }
  },

  // Remove a channel from the store (for CHANNEL_DELETED broadcast)
  removeChannel(channelId: bigint) {
    setChannels(prev => {
      if (!prev.has(channelId)) return prev
      const newMap = new Map(prev)
      newMap.delete(channelId)
      return newMap
    })

    // Clean up per-channel message data
    const chKey = k(channelId)
    if (channelStore.data[chKey]) {
      setChannelStore(produce(state => {
        delete state.data[chKey]
      }))
    }

    // If the deleted channel is the active one, reset to channel list
    if (activeChannelId() === channelId) {
      setActiveChannelId(null)
      setCurrentView(ViewState.ThreadList)
      setActiveThreadId(null)
    }
  },

  // Toggle focus between sidebar and content
  toggleFocus() {
    setFocusArea(prev => prev === FocusArea.Sidebar ? FocusArea.Content : FocusArea.Sidebar)
  },

  // DM actions
  addDMChannel(dm: DMChannel) {
    setDmChannels(prev => new Map(prev).set(dm.channelId, dm))
  },

  removeDMChannel(channelId: bigint) {
    setDmChannels(prev => {
      const next = new Map(prev)
      next.delete(channelId)
      return next
    })
  },

  markDMParticipantLeft(channelId: bigint) {
    setDmChannels(prev => {
      const existing = prev.get(channelId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(channelId, { ...existing, participantLeft: true })
      return next
    })
  },

  addPendingDMInvite(invite: DMInvite) {
    setPendingDMInvites(prev => new Map(prev).set(invite.channelId, invite))
  },

  removePendingDMInvite(channelId: bigint) {
    setPendingDMInvites(prev => {
      const next = new Map(prev)
      next.delete(channelId)
      return next
    })
  },

  removePendingDMInviteByNickname(nickname: string) {
    setPendingDMInvites(prev => {
      const next = new Map(prev)
      for (const [id, invite] of next) {
        if (invite.fromNickname === nickname) next.delete(id)
      }
      return next
    })
  },

  addOutgoingDMInvite(invite: OutgoingDMInvite) {
    setOutgoingDMInvites(prev => new Map(prev).set(invite.channelId, invite))
  },

  removeOutgoingDMInvite(channelId: bigint) {
    setOutgoingDMInvites(prev => {
      const next = new Map(prev)
      next.delete(channelId)
      return next
    })
  },

  removeOutgoingDMInviteByNickname(nickname: string) {
    setOutgoingDMInvites(prev => {
      const next = new Map(prev)
      for (const [id, invite] of next) {
        if (invite.toNickname === nickname) next.delete(id)
      }
      return next
    })
  },

  setDMChannelKey(channelId: bigint, key: Uint8Array) {
    setDmChannelKeys(prev => new Map(prev).set(channelId, key))
  },

  removeDMChannelKey(channelId: bigint) {
    setDmChannelKeys(prev => {
      const next = new Map(prev)
      next.delete(channelId)
      return next
    })
  },

  updateServerRoster(entry: PresenceEntry, online: boolean) {
    if (online) {
      setServerRoster(prev => new Map(prev).set(entry.sessionId, entry))
    } else {
      setServerRoster(prev => {
        const next = new Map(prev)
        next.delete(entry.sessionId)
        return next
      })
    }
  },

  closeMobilePanels() {
    setMobileSidebarOpen(false)
    setMobileUsersOpen(false)
  },

  toggleMobileSidebar() {
    setMobileUsersOpen(false)
    setMobileSidebarOpen(prev => !prev)
  },

  toggleMobileUsers() {
    setMobileSidebarOpen(false)
    setMobileUsersOpen(prev => !prev)
  },

  clearDMState() {
    setDmChannels(new Map())
    setPendingDMInvites(new Map())
    setOutgoingDMInvites(new Map())
    setDmChannelKeys(new Map())
    setServerRoster(new Map())
    setSelfSessionId(null)
    setActiveDMInvite(null)
    setPendingEncryptionChannelId(null)
    setEncryptionSetupReason('')
  }
}
