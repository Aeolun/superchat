// Inline SVG Icon Component
// Renders Phosphor icons as inline SVG so they inherit the current text color.
// Only icons imported here are included in the bundle — add new ones as needed.

import { Component } from 'solid-js'

// --- Icon Registry ---
// Import bold SVGs as raw markup strings (Vite ?raw suffix)
import arrowBendUpLeft from '@phosphor-icons/core/bold/arrow-bend-up-left-bold.svg?raw'
import arrowLeft from '@phosphor-icons/core/bold/arrow-left-bold.svg?raw'
import envelope from '@phosphor-icons/core/bold/envelope-simple-bold.svg?raw'
import list from '@phosphor-icons/core/bold/list-bold.svg?raw'
import lock from '@phosphor-icons/core/bold/lock-bold.svg?raw'
import pencil from '@phosphor-icons/core/bold/pencil-simple-bold.svg?raw'
import plus from '@phosphor-icons/core/bold/plus-bold.svg?raw'
import signOut from '@phosphor-icons/core/bold/sign-out-bold.svg?raw'
import trash from '@phosphor-icons/core/bold/trash-bold.svg?raw'
import users from '@phosphor-icons/core/bold/users-bold.svg?raw'
import x from '@phosphor-icons/core/bold/x-bold.svg?raw'

const registry = {
  'arrow-bend-up-left': arrowBendUpLeft,
  'arrow-left': arrowLeft,
  'envelope': envelope,
  'list': list,
  'lock': lock,
  'pencil': pencil,
  'plus': plus,
  'sign-out': signOut,
  'trash': trash,
  'users': users,
  'x': x,
} as const

export type IconName = keyof typeof registry

interface IconProps {
  /** Phosphor icon name — must match a key in the registry above */
  name: IconName
  /** Icon size in pixels (default: 20) */
  size?: number
  /** Additional CSS classes */
  class?: string
}

const Icon: Component<IconProps> = (props) => {
  return (
    <span
      class={`inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full ${props.class || ''}`}
      style={{ width: `${props.size || 20}px`, height: `${props.size || 20}px` }}
      innerHTML={registry[props.name]}
    />
  )
}

export default Icon
