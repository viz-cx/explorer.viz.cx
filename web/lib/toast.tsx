'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo,
  useReducer, useRef, useSyncExternalStore, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ToastKind = 'success' | 'error'
export interface Toast { id: number; kind: ToastKind; message: string }

export const TOAST_DURATION: Record<ToastKind, number> = { success: 4000, error: 7000 }
export const MAX_TOASTS = 4

type Action = { type: 'add'; toast: Toast } | { type: 'remove'; id: number }

export function toastReducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'add': {
      const next = [...state, action.toast]
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
    }
    case 'remove':
      return state.filter(t => t.id !== action.id)
    default:
      return state
  }
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id)
    if (t) { clearTimeout(t); timersRef.current.delete(id) }
    dispatch({ type: 'remove', id })
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current
    dispatch({ type: 'add', toast: { id, kind, message } })
    timersRef.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION[kind]))
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    dismiss,
  }), [push, dismiss])

  useEffect(() => {
    const timers = timersRef.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const subscribeNoop = () => () => {}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  // Render only after hydration so the portal target (document.body) exists.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)
  if (!mounted) return null

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface p-3 shadow-xl ${
            t.kind === 'success' ? 'border-l-2 border-l-acc-green' : 'border-l-2 border-l-acc-red'
          }`}
        >
          <span className={`font-mono text-sm ${t.kind === 'success' ? 'text-acc-green' : 'text-acc-red'}`}>
            {t.kind === 'success' ? '✓' : '✕'}
          </span>
          <p className="flex-1 font-prose text-sm text-fg">{t.message}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-lg leading-none text-fg-dim hover:text-fg"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
