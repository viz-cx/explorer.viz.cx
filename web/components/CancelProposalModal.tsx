'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { cancelProposal } from '@/lib/actions'
import { truncateUrl, type CommitteeRequest } from '@/lib/committee'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
  proposal: CommitteeRequest
}

export function CancelProposalModal({ open, onClose, proposal }: Props) {
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
    const wif = wallet.keyFor('regular')
    if (!wif) { setError('Regular key required'); return }
    setLoading(true); setError(null)
    try {
      await cancelProposal(wif, wallet.account!, proposal.request_id)
      toast.success(`Cancelled proposal #${proposal.request_id}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Cancel proposal">
        <div className="flex flex-col gap-4">
            <p className="font-prose text-sm text-fg-muted">Remove your proposal from the committee?</p>
            <p className="border-l-2 border-border pl-3 font-mono text-sm text-fg">{truncateUrl(proposal.url, 48)}</p>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Keep</button>
              <button onClick={handleConfirm} disabled={loading} className="flex-1 rounded border border-acc-red py-2 font-prose text-sm font-semibold text-acc-red disabled:opacity-50">
                {loading ? 'Cancelling…' : 'Cancel proposal'}
              </button>
            </div>
          </div>
    </ModalShell>
  )
}
