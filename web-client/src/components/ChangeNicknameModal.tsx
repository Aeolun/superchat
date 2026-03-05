import { Component, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'

const MIN_NICKNAME_LENGTH = 3
const MAX_NICKNAME_LENGTH = 20
const NICKNAME_PATTERN = /^[a-zA-Z0-9_-]+$/

const ChangeNicknameModal: Component = () => {
  const [nickname, setNickname] = createSignal('')
  const [validationError, setValidationError] = createSignal('')
  const [waiting, setWaiting] = createSignal(false)
  let inputRef: HTMLInputElement | undefined

  const isOpen = () => store.activeModal === ModalState.ChangeNickname

  const validate = (): string | null => {
    const nick = nickname().trim()
    if (nick.length < MIN_NICKNAME_LENGTH) {
      return `Nickname must be at least ${MIN_NICKNAME_LENGTH} characters`
    }
    if (nick.length > MAX_NICKNAME_LENGTH) {
      return `Nickname must be at most ${MAX_NICKNAME_LENGTH} characters`
    }
    if (!NICKNAME_PATTERN.test(nick)) {
      return 'Nickname can only contain letters, numbers, hyphens, and underscores'
    }
    if (nick === store.nickname) {
      return 'That is already your nickname'
    }
    return null
  }

  const canSubmit = createMemo(() => {
    const nick = nickname().trim()
    return nick.length >= MIN_NICKNAME_LENGTH &&
           nick.length <= MAX_NICKNAME_LENGTH &&
           NICKNAME_PATTERN.test(nick) &&
           nick !== store.nickname &&
           !waiting()
  })

  const handleSubmit = () => {
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }

    if (waiting()) return

    const newNick = nickname().trim()
    setWaiting(true)
    setValidationError('')
    store.setAuthError('')
    store.setPendingNicknameChange(newNick)

    const client = getProtocolBridge().getClient()
    client.sendSetNickname(newNick)
    // Modal stays open — protocol bridge closes it on NICKNAME_RESPONSE success
    // On failure, the error event will set store.errorMessage
  }

  const handleClose = () => {
    setNickname('')
    setValidationError('')
    setWaiting(false)
    store.setAuthError('')
    storeActions.closeModal()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) return

    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  // Focus input and pre-fill when modal opens
  createMemo(() => {
    if (isOpen()) {
      setNickname(store.nickname)
      setValidationError('')
      setWaiting(false)
      setTimeout(() => {
        inputRef?.focus()
        inputRef?.select()
      }, 50)
    }
  })

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-sm mx-4">
          {/* Header */}
          <div class="p-4 border-b border-base-300">
            <h2 class="text-lg font-bold">Change Nickname</h2>
            <p class="text-sm text-base-content/60 mt-1">
              Currently <span class="font-mono font-bold text-primary">{store.nickname}</span>
            </p>
          </div>

          {/* Body */}
          <div class="p-4">
            <Show when={store.authError}>
              <div class="alert alert-error mb-3 py-2 text-sm">
                {store.authError}
              </div>
            </Show>

            <Show when={validationError()}>
              <div class="alert alert-warning mb-3 py-2 text-sm">
                {validationError()}
              </div>
            </Show>

            <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="New nickname"
                value={nickname()}
                onInput={(e) => { setNickname(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full"
                maxLength={MAX_NICKNAME_LENGTH}
                disabled={waiting()}
                autofocus
              />

              <div class="flex gap-2 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost flex-1"
                  onClick={handleClose}
                  disabled={waiting()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary flex-1"
                  disabled={!canSubmit()}
                >
                  <Show when={waiting()} fallback="Change">
                    <span class="loading loading-spinner loading-sm"></span>
                    Changing...
                  </Show>
                </button>
              </div>
            </form>
          </div>

          {/* Footer hint */}
          <div class="p-3 border-t border-base-300">
            <div class="text-xs text-base-content/50 font-mono text-center">
              [Enter] Change · [Esc] Cancel
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default ChangeNicknameModal
