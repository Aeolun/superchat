import { Component, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { store, storeActions, ModalState } from '../store/app-store'
import { getProtocolBridge } from '../lib/protocol-bridge'
import { hashPassword } from '../lib/hash-password'
import { safeError } from '../lib/utils/safe-log'

const PasswordModal: Component = () => {
  const [password, setPassword] = createSignal('')
  const [hashing, setHashing] = createSignal(false)
  let passwordInputRef: HTMLInputElement | undefined

  const isOpen = () => store.activeModal === ModalState.Password
  const nickname = () => store.nickname

  const handleSubmit = async () => {
    const pw = password()
    const nick = nickname()
    if (!pw || !nick || hashing()) return

    setHashing(true)
    store.setAuthError('')

    try {
      const hashedPassword = await hashPassword(pw, nick)
      sessionStorage.setItem('superchat_auth_hash', hashedPassword)

      const client = getProtocolBridge().getClient()
      client.sendAuthRequest(nick, hashedPassword)
    } catch (err) {
      store.setAuthError('Password hashing failed')
      safeError('argon2id error:', err)
    } finally {
      setHashing(false)
    }
  }

  const handleContinueAnonymous = () => {
    // Just close the modal — user is already connected with the nickname (as anonymous)
    setPassword('')
    setHashing(false)
    store.setAuthError('')
    storeActions.closeModal()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) return

    if (e.key === 'Escape') {
      e.preventDefault()
      handleContinueAnonymous()
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
            <h2 class="text-lg font-bold">Sign In</h2>
            <p class="text-sm text-base-content/60 mt-1">
              The nickname <span class="font-mono font-bold text-primary">{nickname()}</span> is registered. Enter your password to sign in, or continue as anonymous.
            </p>
          </div>

          {/* Body */}
          <div class="p-4">
            <Show when={store.authError}>
              <div class="alert alert-error mb-3 py-2 text-sm">
                {store.authError}
              </div>
            </Show>

            <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
              <input
                ref={passwordInputRef}
                type="password"
                placeholder="Password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class="input input-bordered w-full"
                disabled={hashing()}
                autofocus
              />

              <div class="flex gap-2 mt-4">
                <button
                  type="submit"
                  class="btn btn-primary flex-1"
                  disabled={!password() || hashing()}
                >
                  <Show when={hashing()} fallback="Sign In">
                    <span class="loading loading-spinner loading-sm"></span>
                    Authenticating...
                  </Show>
                </button>
              </div>
            </form>

            <div class="divider text-xs text-base-content/40 my-3">or</div>

            <button
              class="btn btn-ghost btn-sm w-full"
              onClick={handleContinueAnonymous}
              disabled={hashing()}
            >
              Continue as ~{nickname()}
            </button>
          </div>

          {/* Footer hint */}
          <div class="p-3 border-t border-base-300">
            <div class="text-xs text-base-content/50 font-mono text-center">
              [Enter] Sign in · [Esc] Continue anonymous
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}

export default PasswordModal
