import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core`

const CLIENT = `import { createClient } from '@viz-cx/core'

// Pass account + activeKey to get a signing-capable client.
// WARNING: a WIF is a private key. Never ship it in browser code
// or commit it — load it from an environment variable in a
// Node.js script or on your server.
const client = createClient({
  account: 'alice',                        // the sender
  activeKey: process.env.VIZ_ACTIVE_KEY!,  // WIF string from env
  endpoint: 'https://node.viz.cx',
})`

const SEND = `// The 'from' field is implicit — it's the client's account.
const result = await client.transfer({
  to: 'bob',
  amount: '1.000 VIZ',   // always 3 decimals + the VIZ symbol
  memo: 'Thanks for the coffee',
})

console.log('Transaction ID:', result.id)
console.log('Block:         ', result.blockNum)`

const GUARD = `// Transfers move liquid VIZ, not capital (SHARES).
// Read the balance first so you fail fast instead of on-chain.
const [alice] = await client.api.getAccounts(['alice'])
const liquid = parseFloat(alice.balance.split(' ')[0])  // "42.000 VIZ" -> 42
if (liquid < 1) throw new Error('Not enough liquid VIZ')`

export default async function TransferViz() {
  return (
    <>
      <p>
        A transfer moves <strong>liquid VIZ</strong> from one account to another. It is the simplest
        write operation on the chain — no energy is spent, only the amount you send. This guide sends
        one using <code>@viz-cx/core</code>.
      </p>

      <p>
        Unlike an <code>award</code> (which pays out of your energy reserve), a transfer debits your
        spendable balance directly. Capital held as SHARES is not touched — power it down first if you
        need it liquid.
      </p>

      <h3>Step 1 — Install the SDK</h3>
      <CodeBlock code={INSTALL} lang="bash" />

      <h3>Step 2 — Create a signing client</h3>
      <p>
        Passing <code>account</code> and <code>activeKey</code> to <code>createClient</code> returns a
        client that can sign and broadcast. Keep the WIF out of client-side code — use it in a
        Node.js script or server only.
      </p>
      <CodeBlock code={CLIENT} lang="typescript" />

      <h3>Step 3 — Check the balance, then send</h3>
      <p>
        Amounts are strings with three decimals and the symbol, e.g. <code>&apos;1.000 VIZ&apos;</code>. A
        quick balance read keeps the failure client-side.
      </p>
      <CodeBlock code={GUARD} lang="typescript" />
      <CodeBlock code={SEND} lang="typescript" />

      <p>
        Memos are stored on-chain in <strong>plain text</strong> and are publicly visible — never put
        anything secret in one. When you&apos;re ready to reward contributions rather than just move
        funds, see <code>Send an award</code>.
      </p>
    </>
  )
}
