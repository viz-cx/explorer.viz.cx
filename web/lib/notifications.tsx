'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef,
  type ReactNode,
} from 'react'
import { keys } from '@viz-cx/core'
import { API_BASE } from './config'
import { useWallet } from './wallet'
import { useToast } from './toast'

export interface NotifItem {
  id: string
  account: string
  op_type: string
  body: Record<string, unknown>
  timestamp: string
  read: boolean
}

export interface NotifState {
  unread: number
  items: NotifItem[]
  watched: string[]
}

export const initialNotifState: NotifState = { unread: 0, items: [], watched: [] }

type Action =
  | { type: 'setCount'; unread: number }
  | { type: 'setItems'; items: NotifItem[] }
  | { type: 'appendItems'; items: NotifItem[] }
  | { type: 'markAllRead' }
  | { type: 'setWatched'; watched: string[] }

export function notificationsReducer(state: NotifState, action: Action): NotifState {
  switch (action.type) {
    case 'setCount':
      return { ...state, unread: action.unread }
    case 'setItems':
      return { ...state, items: action.items }
    case 'appendItems': {
      const seen = new Set(state.items.map((i) => i.id))
      return { ...state, items: [...state.items, ...action.items.filter((i) => !seen.has(i.id))] }
    }
    case 'markAllRead':
      return { ...state, unread: 0, items: state.items.map((i) => ({ ...i, read: true })) }
    case 'setWatched':
      return { ...state, watched: action.watched }
    default:
      return state
  }
}

interface NotificationsApi {
  unread: number
  items: NotifItem[]
  watched: string[]
  watching(account: string): boolean
  watch(account: string): Promise<void>
  unwatch(account: string): Promise<void>
  refresh(): Promise<void>
  loadMore(): Promise<void>
  markAllRead(): Promise<void>
}

const Ctx = createContext<NotificationsApi | null>(null)

export function useNotifications(): NotificationsApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider')
  return ctx
}

const POLL_MS = 45_000
const TOKEN_KEY = 'viz-notif-token'

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { account, connected, keyFor } = useWallet()
  const toast = useToast()
  const [state, dispatch] = useReducer(notificationsReducer, initialNotifState)
  const tokenRef = useRef<string | null>(null)

  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current) return tokenRef.current
    const cached = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null
    if (cached) { tokenRef.current = cached; return cached }
    if (!account) return null
    const wif = keyFor('regular')
    if (!wif) return null
    const { nonce } = await fetch(`${API_BASE}/auth/nonce`, { method: 'POST' }).then((r) => r.json())
    const sig = keys.sign(new TextEncoder().encode(nonce), wif)
    const res = await fetch(`${API_BASE}/session`, {
      method: 'POST',
      headers: { 'X-Auth-Account': account, 'X-Auth-Nonce': nonce, 'X-Auth-Signature': sig },
    })
    if (!res.ok) return null
    const { token } = await res.json()
    tokenRef.current = token
    if (typeof window !== 'undefined') sessionStorage.setItem(TOKEN_KEY, token)
    return token
  }, [account, keyFor])

  const authed = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response | null> => {
      let token = await getToken()
      if (!token) return null
      const call = (t: string) =>
        fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } })
      let res = await call(token)
      if (res.status === 401) {
        tokenRef.current = null
        if (typeof window !== 'undefined') sessionStorage.removeItem(TOKEN_KEY)
        token = await getToken()
        if (!token) return null
        res = await call(token)
      }
      return res
    },
    [getToken],
  )

  const refresh = useCallback(async () => {
    const cRes = await authed('/notifications/count')
    if (cRes?.ok) dispatch({ type: 'setCount', unread: (await cRes.json()).unread })
    const lRes = await authed('/notifications?limit=20')
    if (lRes?.ok) dispatch({ type: 'setItems', items: (await lRes.json()).notifications })
    const wRes = await authed('/watchlist')
    if (wRes?.ok) dispatch({ type: 'setWatched', watched: (await wRes.json()).accounts })
  }, [authed])

  const loadMore = useCallback(async () => {
    const last = state.items[state.items.length - 1]
    const res = await authed(`/notifications?limit=20${last ? `&before=${last.id}` : ''}`)
    if (res?.ok) dispatch({ type: 'appendItems', items: (await res.json()).notifications })
  }, [authed, state.items])

  const markAllRead = useCallback(async () => {
    const res = await authed('/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    if (res?.ok) dispatch({ type: 'markAllRead' })
  }, [authed])

  const watch = useCallback(async (acct: string) => {
    const res = await authed('/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: acct }),
    })
    if (res?.ok) { dispatch({ type: 'setWatched', watched: [...state.watched, acct] }); toast.success(`Watching @${acct}`) }
    else toast.error('Could not update watchlist')
  }, [authed, state.watched, toast])

  const unwatch = useCallback(async (acct: string) => {
    const res = await authed(`/watchlist/${encodeURIComponent(acct)}`, { method: 'DELETE' })
    if (res?.ok) { dispatch({ type: 'setWatched', watched: state.watched.filter((a) => a !== acct) }); toast.success(`Unwatched @${acct}`) }
    else toast.error('Could not update watchlist')
  }, [authed, state.watched, toast])

  useEffect(() => {
    if (!connected) return
    // Only poll while the tab is visible — a backgrounded tab has no UI to
    // update, so polling it just wastes requests and battery. On return to the
    // foreground we refresh once immediately to catch up, then resume the timer.
    let id: ReturnType<typeof setInterval> | undefined
    const start = () => { id ??= setInterval(() => { void refresh() }, POLL_MS) }
    const stop = () => { if (id !== undefined) { clearInterval(id); id = undefined } }
    const onVisibility = () => {
      if (document.hidden) { stop() }
      else { void refresh(); start() }
    }
    void refresh()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [connected, refresh])

  useEffect(() => {
    if (!connected) {
      // Revoke the session server-side on disconnect so a leaked token can't
      // outlive the wallet session (fire-and-forget; logout is idempotent).
      const token = tokenRef.current ?? (typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null)
      if (token) {
        void fetch(`${API_BASE}/session`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
      }
      tokenRef.current = null
      if (typeof window !== 'undefined') sessionStorage.removeItem(TOKEN_KEY)
    }
  }, [connected])

  const value = useMemo<NotificationsApi>(() => ({
    unread: state.unread,
    items: state.items,
    watched: state.watched,
    watching: (a) => state.watched.includes(a),
    watch, unwatch, refresh, loadMore, markAllRead,
  }), [state, watch, unwatch, refresh, loadMore, markAllRead])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
