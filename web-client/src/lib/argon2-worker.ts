import { argon2id } from './argon2'

export interface Argon2Request {
  password: Uint8Array
  salt: Uint8Array
  t: number
  m: number
  p: number
  dkLen: number
}

export interface Argon2Response {
  hash?: Uint8Array
  error?: string
}

self.onmessage = (e: MessageEvent<Argon2Request>) => {
  try {
    const { password, salt, t, m, p, dkLen } = e.data
    const hash = argon2id(password, salt, { t, m, p, dkLen })
    self.postMessage({ hash } satisfies Argon2Response, { transfer: [hash.buffer] })
  } catch (err) {
    self.postMessage({ error: String(err) } satisfies Argon2Response)
  }
}
