'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { createProposal } from '@/lib/actions'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateProposalModal({ open, onClose }: Props) {
  const wallet = useWallet()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [amountMin, setAmountMin] = useState('0')
  const [amountMax, setAmountMax] = useState('')
  const [days, setDays] = useState('')
  const [worker, setWorker] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the worker on open / reset the form on close (render-phase, before paint).
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setWorker(wallet.account ?? '')
    } else {
      setUrl(''); setAmountMin('0'); setAmountMax(''); setDays(''); setWorker('')
      setError(null)
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const minN = parseFloat(amountMin) || 0
    const maxN = parseFloat(amountMax)
    const daysN = parseInt(days, 10)
    if (isNaN(maxN) || maxN <= 0) { setError('Enter a valid maximum amount'); return }
    if (maxN < minN) { setError('Maximum must be ≥ minimum'); return }
    if (isNaN(daysN) || daysN < 5 || daysN > 30) { setError('Duration must be 5–30 days'); return }
    const wif = wallet.keyFor('regular')
    if (!wif) { setError('Regular key required'); return }
    setLoading(true); setError(null)
    try {
      await createProposal(
        wif,
        wallet.account!,
        worker.trim() || wallet.account!,
        url,
        `${minN.toFixed(3)} VIZ`,
        `${maxN.toFixed(3)} VIZ`,
        daysN * 86400
      )
      toast.success('Proposal created')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="New proposal">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cp-url" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
                Details URL <span className="text-acc-red">*</span>
              </label>
              <input id="cp-url" type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://…" required disabled={loading}
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:opacity-50" />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="cp-min" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">Min VIZ</label>
                <input id="cp-min" type="number" min="0" step="0.001" value={amountMin}
                  onChange={e => setAmountMin(e.target.value)} placeholder="0.000" disabled={loading}
                  className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:opacity-50" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="cp-max" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
                  Max VIZ <span className="text-acc-red">*</span>
                </label>
                <input id="cp-max" type="number" min="0.001" step="0.001" value={amountMax}
                  onChange={e => setAmountMax(e.target.value)} placeholder="500.000" required disabled={loading}
                  className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:opacity-50" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cp-days" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
                Duration (days, 5–30) <span className="text-acc-red">*</span>
              </label>
              <input id="cp-days" type="number" min="5" max="30" step="1" value={days}
                onChange={e => setDays(e.target.value)} placeholder="14" required disabled={loading}
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:opacity-50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cp-worker" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">Worker account</label>
              <input id="cp-worker" type="text" value={worker}
                onChange={e => setWorker(e.target.value)} placeholder={wallet.account ?? 'accountname'} disabled={loading}
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:opacity-50" />
            </div>
            <p className="font-prose text-[10px] text-fg-dim">Fee: 1.000 VIZ · Requires regular key</p>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas hover:opacity-90 disabled:opacity-50">
              {loading ? 'Submitting…' : 'Submit proposal'}
            </button>
          </form>
    </ModalShell>
  )
}
