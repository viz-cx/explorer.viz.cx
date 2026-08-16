import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Dev Hub' }

const CARDS = [
  {
    href: '/dev/rpc',
    label: 'VIZ RPC',
    desc: 'Node JSON-RPC methods — get_block, get_accounts, get_account_history, and more.',
    accent: 'border-acc-blue',
  },
  {
    href: '/dev/rest',
    label: 'REST API',
    desc: 'api.viz.cx endpoints — blocks, profiles, richlist, and the live WebSocket feed.',
    accent: 'border-acc-blue',
  },
  {
    href: '/dev/sdk',
    label: 'SDK',
    desc: '@viz-cx/core TypeScript client — createClient, ReadApi, TxBuilder, and key utilities.',
    accent: 'border-acc-blue',
  },
  {
    href: '/dev/playground',
    label: 'Playground →',
    desc: 'Build RPC and REST requests interactively. Copy to run in your terminal.',
    accent: 'border-acc-green',
  },
]

export default function DevPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dev Hub</h1>
        <p className="mt-1 font-prose text-sm text-fg-dim">
          The developer gateway to VIZ.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`flex flex-col gap-2 rounded-lg border bg-surface p-5 hover:border-border-strong transition-colors ${c.accent}`}
          >
            <span className="font-mono text-sm font-medium text-fg">{c.label}</span>
            <span className="font-prose text-xs text-fg-muted">{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
