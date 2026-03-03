// Server Selector Component
// Fetches live server list from directory, with status probing and throttling

import { Component, createSignal, For, Show, onMount, onCleanup, createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'
import { fetchDirectoryServersWithFallback } from '../lib/directory'
import type { ServerInfo } from '../SuperChatCodec'

export interface Server {
  name: string
  description: string
  wsUrl: string
  wssUrl: string
  status: 'checking' | 'online' | 'offline'
  isSecure: boolean
  userCount: number
  channelCount: number
  uptimeSeconds: bigint
  isCustom: boolean
}

interface ServerSelectorProps {
  onConnect: (url: string, nickname: string, throttleBps: number) => void
}

const DIRECTORY_HOST = 'superchat.win'
const DIRECTORY_PORT = 8080

const THROTTLE_OPTIONS = [
  { value: 0, label: 'No limit' },
  { value: 1800, label: '14.4k modem' },
  { value: 3600, label: '28.8k modem' },
  { value: 4200, label: '33.6k modem' },
  { value: 7000, label: '56k modem' },
  { value: 16000, label: '128k ISDN' },
  { value: 32000, label: '256k DSL' },
  { value: 64000, label: '512k' },
  { value: 128000, label: '1Mbps' },
]

function formatUptime(seconds: bigint): string {
  const s = Number(seconds)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function serverInfoToServer(info: ServerInfo): Server {
  return {
    name: info.name,
    description: info.description,
    wsUrl: `ws://${info.hostname}:${DIRECTORY_PORT}/ws`,
    wssUrl: `wss://${info.hostname}:${DIRECTORY_PORT}/ws`,
    status: 'checking',
    isSecure: false,
    userCount: info.user_count,
    channelCount: info.channel_count,
    uptimeSeconds: info.uptime_seconds,
    isCustom: false,
  }
}

function makeCustomServer(): Server {
  return {
    name: 'Custom Server',
    description: 'Enter a custom server URL',
    wsUrl: '',
    wssUrl: '',
    status: 'offline',
    isSecure: false,
    userCount: 0,
    channelCount: 0,
    uptimeSeconds: 0n,
    isCustom: true,
  }
}

function makeCurrentHostServer(hostname: string): Server {
  return {
    name: 'Current Server',
    description: hostname,
    wsUrl: `ws://${hostname}:${DIRECTORY_PORT}/ws`,
    wssUrl: `wss://${hostname}:${DIRECTORY_PORT}/ws`,
    status: 'checking',
    isSecure: window.location.protocol === 'https:',
    userCount: 0,
    channelCount: 0,
    uptimeSeconds: 0n,
    isCustom: false,
  }
}

const ServerSelector: Component<ServerSelectorProps> = (props) => {
  const [servers, setServers] = createStore<Server[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(-1)
  const [nickname, setNickname] = createSignal('')
  const [customUrl, setCustomUrl] = createSignal('')
  const [throttleSpeed, setThrottleSpeed] = createSignal(0)
  const [errorMessage, setErrorMessage] = createSignal('')
  const [serverListFocused, setServerListFocused] = createSignal(true)
  const [loading, setLoading] = createSignal(true)

  onMount(() => {
    initializeServers()
    window.addEventListener('keydown', handleKeyDown)
  })

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  // Keyboard navigation handler
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'

    // Let inputs handle their own events, except Escape
    if (isInput) {
      setServerListFocused(false)
      if (e.key === 'Escape') {
        e.preventDefault()
        target.blur()
        setServerListFocused(true)
      }
      return
    }

    // Not in an input, so we're focused on server list
    setServerListFocused(true)

    switch (e.key) {
      case 'ArrowUp':
      case 'k':
        e.preventDefault()
        navigateServers(-1)
        break
      case 'ArrowDown':
      case 'j':
        e.preventDefault()
        navigateServers(1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex() >= 0) {
          handleConnect(e as unknown as Event)
        } else {
          handleServerClick(0)
        }
        break
    }
  }

  const navigateServers = (delta: number) => {
    const serverList = servers
    if (serverList.length === 0) return

    const current = selectedIndex()
    let newIndex: number

    if (current === -1) {
      newIndex = delta > 0 ? 0 : serverList.length - 1
    } else {
      newIndex = current + delta
      if (newIndex < 0) newIndex = serverList.length - 1
      if (newIndex >= serverList.length) newIndex = 0
    }

    handleServerClick(newIndex)
  }

  const initializeServers = async () => {
    const hostname = window.location.hostname || 'localhost'
    loadFromLocalStorage()

    // Fetch live directory
    setLoading(true)
    const directoryServers = await fetchDirectoryServersWithFallback(DIRECTORY_HOST, DIRECTORY_PORT)
    setLoading(false)

    const finalServers: Server[] = []

    if (directoryServers.length > 0) {
      // Got live directory — use it
      const directoryHostnames = new Set(directoryServers.map(s => s.hostname))

      // Add "Current Server" if we're hosting and it's not already in the directory
      const skipHostnames = ['wails', 'wails.localhost', 'localhost', '']
      if (!skipHostnames.includes(hostname) && !directoryHostnames.has(hostname)) {
        finalServers.push(makeCurrentHostServer(hostname))
      }

      // Add all directory servers
      for (const info of directoryServers) {
        finalServers.push(serverInfoToServer(info))
      }
    } else {
      // Directory unreachable — fall back to static list
      const skipHostnames = ['wails', 'wails.localhost', 'localhost', '']
      if (!skipHostnames.includes(hostname)) {
        finalServers.push(makeCurrentHostServer(hostname))
      }

      if (hostname !== DIRECTORY_HOST) {
        finalServers.push({
          name: DIRECTORY_HOST,
          description: 'SuperChat public server',
          wsUrl: `ws://${DIRECTORY_HOST}:${DIRECTORY_PORT}/ws`,
          wssUrl: `wss://${DIRECTORY_HOST}:${DIRECTORY_PORT}/ws`,
          status: 'checking',
          isSecure: false,
          userCount: 0,
          channelCount: 0,
          uptimeSeconds: 0n,
          isCustom: false,
        })
      }
    }

    // Always add Custom Server last
    finalServers.push(makeCustomServer())

    setServers(finalServers)

    // Restore saved server selection if valid
    const savedServerIndex = localStorage.getItem('superchat_server_index')
    if (savedServerIndex !== null) {
      const index = parseInt(savedServerIndex, 10)
      if (index >= 0 && index < finalServers.length) {
        setSelectedIndex(index)

        const savedServerSecure = localStorage.getItem('superchat_server_secure')
        if (savedServerSecure !== null) {
          setServers(index, 'isSecure', savedServerSecure === 'true')
        }

        if (index === finalServers.length - 1) {
          const savedCustomUrl = localStorage.getItem('superchat_custom_url')
          if (savedCustomUrl) setCustomUrl(savedCustomUrl)
        }
      }
    }

    // Auto-select first server if none selected
    if (selectedIndex() === -1 && finalServers.length > 0) {
      handleServerClick(0)
    }

    // Probe online status for non-custom servers
    checkServerStatus()
  }

  const checkServerStatus = async () => {
    const serverList = servers
    for (let i = 0; i < serverList.length; i++) {
      const server = serverList[i]
      if (server.isCustom) continue

      const urlsToTry = [server.wssUrl, server.wsUrl]
      let isOnline = false
      let secureWorks = false

      for (const url of urlsToTry) {
        try {
          const testWs = new WebSocket(url)

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              testWs.close()
              reject(new Error('timeout'))
            }, 3000)

            testWs.onopen = () => {
              clearTimeout(timeout)
              testWs.close()
              resolve(true)
            }

            testWs.onerror = () => {
              clearTimeout(timeout)
              reject(new Error('connection failed'))
            }
          })

          isOnline = true
          secureWorks = url === server.wssUrl
          break
        } catch {
          continue
        }
      }

      setServers(i, {
        status: isOnline ? 'online' : 'offline',
        isSecure: secureWorks
      })
    }
  }

  const loadFromLocalStorage = () => {
    const savedNickname = localStorage.getItem('superchat_nickname')
    if (savedNickname) setNickname(savedNickname)

    const savedThrottle = localStorage.getItem('superchat_throttle_speed')
    if (savedThrottle !== null) setThrottleSpeed(parseInt(savedThrottle, 10))
  }

  const handleServerClick = (index: number) => {
    setSelectedIndex(index)
    const server = servers[index]

    if (!server.isCustom) {
      const url = server.isSecure ? server.wssUrl : server.wsUrl
      setCustomUrl(url)
    } else {
      const savedCustomUrl = localStorage.getItem('superchat_custom_url')
      setCustomUrl(savedCustomUrl || '')
    }
  }

  const toggleSecure = (index: number) => {
    setServers(index, 'isSecure', (prev: boolean) => !prev)

    const server = servers[index]
    if (!server.isCustom) {
      const url = server.isSecure ? server.wssUrl : server.wsUrl
      setCustomUrl(url)
    }
  }

  const handleConnect = (e: Event) => {
    e.preventDefault()

    if (!nickname().trim()) {
      setErrorMessage('Please enter a nickname')
      return
    }

    if (selectedIndex() === -1) {
      setErrorMessage('Please select a server')
      return
    }

    const server = servers[selectedIndex()]
    let finalUrl = ''

    if (server.isCustom) {
      finalUrl = customUrl().trim()
      if (!finalUrl) {
        setErrorMessage('Please enter a server URL')
        return
      }
    } else {
      finalUrl = server.isSecure ? server.wssUrl : server.wsUrl
    }

    // Save to localStorage
    localStorage.setItem('superchat_nickname', nickname())
    localStorage.setItem('superchat_last_url', finalUrl)
    localStorage.setItem('superchat_server_index', selectedIndex().toString())
    localStorage.setItem('superchat_server_secure', server.isSecure.toString())
    localStorage.setItem('superchat_throttle_speed', throttleSpeed().toString())

    if (server.isCustom) {
      localStorage.setItem('superchat_custom_url', customUrl())
    }

    props.onConnect(finalUrl, nickname(), throttleSpeed())
  }

  // Update URL display when server or secure toggle changes
  createEffect(() => {
    const index = selectedIndex()
    if (index >= 0 && index < servers.length) {
      const server = servers[index]
      if (!server.isCustom) {
        const url = server.isSecure ? server.wssUrl : server.wsUrl
        setCustomUrl(url)
      }
    }
  })

  return (
    <div class="fixed inset-0 bg-black/95 flex items-center justify-center p-8 z-50">
      <div class="card bg-base-200 shadow-xl w-full max-w-lg">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-4">Connect to SuperChat</h2>

          {/* Error Display */}
          <Show when={errorMessage()}>
            <div class="alert alert-error mb-4">
              <span>{errorMessage()}</span>
            </div>
          </Show>

          {/* Server List */}
          <fieldset class="fieldset mb-4">
            <legend class="fieldset-legend">Available Servers</legend>
            <div class="space-y-2">
              <Show when={loading()}>
                <div class="flex items-center justify-center p-4 text-base-content/60">
                  <span class="loading loading-spinner loading-sm mr-2"></span>
                  Loading servers...
                </div>
              </Show>
              <Show when={!loading()}>
                <For each={servers}>
                  {(server, index) => (
                    <div
                      onClick={() => handleServerClick(index())}
                      class={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedIndex() === index()
                          ? serverListFocused()
                            ? 'border-primary bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-base-200'
                            : 'border-primary bg-primary/10'
                          : 'border-base-300 hover:border-primary/50 hover:bg-base-300'
                      }`}
                    >
                      <div class="flex items-center">
                        {/* Status Indicator */}
                        <Show when={!server.isCustom}>
                          <div
                            class={`w-3 h-3 rounded-full mr-3 flex-shrink-0 ${
                              server.status === 'online'
                                ? 'bg-success shadow-lg shadow-success/50'
                                : server.status === 'offline'
                                ? 'bg-error'
                                : 'bg-base-content/30 animate-pulse'
                            }`}
                          />
                        </Show>
                        <Show when={server.isCustom}>
                          <div class="w-3 h-3 mr-3 flex-shrink-0" />
                        </Show>

                        {/* Server Info */}
                        <div class="flex-1 min-w-0">
                          <div class="font-semibold">{server.name}</div>
                          <Show when={server.description && !server.isCustom}>
                            <div class="text-xs text-base-content/60">{server.description}</div>
                          </Show>
                          <Show when={!server.isCustom && (server.userCount > 0 || server.channelCount > 0 || server.uptimeSeconds > 0n)}>
                            <div class="text-xs text-base-content/50 mt-0.5">
                              {server.userCount} users
                              {' · '}
                              {server.channelCount} channels
                              <Show when={server.uptimeSeconds > 0n}>
                                {' · '}
                                up {formatUptime(server.uptimeSeconds)}
                              </Show>
                            </div>
                          </Show>
                          <div class="text-xs text-base-content/40 font-mono mt-0.5">
                            {server.isCustom
                              ? 'Enter custom URL below'
                              : server.isSecure ? server.wssUrl : server.wsUrl}
                          </div>
                        </div>

                        {/* WS/WSS Toggle (for non-custom servers) */}
                        <Show when={!server.isCustom}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSecure(index())
                            }}
                            class={`badge badge-sm ml-2 flex-shrink-0 ${
                              server.isSecure ? 'badge-success' : 'badge-warning'
                            }`}
                          >
                            {server.isSecure ? 'WSS' : 'WS'}
                          </button>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </fieldset>

          {/* Connection Form */}
          <form onSubmit={handleConnect}>
            {/* Custom URL - always visible but disabled unless custom server selected */}
            <fieldset class="fieldset mb-4">
              <legend class="fieldset-legend">Server URL</legend>
              <input
                type="text"
                value={customUrl()}
                onInput={(e) => setCustomUrl(e.currentTarget.value)}
                placeholder="ws://localhost:8080/ws or wss://..."
                class={`input w-full ${selectedIndex() >= 0 && !servers[selectedIndex()]?.isCustom ? 'input-disabled opacity-50' : ''}`}
                disabled={selectedIndex() >= 0 && !servers[selectedIndex()]?.isCustom}
              />
            </fieldset>

            {/* Nickname */}
            <fieldset class="fieldset mb-4">
              <legend class="fieldset-legend">Nickname</legend>
              <input
                type="text"
                value={nickname()}
                onInput={(e) => setNickname(e.currentTarget.value)}
                placeholder="Enter your nickname"
                class="input w-full"
                minLength={3}
                maxLength={32}
              />
            </fieldset>

            {/* Throttling */}
            <fieldset class="fieldset mb-6">
              <legend class="fieldset-legend">Connection Speed (optional)</legend>
              <select
                value={throttleSpeed()}
                onChange={(e) => setThrottleSpeed(parseInt(e.currentTarget.value, 10))}
                class="select w-full"
              >
                <For each={THROTTLE_OPTIONS}>
                  {(option) => (
                    <option value={option.value}>{option.label}</option>
                  )}
                </For>
              </select>
            </fieldset>

            {/* Connect Button */}
            <button
              type="submit"
              class="btn btn-primary w-full"
              disabled={!nickname().trim() || selectedIndex() === -1}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.blur()
                  setServerListFocused(true)
                }
              }}
            >
              Connect
            </button>
          </form>

          {/* Keyboard hints footer */}
          <div class="mt-4 pt-3 border-t border-base-300 text-center">
            <span class="text-xs text-base-content/50 font-mono">
              [↑↓/JK] Navigate  [Enter] Select  [Tab] Form fields
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServerSelector
