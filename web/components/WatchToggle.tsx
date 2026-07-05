'use client'
import { useWallet } from '../lib/wallet'
import { useNotifications } from '../lib/notifications'

export function WatchToggle({ account }: { account: string }) {
  const { connected } = useWallet()
  const { watching, watch, unwatch } = useNotifications()
  if (!connected) return null
  const on = watching(account)
  return (
    <button
      type="button"
      onClick={() => (on ? void unwatch(account) : void watch(account))}
      className={`rounded-md border px-3 py-1 text-sm ${on ? 'border-acc-blue text-acc-blue' : 'border-border text-fg-muted hover:text-fg'}`}
    >
      {on ? '★ Watching' : '☆ Watch'}
    </button>
  )
}
