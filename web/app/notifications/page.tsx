'use client'
import Link from 'next/link'
import { useNotifications } from '../../lib/notifications'
import { useWallet } from '../../lib/wallet'

export default function NotificationsPage() {
  const { connected } = useWallet()
  const { items, loadMore, markAllRead } = useNotifications()
  if (!connected) return <p className="p-6 text-fg-muted">Connect a wallet to see notifications.</p>
  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Notifications</h1>
        <button type="button" onClick={() => void markAllRead()} className="text-sm text-fg-muted hover:text-fg">
          Mark all read
        </button>
      </div>
      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id} className={`py-3 text-sm ${n.read ? 'text-fg-dim' : 'text-fg'}`}>
            <Link href={`/@${n.account}`} className="hover:underline">
              <span className="font-medium">@{n.account}</span> — {n.op_type.replace(/_/g, ' ')}
            </Link>
            {n.timestamp && <span className="ml-2 text-xs text-fg-dim">{n.timestamp}</span>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void loadMore()} className="mt-4 w-full rounded-md border border-border py-2 text-sm text-fg-muted hover:text-fg">
        Load more
      </button>
    </div>
  )
}
