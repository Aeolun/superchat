import { Component, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { hashPassword } from '../lib/hash-password'
import { safeError } from '../lib/utils/safe-log'

const MIN_PASSWORD_LENGTH = 8

const ChangePasswordModal: Component = () => {
  const [currentPassword, setCurrentPassword] = createSignal('')
  const [newPassword, setNewPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')
  const [hashing, setHashing] = createSignal(false)
  const [validationError, setValidationError] = createSignal('')
  let currentPasswordRef: HTMLInputElement | undefined

  const isOpen = () => store.activeModal === ModalState.ChangePassword

  const validate = (): string | null => {
    if (currentPassword().length === 0) {
      return 'Current password is required'
    }
    if (newPassword().length < MIN_PASSWORD_LENGTH) {
      return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (newPassword() !== confirmPassword()) {
      return 'New passwords do not match'
    }
    return null
  }

  const canSubmit = createMemo(() => {
    return currentPassword().length > 0 &&
           newPassword().length >= MIN_PASSWORD_LENGTH &&
           newPassword() === confirmPassword() &&
           !hashing()
  })

  const handleSubmit = async () => {
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }

    const nick = store.nickname
    if (!nick || hashing()) return

    setHashing(true)
    setValidationError('')
    store.setAuthError('')

    try {
      const oldHash = await hashPassword(currentPassword(), nick)
      const newHash = await hashPassword(newPassword(), nick)

      const client = getProtocolBridge().getClient()
      client.sendChangePassword(oldHash, newHash)
    } catch (err) {
      store.setAuthError('Password hashing failed')
      safeError('argon2id error:', err)
    } finally {
      setHashing(false)
    }
  }

  const handleClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setValidationError('')
    setHashing(false)
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

  // Focus input and reset state when modal opens
  createMemo(() => {
    if (isOpen()) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setValidationError('')
      setHashing(false)
      setTimeout(() => currentPasswordRef?.focus(), 50)
    }
  })

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-sm mx-4">
          {/* Header */}
          <div class="p-4 border-b border-base-300">
            <h2 class="text-lg font-bold">Change Password</h2>
            <p class="text-sm text-base-content/60 mt-1">
              Change password for <span class="font-mono font-bold text-primary">{store.nickname}</span>
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
                ref={currentPasswordRef}
                type="password"
                placeholder="Current password"
                value={currentPassword()}
                onInput={(e) => { setCurrentPassword(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full"
                disabled={hashing()}
                autofocus
              />

              <input
                type="password"
                placeholder="New password (min 8 characters)"
                value={newPassword()}
                onInput={(e) => { setNewPassword(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full mt-2"
                disabled={hashing()}
              />

              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword()}
                onInput={(e) => { setConfirmPassword(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full mt-2"
                disabled={hashing()}
              />

              <div class="flex gap-2 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost flex-1"
                  onClick={handleClose}
                  disabled={hashing()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary flex-1"
                  disabled={!canSubmit()}
                >
                  <Show when={hashing()} fallback="Change Password">
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

export default ChangePasswordModal
