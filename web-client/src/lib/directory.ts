// Standalone directory server fetch utility
// Opens a temporary WebSocket, sends LIST_SERVERS (0x55), parses SERVER_LIST (0x9B) response

import {
  FrameHeaderEncoder,
  FrameHeaderDecoder,
  ListServersEncoder,
  ServerListDecoder,
  type ServerInfo,
} from '../SuperChatCodec'
import { safeError } from './utils/safe-log'

const MSG_LIST_SERVERS = 0x55
const MSG_SERVER_LIST = 0x9B
const DIRECTORY_TIMEOUT_MS = 5000

/**
 * Fetch the live server list from a directory server via WebSocket.
 * Returns [] on any error (timeout, connection failure, decode error).
 */
export async function fetchDirectoryServers(wsUrl: string): Promise<ServerInfo[]> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        ws = null
      }
    }

    const finish = (result: ServerInfo[]) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    // Timeout
    timer = setTimeout(() => finish([]), DIRECTORY_TIMEOUT_MS)

    try {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        // Send LIST_SERVERS with limit=100
        const encoder = new ListServersEncoder()
        const payload = encoder.encode({ limit: 100 })

        const headerEncoder = new FrameHeaderEncoder()
        const header = headerEncoder.encode({
          length: 3 + payload.length, // version(1) + type(1) + flags(1) + payload
          version: 1,
          type: MSG_LIST_SERVERS,
          flags: 0
        })

        const frame = new Uint8Array(header.length + payload.length)
        frame.set(header, 0)
        frame.set(payload, header.length)
        ws!.send(frame)
      }

      // Frame reassembly state
      let frameBuffer = new Uint8Array(0)
      let expectedFrameLength: number | null = null

      ws.onmessage = (event) => {
        const fragment = new Uint8Array(event.data)

        // Append to buffer
        const newBuffer = new Uint8Array(frameBuffer.length + fragment.length)
        newBuffer.set(frameBuffer, 0)
        newBuffer.set(fragment, frameBuffer.length)
        frameBuffer = newBuffer

        // Try to extract complete frames
        while (true) {
          if (expectedFrameLength === null && frameBuffer.length >= 4) {
            const view = new DataView(frameBuffer.buffer, frameBuffer.byteOffset, 4)
            expectedFrameLength = view.getUint32(0, false)
          }

          if (expectedFrameLength !== null) {
            const totalSize = 4 + expectedFrameLength
            if (frameBuffer.length >= totalSize) {
              const completeFrame = frameBuffer.slice(0, totalSize)
              frameBuffer = frameBuffer.slice(totalSize)
              expectedFrameLength = null

              // Parse the frame header
              if (completeFrame.length < 7) continue
              const headerDecoder = new FrameHeaderDecoder(completeFrame)
              const header = headerDecoder.decode()

              if (header.type === MSG_SERVER_LIST) {
                try {
                  const payloadSlice = completeFrame.slice(7)
                  const payload = new Uint8Array(new ArrayBuffer(payloadSlice.length))
                  payload.set(payloadSlice)
                  const decoder = new ServerListDecoder(payload)
                  const result = decoder.decode()
                  finish(result.servers)
                } catch (e) {
                  safeError('Failed to decode SERVER_LIST:', e)
                  finish([])
                }
                return
              }

              // Ignore other message types (SERVER_CONFIG, etc.) and continue
              continue
            }
          }

          break
        }
      }

      ws.onerror = () => finish([])
      ws.onclose = () => finish([])
    } catch {
      finish([])
    }
  })
}

/**
 * Try fetching directory servers, attempting WSS first then WS fallback.
 */
export async function fetchDirectoryServersWithFallback(
  host: string,
  port: number = 8080
): Promise<ServerInfo[]> {
  // Try WSS first
  const wssResult = await fetchDirectoryServers(`wss://${host}:${port}/ws`)
  if (wssResult.length > 0) return wssResult

  // Fall back to WS
  return fetchDirectoryServers(`ws://${host}:${port}/ws`)
}
