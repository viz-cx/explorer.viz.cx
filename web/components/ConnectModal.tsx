'use client'
import { useState, useEffect } from 'react'
import { keys } from '@viz-cx/core'
import { useWallet, type AccountMatch } from '@/lib/wallet'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'connect' | 'add-key'
}

type Phase = 'input' | 'select'

export function ConnectModal({ open, onClose, mode }: Props) {
  const wallet = useWallet()
  const [account, setAccount] = useState('')
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [matches, setMatches] = useState<AccountMatch[]>([])
  const [needAccount, setNeedAccount] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isWif = keys.isWif(input)
  // In connect mode the account field is hidden until we know we need it:
  // shown once a non-WIF (password) is typed, or after a lookup falls back.
  const showAccountField = mode === 'connect' && (needAccount || (input.length > 0 && !isWif))

  // Clear sensitive + transient state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setAccount('')
      setInput('')
      setPhase('input')
      setMatches([])
      setNeedAccount(false)
      setError(null)
      setSuccess(null)
    }
  }, [open])

  function describeRoles(acc: string, roles: ('regular' | 'active')[], added: boolean): string {
    const ordered = (['active', 'regular'] as const).filter((r) => roles.includes(r))
    const label = ordered.join(' + ')
    if (added) return `Added — ${label} key`
    return `Connected as @${acc} — ${label}`
  }

  async function commit(acc: string) {
    const roles = await wallet.connect(acc, input)
    setSuccess(describeRoles(acc, roles, false))
    setTimeout(onClose, 1500)
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'add-key') {
        const roles = await wallet.addKey(input)
        setSuccess(describeRoles(wallet.account ?? '', roles, true))
        setTimeout(onClose, 1200)
        return
      }

      // connect mode
      if (showAccountField) {
        // Password path (or fallback): account name supplied explicitly.
        await commit(account.trim().toLowerCase())
        return
      }

      // WIF path: reverse-lookup the account(s) holding this key.
      let found: AccountMatch[]
      try {
        found = await wallet.discoverAccounts(input)
      } catch {
        // Lookup unavailable (key-index API down / network hiccup): fall back to manual.
        setNeedAccount(true)
        setError('Automatic lookup unavailable — enter your account name.')
        return
      }

      if (found.length === 0) {
        setNeedAccount(true)
        setError('Key not found in index — enter your account name.')
        return
      } else if (found.length === 1) {
        await commit(found[0].account)
      } else {
        setMatches(found)
        setPhase('select')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(acc: string) {
    setError(null)
    setLoading(true)
    try {
      await commit(acc)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'add-key' ? 'Add key' : 'Connect wallet'

  return (
    <ModalShell open={open} onClose={onClose} title={title}>
      {phase === 'select' ? (
        <div className="flex flex-col gap-3">
          <p className="font-prose text-xs text-fg-dim">
            This key belongs to multiple accounts. Choose one to connect.
          </p>
          <ul className="flex flex-col gap-2">
            {matches.map((m) => (
              <li key={m.account}>
                <button
                  type="button"
                  disabled={loading || success !== null}
                  onClick={() => handleSelect(m.account)}
                  className="flex w-full items-center justify-between rounded border border-border bg-surface-2 px-3 py-2 text-left text-sm text-fg transition-colors hover:border-border-strong disabled:opacity-50"
                >
                  <span className="font-mono">@{m.account}</span>
                  <span className="flex gap-1">
                    {(['active', 'regular'] as const)
                      .filter((r) => m.roles.includes(r))
                      .map((r) => (
                        <span
                          key={r}
                          className="rounded bg-surface px-1.5 py-0.5 font-prose text-[10px] uppercase tracking-widest text-fg-dim"
                        >
                          {r}
                        </span>
                      ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
          {success && <p className="font-prose text-xs text-acc-green">{success}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {showAccountField && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="modal-account"
                className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim"
              >
                Account
              </label>
              <input
                id="modal-account"
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="alice"
                required
                autoComplete="off"
                className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
              <p className="font-prose text-[10px] text-fg-dim">
                Master passwords need your account name.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="modal-key"
              className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim"
            >
              Master password or WIF key
            </label>
            <input
              id="modal-key"
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="password or 5K…"
              required
              autoComplete="new-password"
              className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
            />
            {isWif && <p className="font-mono text-[10px] text-acc-green">WIF detected</p>}
          </div>

          {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
          {success && <p className="font-prose text-xs text-acc-green">{success}</p>}

          <p className="font-prose text-[10px] leading-relaxed text-fg-dim">
            Keys are stored encrypted in this browser only. The encryption key is
            co-located in localStorage — use a dedicated WIF for stronger security.
          </p>

          <button
            type="submit"
            disabled={loading || success !== null}
            className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Connecting…' : mode === 'add-key' ? 'Add key' : 'Connect'}
          </button>
        </form>
      )}
    </ModalShell>
  )
}
