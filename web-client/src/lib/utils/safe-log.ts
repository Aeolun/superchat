/** Stringify args safely, converting BigInt to string (mobile browsers crash on BigInt in console.log) */
function safeArgs(args: unknown[]): unknown[] {
  try {
    return args.map(obj =>
      JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
    )
  } catch {
    return args.map(String)
  }
}

export function safeLog(label: string, ...args: unknown[]) {
  console.log(label, ...safeArgs(args))
}

export function safeWarn(label: string, ...args: unknown[]) {
  console.warn(label, ...safeArgs(args))
}

export function safeError(label: string, ...args: unknown[]) {
  console.error(label, ...safeArgs(args))
}
