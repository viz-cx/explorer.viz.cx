'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { delegateShares } from '@/lib/actions'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
}

export function DelegateModal({ open, onClose }: Props) {
  const wallet = useWallet()
  const toast = useToast()
  const [delegatee, setDelegatee] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset transient state on close (render-phase, so it lands before paint).
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) { setDelegatee(''); setAmount(''); setError(null) }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = parseFloat(amount) || 0
    if (!delegatee.trim()) { setError('Enter a delegatee account name'); return }
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setLoading(true); setError(null)
    try {
      await delegateShares(wif, wallet.account!, delegatee.trim(), `${n.toFixed(6)} SHARES`)
      toast.success(`Delegated ${n.toFixed(6)} SHARES to @${delegatee.trim()}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  const n = parseFloat(amount) || 0
  const isUndelegate = n === 0

  return (
    <ModalShell open={open} onClose={onClose} title="Delegate SHARES">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="delegate-delegatee" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">Delegatee account</label>
              <input
                id="delegate-delegatee"
                type="text"
                value={delegatee}
                onChange={e => setDelegatee(e.target.value)}
                placeholder="accountname"
                required
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="delegate-amount" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">SHARES to delegate</label>
              <input
                id="delegate-amount"
                type="number"
                min="0"
                step="0.000001"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.000000"
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
              <p className="font-prose text-[10px] text-fg-dim">Enter 0 to remove delegation.</p>
            </div>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Processing…' : isUndelegate ? 'Remove delegation' : `Delegate ${n.toFixed(6)} SHARES`}
            </button>
          </form>
    </ModalShell>
  )
}
