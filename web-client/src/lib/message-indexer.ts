// Message indexer utilities
// Indexing is now handled by storeActions in app-store.ts (per-channel createStore).
// This file provides utility predicates used elsewhere.

import type { Message } from '../SuperChatCodec'

/**
 * Check if a message is a root message (thread starter)
 */
export function isRootMessage(message: Message): boolean {
  return message.parent_id.present === 0
}

/**
 * Check if a message is a reply
 */
export function isReply(message: Message): boolean {
  return message.parent_id.present === 1
}
