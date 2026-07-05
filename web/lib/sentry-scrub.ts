// Redacts VIZ private keys (WIF) from anything that might slip into a Sentry
// event or breadcrumb. A WIF *is* the wallet, so it must never leave the
// browser. Uncompressed WIFs are 51 base58 chars starting with '5'; the 52-char
// compressed 'K'/'L' form is caught defensively too. Base58 excludes 0 O I l.
const WIF_RE = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g
const REDACTED = '[filtered-key]'

/**
 * Recursively walk an arbitrary value and replace any WIF-like substring in any
 * string it contains. Structure is preserved; only string leaves change.
 */
export function redactWif<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(WIF_RE, REDACTED) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactWif(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = redactWif(v)
    return out as unknown as T
  }
  return value
}
