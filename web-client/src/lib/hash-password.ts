import type { Argon2Request, Argon2Response } from './argon2-worker'

// Argon2id parameters (must match Go server: pkg/client/auth/password.go)
const ARGON_TIME = 3
const ARGON_MEMORY = 64 * 1024  // 64 MB in KB
const ARGON_PARALLELISM = 4
const ARGON_KEY_LEN = 32

/** Base64 URL-safe encoding without padding (matches Go's base64.RawURLEncoding) */
function base64RawURLEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./argon2-worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

/** Hash password with argon2id in a Web Worker (non-blocking). Uses nickname as salt. */
export function hashPassword(password: string, nickname: string): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password)
  const saltBytes = new TextEncoder().encode(nickname)

  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e: MessageEvent<Argon2Response>) => {
      w.removeEventListener('message', handler)
      w.removeEventListener('error', errorHandler)
      if (e.data.error) {
        reject(new Error(e.data.error))
      } else {
        resolve(base64RawURLEncode(e.data.hash!))
      }
    }

    const errorHandler = (e: ErrorEvent) => {
      w.removeEventListener('message', handler)
      w.removeEventListener('error', errorHandler)
      reject(new Error(e.message || 'Worker error'))
    }

    w.addEventListener('message', handler)
    w.addEventListener('error', errorHandler)

    const request: Argon2Request = {
      password: passwordBytes,
      salt: saltBytes,
      t: ARGON_TIME,
      m: ARGON_MEMORY,
      p: ARGON_PARALLELISM,
      dkLen: ARGON_KEY_LEN,
    }
    w.postMessage(request, { transfer: [passwordBytes.buffer, saltBytes.buffer] })
  })
}
