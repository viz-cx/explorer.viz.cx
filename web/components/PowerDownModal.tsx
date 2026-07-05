'use client'
import { useState, useEffect } from 'react'
import { createHttpTransport, createReadApi } from '@viz-cx/core'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { powerDown } from '@/lib/actions'
import { NODE_ENDPOINTS } from '@/lib/config'
import { formatUTC } from '@/lib/format'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'form' | 'confirm'

interface PowerDownStatus {
  rate: string
  nextPayout: string
}

export function PowerDownModal({ open, onClose }: Props) {
  const wallet = useWallet()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [activeStatus, setActiveStatus] = useState<PowerDownStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset on close / flag the status fetch on open (render-phase, before paint).
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setAmount(''); setStep('form'); setError(null); setActiveStatus(null)
    } else if (wallet.account) {
      setLoadingStatus(true)
    }
  }

  useEffect(() => {
    if (!open || !wallet.account) return
    let cancelled = false
    const transport = createHttpTransport(NODE_ENDPOINTS[0])
    const api = createReadApi(transport)
    api.getAccounts([wallet.account])
      .then(([acc]) => {
        if (!acc || cancelled) return
        const rate = acc['vesting_withdraw_rate'] as string | undefined
        const next = acc['next_vesting_withdrawal'] as string | undefined
        if (rate && rate !== '0.000000 SHARES') {
          setActiveStatus({ rate, nextPayout: next ?? '' })
        }
      })
      .catch(() => {/* non-fatal */})
      .finally(() => { if (!cancelled) setLoadingStatus(false) })
    return () => { cancelled = true }
  }, [open, wallet.account])

  async function handleCancel() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setLoading(true); setError(null)
    try {
      await powerDown(wif, wallet.account!, '0.000000 SHARES')
      toast.success('Power-down stopped')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  function handleFormSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return }
    setError(null)
    setStep('confirm')
  }

  async function handleConfirm() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setLoading(true); setError(null)
    try {
      await powerDown(wif, wallet.account!, `${parseFloat(amount).toFixed(6)} SHARES`)
      toast.success('Power-down started')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  const sharesPerWeek = amount ? (parseFloat(amount) / 4).toFixed(6) : null

  return (
    <ModalShell open={open} onClose={onClose} title="Power Down (SHARES → VIZ)">
        <div className="flex flex-col gap-4">
            {loadingStatus && <p className="font-prose text-xs text-fg-dim">Checking status…</p>}

            {activeStatus && (
              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="font-prose text-xs text-fg-muted">
                  Active: <span className="font-mono text-fg">{activeStatus.rate}/week</span>
                </p>
                {activeStatus.nextPayout && (
                  <p className="font-prose text-[10px] text-fg-dim">Next payout: {formatUTC(activeStatus.nextPayout)}</p>
                )}
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="mt-2 rounded border border-acc-red px-3 py-1 font-prose text-xs text-acc-red hover:bg-acc-red/10 disabled:opacity-50"
                >
                  {loading ? 'Cancelling…' : 'Cancel power-down'}
                </button>
              </div>
            )}

            {step === 'confirm' ? (
              <div className="flex flex-col gap-3">
                <p className="font-prose text-sm text-fg">
                  Withdraw <span className="font-mono text-acc-green">{parseFloat(amount).toFixed(6)} SHARES</span> over 28 days?
                </p>
                <p className="font-prose text-xs text-fg-dim">≈ {sharesPerWeek} SHARES / week for 4 weeks</p>
                {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setStep('form')} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Back</button>
                  <button onClick={handleConfirm} disabled={loading} className="flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50">
                    {loading ? 'Processing…' : 'Confirm'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="powerdown-amount" className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">SHARES to withdraw</label>
                  <input
                    id="powerdown-amount"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="1000.000000"
                    required
                    className="rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
                  />
                  {sharesPerWeek && (
                    <p className="font-prose text-[10px] text-fg-dim">≈ {sharesPerWeek} SHARES / week for 4 weeks</p>
                  )}
                </div>
                {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
                <button type="submit" className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas hover:opacity-90">
                  Review
                </button>
              </form>
            )}
          </div>
    </ModalShell>
  )
}
