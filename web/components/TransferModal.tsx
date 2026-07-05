'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { sendTransfer } from '@/lib/actions'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'form' | 'confirm'

export function TransferModal({ open, onClose }: Props) {
  const wallet = useWallet()
  const toast = useToast()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset transient state on close (render-phase, so it lands before paint).
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) { setTo(''); setAmount(''); setMemo(''); setStep('form'); setError(null) }
  }

  function handleFormSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (!to.trim()) { setError('Recipient required'); return }
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return }
    setError(null)
    setStep('confirm')
  }

  async function handleConfirm() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setLoading(true); setError(null)
    try {
      const formatted = `${parseFloat(amount).toFixed(3)} VIZ`
      await sendTransfer(wif, wallet.account!, to.trim(), formatted, memo || undefined)
      toast.success(`Sent ${formatted} to @${to.trim()}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Transfer">
        {step === 'confirm' ? (
          <div className="flex flex-col gap-4">
            <p className="font-prose text-sm text-fg">
              Send <span className="font-mono text-acc-green">{parseFloat(amount).toFixed(3)} VIZ</span> to{' '}
              <span className="font-mono text-fg">@{to}</span>?
            </p>
            {memo && <p className="font-prose text-xs text-fg-muted">Memo: {memo}</p>}
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setStep('form')}
                className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="transfer-to" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">To</label>
              <input
                id="transfer-to"
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="account name"
                required
                autoComplete="off"
                className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="transfer-amount" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">Amount (VIZ)</label>
              <input
                id="transfer-amount"
                type="number"
                min="0.001"
                step="0.001"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="10.000"
                required
                className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="transfer-memo" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">Memo (optional)</label>
              <input
                id="transfer-memo"
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="leave empty to skip"
                className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
              />
            </div>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <button
              type="submit"
              className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas hover:opacity-90"
            >
              Review
            </button>
          </form>
        )}
    </ModalShell>
  )
}
