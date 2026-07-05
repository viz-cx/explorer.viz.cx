'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useWallet } from '../lib/wallet'
import { useNotifications } from '../lib/notifications'

export function NotificationBell() {
  const { connected } = useWallet()
  const { unread, items, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  if (!connected) return null

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-fg-muted hover:text-fg"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-canvas p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            <button type="button" onClick={() => void markAllRead()} className="text-xs text-fg-muted hover:text-fg">
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-2 py-4 text-center text-sm text-fg-dim">No notifications yet</li>}
            {items.slice(0, 12).map((n) => (
              <li key={n.id} className={`px-2 py-2 text-sm ${n.read ? 'text-fg-dim' : 'text-fg'}`}>
                <Link href={`/@${n.account}`} onClick={() => setOpen(false)} className="hover:underline">
                  <span className="font-medium">@{n.account}</span> — {n.op_type.replace(/_/g, ' ')}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-2 py-1 text-center text-xs text-acc-blue hover:underline">
            View all
          </Link>
        </div>
      )}
    </div>
  )
}
