// ABOUTME: CommandExecutor implementation for GUI client
// ABOUTME: Implements shared command system interface
package ui

import (
	"log"
	"os"

	"github.com/aeolun/superchat/pkg/client/commands"
)

// Verify App implements CommandExecutor interface
var _ commands.CommandExecutor = (*App)(nil)

// === State Queries (CommandExecutor interface) ===

func (a *App) GetCurrentView() commands.ViewID {
	return a.mainView
}

func (a *App) GetActiveModal() commands.ModalType {
	if a.composeModal != nil {
		return commands.ModalCompose
	}
	return commands.ModalNone
}

func (a *App) HasSelectedMessage() bool {
	// True if we're in thread view with messages and a valid focus index
	if a.mainView != commands.ViewThreadView || a.currentThread == nil {
		return false
	}
	totalMessages := 1 + len(a.threadReplies) // root + replies
	return a.replyFocusIndex >= 0 && a.replyFocusIndex < totalMessages
}

func (a *App) HasSelectedChannel() bool {
	return a.selectedChannel != nil
}

func (a *App) HasSelectedThread() bool {
	return len(a.threads) > 0
}

func (a *App) GetSelectedMessageIndex() int {
	// TODO: Add message selection tracking in GUI
	return -1
}

func (a *App) IsComposing() bool {
	return a.composeModal != nil
}

func (a *App) HasComposeContent() bool {
	if !a.IsComposing() {
		return false
	}
	return len(a.composeModal.editor.Text()) > 0
}

func (a *App) IsAdmin() bool {
	// TODO: Track user flags in GUI client
	return false
}

func (a *App) IsRegisteredUser() bool {
	// TODO: Track auth state in GUI client
	return false
}

func (a *App) IsConnected() bool {
	return a.conn.IsConnected()
}

func (a *App) HasThreads() bool {
	return len(a.threads) > 0
}

func (a *App) HasChannels() bool {
	return len(a.channels) > 0
}

func (a *App) CanGoBack() bool {
	// Can go back if not in channel list view
	return a.mainView != commands.ViewChannelList
}

// === Action Execution ===

// ExecuteAction performs the given action
func (a *App) ExecuteAction(actionID string) error {
	log.Printf("[COMMAND] Executing action: %s (view=%s, modal=%s)",
		actionID, a.GetCurrentView(), a.GetActiveModal())

	defer func() {
		// Always invalidate window after action
		if a.window != nil {
			a.window.Invalidate()
		}
	}()

	switch actionID {
	// === Global Actions ===
	case commands.ActionHelp:
		// TODO: Implement help modal in GUI
		return nil

	case commands.ActionQuit:
		// Quit the application
		// In Gio, the cleanest way is to call os.Exit
		// This will trigger cleanup via defer statements in main()
		os.Exit(0)
		return nil

	case commands.ActionServerList:
		// TODO: Implement server selector in GUI
		return nil

	// === Navigation Actions ===
	case commands.ActionNavigateUp:
		switch a.mainView {
		case commands.ViewChannelList:
			if a.channelFocusIndex > 0 {
				a.channelFocusIndex--
			}
		case commands.ViewThreadList:
			if a.threadFocusIndex > 0 {
				a.threadFocusIndex--
			}
		case commands.ViewThreadView:
			if a.replyFocusIndex > 0 {
				a.replyFocusIndex--
			}
		}

	case commands.ActionNavigateDown:
		switch a.mainView {
		case commands.ViewChannelList:
			if a.channelFocusIndex < len(a.channels)-1 {
				a.channelFocusIndex++
			}
		case commands.ViewThreadList:
			if a.threadFocusIndex < len(a.threads)-1 {
				a.threadFocusIndex++
			}
		case commands.ViewThreadView:
			totalMessages := 1 + len(a.threadReplies) // root + replies
			if a.replyFocusIndex < totalMessages-1 {
				a.replyFocusIndex++
			}
		}

	case commands.ActionSelect:
		switch a.mainView {
		case commands.ViewChannelList:
			if a.channelFocusIndex < len(a.channels) {
				go a.selectChannel(&a.channels[a.channelFocusIndex])
			}
		case commands.ViewThreadList:
			if a.threadFocusIndex < len(a.threads) {
				threadCopy := a.threads[a.threadFocusIndex]
				go a.selectThread(&threadCopy)
			}
		}

	case commands.ActionGoBack:
		a.goBack()

	// === Messaging Actions ===
	case commands.ActionComposeNewThread:
		a.openComposeModal(ComposeModeNewThread, nil)

	case commands.ActionComposeReply:
		// Reply to the currently focused message
		if a.mainView == commands.ViewThreadView && a.currentThread != nil {
			if a.replyFocusIndex == 0 {
				// Replying to root message
				a.openComposeModal(ComposeModeReply, a.currentThread)
			} else if a.replyFocusIndex-1 < len(a.threadReplies) {
				// Replying to a reply
				msgCopy := a.threadReplies[a.replyFocusIndex-1]
				a.openComposeModal(ComposeModeReply, &msgCopy)
			}
		}

	case commands.ActionSendMessage:
		// Send message from compose modal
		if a.composeModal != nil {
			content := a.composeModal.editor.Text()
			if len(content) > 0 {
				var parentID *uint64
				if a.composeModal.mode == ComposeModeReply && a.composeModal.replyTo != nil {
					parentID = &a.composeModal.replyTo.ID
				}
				a.sendMessage(content, parentID)
				a.closeComposeModal()
			}
		}
		return nil

	case commands.ActionEditMessage:
		// TODO: Implement edit in GUI
		return nil

	case commands.ActionDeleteMessage:
		// TODO: Implement delete in GUI
		return nil

	// === Admin Actions ===
	case commands.ActionAdminPanel:
		// TODO: Implement admin panel in GUI
		return nil

	case commands.ActionCreateChannel:
		// TODO: Implement create channel in GUI
		return nil

	default:
		// Unknown action - ignore
	}

	return nil
}

// === Helper methods ===

func (a *App) goBack() {
	// Close modal if open
	if a.composeModal != nil {
		a.closeComposeModal()
		return
	}

	// Otherwise navigate back in views
	switch a.mainView {
	case commands.ViewThreadView:
		a.mainView = commands.ViewThreadList
		a.currentThread = nil
		a.threadReplies = nil
		a.replyFocusIndex = 0
	case commands.ViewThreadList, commands.ViewChatChannel:
		a.mainView = commands.ViewChannelList
		a.selectedChannel = nil
		a.threads = nil
		a.threadFocusIndex = 0
		// TODO: Send leave channel message
	case commands.ViewChannelList:
		// At the top level - quit the application
		os.Exit(0)
	}
}
