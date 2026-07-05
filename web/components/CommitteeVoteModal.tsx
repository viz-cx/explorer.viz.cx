'use client'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet'
import { useToast } from '@/lib/toast'
import { voteProposal } from '@/lib/actions'
import { truncateUrl, type CommitteeRequest } from '@/lib/committee'
import { ModalShell } from './ModalShell'

interface Props {
  open: boolean
  onClose: () => void
  proposal: CommitteeRequest
  votePercent: number   // +10000 approve · -10000 reject · 0 remove
}

export function CommitteeVoteModal({ open, onClose, proposal, votePercent }: Props) {
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
      await voteProposal(wif, wallet.account!, proposal.request_id, votePercent)
      toast.success(`Voted on proposal #${proposal.request_id}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setLoading(false) }
  }

  const title = votePercent > 0 ? 'Approve proposal'
    : votePercent < 0 ? 'Reject proposal'
    : 'Remove vote'

  const body = votePercent > 0 ? 'Cast a full support vote (+100%) for:'
    : votePercent < 0 ? 'Cast a full oppose vote (−100%) for:'
    : 'Remove your vote from:'

  const confirmLabel = votePercent > 0 ? 'Approve' : votePercent < 0 ? 'Reject' : 'Remove vote'
  const confirmClass = votePercent < 0
    ? 'flex-1 rounded border border-acc-red py-2 font-prose text-sm font-semibold text-acc-red disabled:opacity-50'
    : 'flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50'

  return (
    <ModalShell open={open} onClose={onClose} title={title}>
        <div className="flex flex-col gap-4">
            <p className="font-prose text-sm text-fg-muted">{body}</p>
            <p className="border-l-2 border-border pl-3 font-mono text-sm text-fg">{truncateUrl(proposal.url, 48)}</p>
            {error && <p className="font-prose text-xs text-acc-red">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Cancel</button>
              <button onClick={handleConfirm} disabled={loading} className={confirmClass}>
                {loading ? 'Processing…' : confirmLabel}
              </button>
            </div>
          </div>
    </ModalShell>
  )
}
