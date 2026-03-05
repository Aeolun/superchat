// ABOUTME: Central command registry - single source of truth for all keyboard shortcuts
// ABOUTME: Defines shared commands with keys, scope, availability conditions, and priorities

import {
  CommandDefinition,
  CommandScope,
  ViewState,
  ModalState
} from './types'

export const SHARED_COMMANDS: CommandDefinition[] = [
  // === Global Commands ===

  {
    keys: ['h', '?'],
    name: 'Help',
    helpText: 'Show keyboard shortcuts',
    scope: CommandScope.Global,
    modalStates: [ModalState.None], // Only when no modal open
    actionId: 'help',
    priority: 950
  },

  {
    keys: ['q'],
    name: 'Quit',
    helpText: 'Disconnect from server',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'quit',
    isAvailable: (executor) => executor.isConnected(),
    priority: 999
  },

  {
    keys: ['Escape'],
    name: 'Back',
    helpText: 'Go back / Close modal',
    scope: CommandScope.Global,
    actionId: 'go-back',
    isAvailable: (executor) => {
      return executor.getActiveModal() !== ModalState.None || executor.canGoBack()
    },
    priority: 30
  },

  // === Navigation Commands ===

  {
    keys: ['ArrowUp', 'k'],
    name: 'Up',
    helpText: 'Move selection up',
    scope: CommandScope.View,
    viewStates: [ViewState.ChannelList, ViewState.ThreadList, ViewState.ThreadDetail, ViewState.ChatView],
    modalStates: [ModalState.None],
    actionId: 'navigate-up',
    priority: 10
  },

  {
    keys: ['ArrowDown', 'j'],
    name: 'Down',
    helpText: 'Move selection down',
    scope: CommandScope.View,
    viewStates: [ViewState.ChannelList, ViewState.ThreadList, ViewState.ThreadDetail, ViewState.ChatView],
    modalStates: [ModalState.None],
    actionId: 'navigate-down',
    priority: 11
  },

  {
    keys: ['Enter'],
    name: 'Select',
    helpText: 'Select current item',
    scope: CommandScope.View,
    viewStates: [ViewState.ChannelList, ViewState.ThreadList, ViewState.ChatView],
    modalStates: [ModalState.None],
    actionId: 'select',
    priority: 20
  },

  {
    keys: ['Tab'],
    name: 'Switch Focus',
    helpText: 'Switch between sidebar and content',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'switch-focus',
    isAvailable: (executor) => executor.isConnected(),
    priority: 25
  },

  // === Messaging Commands ===

  {
    keys: ['n'],
    name: 'New Thread',
    helpText: 'Compose new thread',
    scope: CommandScope.View,
    viewStates: [ViewState.ThreadList],
    modalStates: [ModalState.None],
    actionId: 'compose-new-thread',
    isAvailable: (executor) => executor.hasSelectedChannel(),
    priority: 100
  },

  {
    keys: ['r'],
    name: 'Reply',
    helpText: 'Reply to selected message',
    scope: CommandScope.View,
    viewStates: [ViewState.ThreadDetail],
    modalStates: [ModalState.None],
    actionId: 'compose-reply',
    isAvailable: (executor) => executor.hasSelectedMessage(),
    priority: 101
  },


  {
    keys: ['Control+Enter', 'Meta+Enter'],
    name: 'Send',
    helpText: 'Send message',
    scope: CommandScope.Modal,
    modalStates: [ModalState.Compose],
    actionId: 'send-message',
    isAvailable: (executor) => executor.hasComposeContent(),
    priority: 1
  },

  {
    keys: ['e'],
    name: 'Edit',
    helpText: 'Edit selected message',
    scope: CommandScope.View,
    viewStates: [ViewState.ThreadDetail],
    modalStates: [ModalState.None],
    actionId: 'edit-message',
    isAvailable: (executor) => executor.hasSelectedOwnMessage(),
    priority: 103
  },

  {
    keys: ['d'],
    name: 'Delete',
    helpText: 'Delete selected message',
    scope: CommandScope.View,
    viewStates: [ViewState.ThreadDetail],
    modalStates: [ModalState.None],
    actionId: 'delete-message',
    isAvailable: (executor) => executor.hasSelectedOwnMessage(),
    priority: 104
  },

  // === Channel Management ===

  {
    keys: ['c'],
    name: 'Create Channel',
    helpText: 'Create a new channel',
    scope: CommandScope.View,
    viewStates: [ViewState.ChannelList],
    modalStates: [ModalState.None],
    actionId: 'create-channel',
    isAvailable: (executor) => executor.isAdmin(),
    priority: 801
  },

  {
    keys: ['s'],
    name: 'Create Subchannel',
    helpText: 'Create a subchannel in selected channel',
    scope: CommandScope.View,
    viewStates: [ViewState.ChannelList],
    modalStates: [ModalState.None],
    actionId: 'create-subchannel',
    isAvailable: (executor) => executor.hasSelectedChannel(),
    priority: 802
  },

  // === DM Commands ===

  {
    keys: ['Control+d', 'Meta+d'],
    name: 'Start DM',
    helpText: 'Start a direct message',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'start-dm',
    isAvailable: (executor) => executor.isConnected(),
    priority: 200
  },

  // === Registration & Identity Commands ===

  {
    keys: ['Control+r', 'Meta+r'],
    name: 'Register',
    helpText: 'Register your nickname',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'register-nickname',
    isAvailable: (executor) => executor.isConnected() && !executor.isRegistered(),
    priority: 201
  },

  {
    keys: ['Control+a', 'Meta+a'],
    name: 'Go Anonymous',
    helpText: 'Switch to anonymous mode',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'go-anonymous',
    isAvailable: (executor) => executor.isConnected() && executor.isRegistered(),
    priority: 202
  },

  {
    keys: ['Control+n', 'Meta+n'],
    name: 'Change Nickname',
    helpText: 'Change your nickname',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'change-nickname',
    isAvailable: (executor) => executor.isConnected(),
    priority: 203
  },

  {
    keys: ['Control+p', 'Meta+p'],
    name: 'Change Password',
    helpText: 'Change your password',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'change-password',
    isAvailable: (executor) => executor.isConnected() && executor.isRegistered(),
    priority: 204
  },

  // === Admin Commands ===

  {
    keys: ['a'],
    name: 'Admin Panel',
    helpText: 'Open admin panel',
    scope: CommandScope.Global,
    modalStates: [ModalState.None],
    actionId: 'admin-panel',
    isAvailable: (executor) => executor.isAdmin(),
    priority: 800
  }
]
