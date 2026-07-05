'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { voteValidator } from '@/lib/actions'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
  validator: string
  currentlyVoted: boolean
}

export function ValidatorVoteModal({ open, onClose, validator, currentlyVoted }: Props) {
  const wallet = useWallet()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset transient state on close (render-phase, so it lands before paint).
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) setError(null)
  }

  async function handleConfirm() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setLoading(true); setError(null)
    try {
      await voteValidator(wif, wallet.account!, validator, !currentlyVoted)
      toast.success(`${currentlyVoted ? 'Removed vote for' : 'Voted for'} @${validator}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell open={open} onClose={onClose} title={currentlyVoted ? 'Remove vote' : 'Vote for validator'}>
        <div className="flex flex-col gap-4">
            <p className="font-prose text-sm text-fg">
              {currentlyVoted
                ? <><span>Remove vote for </span><span className="font-mono text-fg-muted">@{validator}</span><span>?</span></>
                : <><span>Vote for </span><span className="font-mono text-fg-muted">@{validator}</span><span>?</span></>
              }
            </p>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Cancel</button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50"
              >
                {loading ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
    </ModalShell>
  )
}
