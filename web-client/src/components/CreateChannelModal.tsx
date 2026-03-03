// ABOUTME: Modal for creating a new channel (admin only)
// ABOUTME: Self-contained modal with name, description, type, and retention fields

import { Component, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'

/** Generate URL-safe slug from display name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const CreateChannelModal: Component = () => {
  const [displayName, setDisplayName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [channelType, setChannelType] = createSignal(1) // 1=forum, 0=chat
  const [retentionDays, setRetentionDays] = createSignal(7)
  const [submitting, setSubmitting] = createSignal(false)
  let nameInputRef: HTMLInputElement | undefined

  const isOpen = () => store.activeModal === ModalState.CreateChannel
  const slug = createMemo(() => slugify(displayName()))

  const canSubmit = createMemo(() => {
    return displayName().trim().length > 0 && slug().length > 0 && !submitting()
  })

  const handleSubmit = () => {
    if (!canSubmit()) return

    setSubmitting(true)
    const client = getProtocolBridge().getClient()
    client.createChannel(
      slug(),
      displayName().trim(),
      description().trim() || null,
      channelType(),
      retentionDays() * 24
    )

    // Close immediately — server will broadcast CHANNEL_CREATED which the bridge handles
    handleCancel()
  }

  const handleCancel = () => {
    setDisplayName('')
    setDescription('')
    setChannelType(1)
    setRetentionDays(7)
    setSubmitting(false)
    storeActions.closeModal()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) return

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

  // Focus name input when modal opens
  createMemo(() => {
    if (isOpen()) {
      setDisplayName('')
      setDescription('')
      setChannelType(1)
      setRetentionDays(7)
      setSubmitting(false)
      setTimeout(() => nameInputRef?.focus(), 50)
    }
  })

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-md mx-4">
          {/* Header */}
          <div class="p-4 border-b border-base-300">
            <h2 class="text-lg font-bold">Create Channel</h2>
          </div>

          {/* Body */}
          <div class="p-4">
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
              {/* Display Name */}
              <label class="label">
                <span class="label-text">Display Name</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="e.g. General Discussion"
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
                class="input input-bordered w-full"
                disabled={submitting()}
                autofocus
              />

              {/* Slug preview */}
              <Show when={slug()}>
                <div class="text-xs text-base-content/50 mt-1 font-mono">
                  #{slug()}
                </div>
              </Show>

              {/* Description */}
              <label class="label mt-3">
                <span class="label-text">Description (optional)</span>
              </label>
              <input
                type="text"
                placeholder="What's this channel about?"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                class="input input-bordered w-full"
                disabled={submitting()}
              />

              {/* Channel Type */}
              <label class="label mt-3">
                <span class="label-text">Type</span>
              </label>
              <div class="flex gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channel-type"
                    class="radio radio-sm"
                    checked={channelType() === 1}
                    onChange={() => setChannelType(1)}
                    disabled={submitting()}
                  />
                  <span class="text-sm">Forum (threaded)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channel-type"
                    class="radio radio-sm"
                    checked={channelType() === 0}
                    onChange={() => setChannelType(0)}
                    disabled={submitting()}
                  />
                  <span class="text-sm">Chat (linear)</span>
                </label>
              </div>

              {/* Retention */}
              <label class="label mt-3">
                <span class="label-text">Message Retention (days)</span>
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays()}
                onInput={(e) => setRetentionDays(parseInt(e.currentTarget.value) || 7)}
                class="input input-bordered w-24"
                disabled={submitting()}
              />

              {/* Buttons */}
              <div class="flex gap-2 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost flex-1"
                  onClick={handleCancel}
                  disabled={submitting()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary flex-1"
                  disabled={!canSubmit()}
                >
                  Create
                </button>
              </div>
            </form>
          </div>

          {/* Footer hint */}
          <div class="p-3 border-t border-base-300">
            <div class="text-xs text-base-content/50 font-mono text-center">
              [Enter] Create · [Esc] Cancel
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default CreateChannelModal
