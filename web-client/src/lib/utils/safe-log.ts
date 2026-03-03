/** JSON.stringify replacer that converts BigInt to string (mobile browsers crash on BigInt in console.log) */
export function safeLog(label: string, ...args: unknown[]) {
  try {
    const safe = args.map(obj =>
      JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
    )
    console.log(label, ...safe)
  } catch {
    console.log(label, ...args.map(String))
  }
}
