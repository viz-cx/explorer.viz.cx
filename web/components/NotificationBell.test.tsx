import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotificationBell } from './NotificationBell'

vi.mock('../lib/wallet', () => ({ useWallet: () => ({ connected: true }) }))
vi.mock('../lib/notifications', () => ({
  useNotifications: () => ({
    unread: 3, items: [], watched: [],
    markAllRead: vi.fn(), loadMore: vi.fn(), refresh: vi.fn(),
    watching: () => false, watch: vi.fn(), unwatch: vi.fn(),
  }),
}))

describe('NotificationBell', () => {
  it('shows the unread badge count', () => {
    const html = renderToStaticMarkup(<NotificationBell />)
    expect(html).toContain('3')
  })
})
