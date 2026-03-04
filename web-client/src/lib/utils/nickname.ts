import type { Message } from '../../SuperChatCodec'
import { store } from '../../store/app-store'

/** Check if a message was authored by the currently logged-in user */
export function isOwnMessage(message: Message): boolean {
  const myUserId = store.userId
  if (myUserId === null) return false
  if (message.author_user_id.present !== 1 || message.author_user_id.value === undefined) return false
  return message.author_user_id.value === myUserId
}
