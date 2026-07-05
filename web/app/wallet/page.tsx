'use client'
import { useEffect, useState } from 'react'
import { createHttpTransport, createReadApi, type AccountHistoryItem } from '@viz-cx/core'
import { useWallet } from '@/lib/wallet'
import { NODE_ENDPOINTS } from '@/lib/config'
import { currentEnergy, formatUTC } from '@/lib/format'
import { TransferModal } from '@/components/TransferModal'
import { PowerUpModal } from '@/components/PowerUpModal'
import { PowerDownModal } from '@/components/PowerDownModal'
import { DelegateModal } from '@/components/DelegateModal'

function summarizeOp(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'award': return `award → ${data.receiver}`
    case 'receive_award': return `received from ${data.initiator}`
    case 'transfer': return `${data.amount} → ${data.to}`
    case 'account_create': return `created ${data.new_account_name}`
    case 'delegate_vesting_shares': return `delegate ${data.vesting_shares} → ${data.delegatee}`
    default: return type.replace(/_/g, ' ')
  }
}

interface AccountSnapshot {
  balance: string
  vesting_shares: string
  energy: number
  last_vote_time: string | undefined
}

interface HistoryRow {
  idx: number
  timestamp: string
  type: string
  data: Record<string, unknown>
}

export default function WalletPage() {
  const wallet = useWallet()
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [powerUpOpen, setPowerUpOpen] = useState(false)
  const [powerDownOpen, setPowerDownOpen] = useState(false)
  const [delegateOpen, setDelegateOpen] = useState(false)

  // Flag loading when the connected account changes (render-phase, before paint).
  const [prevAccount, setPrevAccount] = useState(wallet.account)
  if (prevAccount !== wallet.account) {
    setPrevAccount(wallet.account)
    if (wallet.connected && wallet.account) setLoading(true)
  }

  useEffect(() => {
    if (!wallet.connected || !wallet.account) return
    let cancelled = false
    const transport = createHttpTransport(NODE_ENDPOINTS[0])
    const api = createReadApi(transport)
    Promise.allSettled([
      api.getAccounts([wallet.account]),
      api.getAccountHistory(wallet.account, -1, 20),
    ])
      .then(([accountsResult, histResult]) => {
        if (cancelled) return
        if (accountsResult.status === 'fulfilled') {
          const acc = accountsResult.value[0]
          if (acc) {
            setSnapshot({
              balance: acc.balance,
              vesting_shares: acc.vesting_shares,
              energy: acc.energy,
              last_vote_time: acc['last_vote_time'] as string | undefined,
            })
          }
        } else {
          console.warn('[WalletPage] getAccounts failed:', accountsResult.reason)
        }
        if (histResult.status === 'fulfilled') {
          const hist = histResult.value
          const rows = (hist as Array<readonly [number, AccountHistoryItem]>)
            .map(([idx, item]) => ({
              idx,
              timestamp: item.timestamp,
              type: item.op[0],
              data: item.op[1],
            }))
            .reverse()
          setHistory(rows)
        } else {
          console.warn('[WalletPage] getAccountHistory failed:', histResult.reason)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [wallet.connected, wallet.account])

  if (!wallet.connected) {
    return (
      <div className="flex flex-col items-center gap-6 py-24">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Wallet</h1>
        <p className="font-prose text-sm text-fg-muted">
          Connect your VIZ key to view your wallet.
        </p>
        <button
          onClick={() => wallet.openModal('connect')}
          className="rounded-md bg-acc-green px-6 py-2 font-prose text-sm font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Connect
        </button>
      </div>
    )
  }

  const energyPct = snapshot
    ? Math.round(currentEnergy(snapshot.energy, snapshot.last_vote_time))
    : null

  return (
    <div className="flex flex-col gap-8">
      {/* Account header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{wallet.account}</h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-acc-green">● connected</span>
            {(Object.entries(wallet.walletKeys) as [string, unknown][])
              .filter(([, v]) => v)
              .map(([role]) => (
                <span
                  key={role}
                  className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-dim"
                >
                  {role}
                </span>
              ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => wallet.openModal('add-key')}
            className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Add key
          </button>
          <button
            onClick={wallet.disconnect}
            aria-label="Disconnect wallet"
            className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Action strip */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (!wallet.connected) { wallet.openModal('connect'); return }
            if (!wallet.keyFor('active')) { wallet.openModal('add-key'); return }
            setTransferOpen(true)
          }}
          className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          {wallet.connected && !wallet.keyFor('active') ? 'Transfer (needs active key)' : 'Transfer'}
        </button>
        <button
          onClick={() => {
            if (!wallet.connected) { wallet.openModal('connect'); return }
            if (!wallet.keyFor('active')) { wallet.openModal('add-key'); return }
            setPowerUpOpen(true)
          }}
          className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          {wallet.connected && !wallet.keyFor('active') ? 'Power Up (needs active key)' : 'Power Up'}
        </button>
        <button
          onClick={() => {
            if (!wallet.connected) { wallet.openModal('connect'); return }
            if (!wallet.keyFor('active')) { wallet.openModal('add-key'); return }
            setPowerDownOpen(true)
          }}
          className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          {wallet.connected && !wallet.keyFor('active') ? 'Power Down (needs active key)' : 'Power Down'}
        </button>
        <button
          onClick={() => {
            if (!wallet.connected) { wallet.openModal('connect'); return }
            if (!wallet.keyFor('active')) { wallet.openModal('add-key'); return }
            setDelegateOpen(true)
          }}
          className="rounded border border-border px-3 py-1.5 font-prose text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          {wallet.connected && !wallet.keyFor('active') ? 'Delegate (needs active key)' : 'Delegate'}
        </button>
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
      <PowerUpModal open={powerUpOpen} onClose={() => setPowerUpOpen(false)} />
      <PowerDownModal open={powerDownOpen} onClose={() => setPowerDownOpen(false)} />
      <DelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
            Liquid
          </div>
          <div className="font-mono text-sm text-fg">{snapshot?.balance ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
            Capital
          </div>
          <div className="font-mono text-sm text-fg">{snapshot?.vesting_shares ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
            Energy
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-acc-green transition-all"
                style={{ width: `${energyPct ?? 0}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-sm text-acc-green">
              {energyPct !== null ? `${energyPct}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[10px] font-prose font-semibold uppercase tracking-widest text-fg-dim">
          Recent transactions
        </h2>
        {loading && <p className="font-prose text-sm text-fg-dim">Loading…</p>}
        {!loading && history.length === 0 && (
          <p className="font-prose text-sm text-fg-dim">No transactions found.</p>
        )}
        {!loading && history.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            {history.map((row) => (
              <div
                key={row.idx}
                className="flex items-center gap-4 border-b border-border px-4 py-2.5 last:border-0"
              >
                <span className="w-32 shrink-0 font-mono text-[10px] text-fg-dim">
                  {formatUTC(row.timestamp)}
                </span>
                <span className="shrink-0 font-mono text-xs text-acc-blue">{row.type}</span>
                <span className="truncate font-prose text-xs text-fg-muted">
                  {summarizeOp(row.type, row.data)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
