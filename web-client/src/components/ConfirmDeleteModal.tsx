// ABOUTME: Confirmation dialog for deleting messages
// ABOUTME: Self-contained modal that reads from store and sends delete via protocol bridge

import { Component, Show, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'

const ConfirmDeleteModal: Component = () => {
  const isOpen = () => store.activeModal === ModalState.ConfirmDelete

  const handleConfirm = () => {
    const messageId = store.confirmDeleteMessageId
    if (!messageId) return

    const client = getProtocolBridge().getClient()
    client.deleteMessage(messageId)
    store.setConfirmDeleteMessageId(null)
    storeActions.closeModal()
  }

  const handleCancel = () => {
    store.setConfirmDeleteMessageId(null)
    storeActions.closeModal()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) return

    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-sm mx-4">
          {/* Header */}
          <div class="p-4 border-b border-base-300">
            <h2 class="text-lg font-bold">Delete Message</h2>
            <p class="text-sm text-base-content/60 mt-1">
              Are you sure you want to delete this message? This cannot be undone.
            </p>
          </div>

          {/* Actions */}
          <div class="p-4 flex gap-2">
            <button
              class="btn btn-ghost flex-1"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              class="btn btn-error flex-1"
              onClick={handleConfirm}
            >
              Delete
            </button>
          </div>

          {/* Footer hint */}
          <div class="p-3 border-t border-base-300">
            <div class="text-xs text-base-content/50 font-mono text-center">
              [Enter] Delete · [Esc] Cancel
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default ConfirmDeleteModal
