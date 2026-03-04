import { Component, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { hashPassword } from '../lib/hash-password'
import { safeError } from '../lib/utils/safe-log'

const MIN_PASSWORD_LENGTH = 8

const RegisterModal: Component = () => {
  const [password, setPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')
  const [hashing, setHashing] = createSignal(false)
  const [validationError, setValidationError] = createSignal('')
  let passwordInputRef: HTMLInputElement | undefined

  const isOpen = () => store.activeModal === ModalState.Register

  const canSubmit = createMemo(() => {
    const pw = password()
    const confirm = confirmPassword()
    return pw.length >= MIN_PASSWORD_LENGTH && pw === confirm && !hashing()
  })

  const validate = (): string | null => {
    if (password().length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (password() !== confirmPassword()) {
      return 'Passwords do not match'
    }
    return null
  }

  const handleSubmit = async () => {
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }

    const pw = password()
    const nick = store.nickname
    if (!pw || !nick || hashing()) return

    setHashing(true)
    setValidationError('')
    store.setAuthError('')

    try {
      const hashedPassword = await hashPassword(pw, nick)

      const client = getProtocolBridge().getClient()
      client.sendRegisterUser(hashedPassword)
    } catch (err) {
      store.setAuthError('Password hashing failed')
      safeError('argon2id error:', err)
    } finally {
      setHashing(false)
    }
  }

  const handleCancel = () => {
    setPassword('')
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
      handleCancel()
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  // Focus password input and reset state when modal opens
  createMemo(() => {
    if (isOpen()) {
      setPassword('')
      setConfirmPassword('')
      setValidationError('')
      setHashing(false)
      setTimeout(() => passwordInputRef?.focus(), 50)
    }
  })

  return (
    <Show when={isOpen()}>
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-sm mx-4">
          {/* Header */}
          <div class="p-4 border-b border-base-300">
            <h2 class="text-lg font-bold">Register Nickname</h2>
            <p class="text-sm text-base-content/60 mt-1">
              Register <span class="font-mono font-bold text-primary">{store.nickname}</span> with a password to protect it.
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
                ref={passwordInputRef}
                type="password"
                placeholder="Password (min 8 characters)"
                value={password()}
                onInput={(e) => { setPassword(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full"
                disabled={hashing()}
                autofocus
              />

              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword()}
                onInput={(e) => { setConfirmPassword(e.currentTarget.value); setValidationError('') }}
                class="input input-bordered w-full mt-2"
                disabled={hashing()}
              />

              <div class="flex gap-2 mt-4">
                <button
                  type="button"
                  class="btn btn-ghost flex-1"
                  onClick={handleCancel}
                  disabled={hashing()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary flex-1"
                  disabled={!canSubmit()}
                >
                  <Show when={hashing()} fallback="Register">
                    <span class="loading loading-spinner loading-sm"></span>
                    Registering...
                  </Show>
                </button>
              </div>
            </form>
          </div>

          {/* Footer hint */}
          <div class="p-3 border-t border-base-300">
            <div class="text-xs text-base-content/50 font-mono text-center">
              [Enter] Register · [Esc] Cancel
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default RegisterModal
