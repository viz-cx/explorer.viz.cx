import type { Metadata } from 'next'
import { DocNav } from '@/components/DocNav'
import { CodeBlock } from '@/components/CodeBlock'

export const metadata: Metadata = { title: 'SDK Reference' }

const INSTALL = `npm install @viz-cx/core`

const SETUP = `import { createClient } from '@viz-cx/core'

// Read-only client (no key required)
const client = createClient({ endpoint: 'https://node.viz.cx' })`

const READ_DATA = `// Dynamic global properties
const dgp = await client.api.getDynamicGlobalProperties()
console.log(dgp.head_block_number, dgp.current_supply)

// Account(s)
const [alice] = await client.api.getAccounts(['alice'])
console.log(alice.balance, alice.vesting_shares, alice.energy)

// Block
const block = await client.api.getBlock(1)
console.log(block?.timestamp, block?.witness)

// Account history (last 10 ops)
const history = await client.api.getAccountHistory('alice', -1, 10)
for (const [, item] of history) {
  console.log(item.op[0], item.timestamp)
}`

const WS_SUBSCRIBE = `const ws = new WebSocket('wss://api.viz.cx/ws/ops')

ws.onmessage = (event) => {
  const item = JSON.parse(event.data)
  const [opType, opData] = item.op
  if (opType === 'award') {
    console.log(\`\${opData.initiator} awarded \${opData.receiver}\`)
  }
}

ws.onclose = () => {
  // Reconnect after 3 seconds
  setTimeout(() => connectFeed(), 3000)
}`

const ASSET = `import { Asset, viz, shares } from '@viz-cx/core'

const amount = Asset.parse('10.000 VIZ')
console.log(amount.toString()) // "10.000 VIZ"

const v = viz('5.000')    // Asset<'VIZ'>
const s = shares('100.000000') // Asset<'SHARES'>

console.log(v.add(viz('1.000')).toString()) // "6.000 VIZ"`

const TX_CLIENT = `import { createClient } from '@viz-cx/core'

// Full client with signing (requires account + active key)
const client = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_ACTIVE_KEY!, // WIF string — never expose client-side
  endpoint: 'https://node.viz.cx',
})

// Award another account
const result = await client.award({
  receiver: 'bob',
  energy: 100,  // % of energy to spend (100 = use 100% of current energy)
  memo: 'Great contribution!',
})
console.log('tx id:', result.id)`

export default function SdkPage() {
  return (
    <div className="flex flex-col gap-8">
      <DocNav active="/dev/sdk" />

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">SDK Reference</h1>
        <p className="mt-1 font-prose text-sm text-fg-dim">
          <code>@viz-cx/core</code> — TypeScript client for the VIZ blockchain.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">Installation</h2>
        <CodeBlock code={INSTALL} lang="bash" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">Setup</h2>
        <CodeBlock code={SETUP} lang="typescript" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">Reading data</h2>
        <p className="font-prose text-xs text-fg-muted">
          All read methods are on <code>client.api</code> (the <code>ReadApi</code> interface). They are async and return null when a resource does not exist.
        </p>
        <CodeBlock code={READ_DATA} lang="typescript" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">Asset formatting</h2>
        <p className="font-prose text-xs text-fg-muted">
          <code>Asset</code> is an immutable value object for VIZ token amounts. Use <code>Asset.parse(str)</code> to parse chain strings like <code>&quot;10.000 VIZ&quot;</code>.
        </p>
        <CodeBlock code={ASSET} lang="typescript" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">WebSocket subscription</h2>
        <p className="font-prose text-xs text-fg-muted">
          Subscribe to the live op feed at <code>wss://api.viz.cx/ws/ops</code>. Each message is a JSON-encoded operation record with <code>trx_id</code>, <code>timestamp</code>, and <code>op</code>.
        </p>
        <CodeBlock code={WS_SUBSCRIBE} lang="typescript" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-prose text-sm font-semibold text-fg">Signing &amp; broadcasting</h2>
        <p className="font-prose text-xs text-fg-muted">
          Pass <code>account</code> and <code>activeKey</code> to <code>createClient</code> to get a full client with curated broadcast methods. <strong>Never expose WIF keys in client-side (browser) code.</strong> Use this pattern in server-side scripts or backend services only.
        </p>
        <CodeBlock code={TX_CLIENT} lang="typescript" />
      </section>
    </div>
  )
}
