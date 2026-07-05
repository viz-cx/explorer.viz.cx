import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WatchToggle } from './WatchToggle'

const watch = vi.fn()
vi.mock('../lib/wallet', () => ({ useWallet: () => ({ connected: true }) }))
vi.mock('../lib/notifications', () => ({
  useNotifications: () => ({ watching: (a: string) => a === 'watched-acct', watch, unwatch: vi.fn() }),
}))

describe('WatchToggle', () => {
  it('shows Watch when not watching', () => {
    const html = renderToStaticMarkup(<WatchToggle account="other" />)
    expect(html.toLowerCase()).toContain('watch')
  })
  it('shows Watching when already watched', () => {
    const html = renderToStaticMarkup(<WatchToggle account="watched-acct" />)
    expect(html.toLowerCase()).toContain('watching')
  })
})
