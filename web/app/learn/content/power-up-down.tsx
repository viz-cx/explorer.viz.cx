import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core`

const CLIENT = `import { createClient } from '@viz-cx/core'

// A signing client. Load the WIF from the environment — never hardcode
// it or put it in browser code.
const client = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_ACTIVE_KEY!,
  endpoint: 'https://node.viz.cx',
})`

const UP = `// Power up: convert liquid VIZ into capital (SHARES).
// 'from' is implicit (the client's account). 'to' can be yourself,
// or another account — a simple way to gift someone capital.
const result = await client.transferToVesting({
  to: 'alice',            // stake to your own account
  amount: '100.000 VIZ',  // liquid VIZ to convert
})
console.log('Powered up:', result.id)`

const DOWN = `// Power down: begin converting capital back to liquid VIZ.
// The amount is in SHARES (6 decimals), not VIZ.
// 'account' is implicit.
await client.withdrawVesting({
  vestingShares: '50.000000 SHARES',
})

// The network returns it to your liquid balance in scheduled weekly
// installments — it is NOT instant. This lets governance stay stable.`

const CANCEL = `// Cancel an in-progress power-down by withdrawing zero.
await client.withdrawVesting({
  vestingShares: '0.000000 SHARES',
})`

export default async function PowerUpDown() {
  return (
    <>
      <p>
        VIZ has two forms of value: <strong>liquid VIZ</strong> you can send freely, and{' '}
        <strong>capital (SHARES)</strong> — staked VIZ that carries voting power, energy capacity, and
        a share of the reward pool. Moving between them is <em>powering up</em> and{' '}
        <em>powering down</em>. Every serious VIZ app touches this lifecycle.
      </p>

      <h3>Step 1 — Create a signing client</h3>
      <CodeBlock code={INSTALL} lang="bash" />
      <CodeBlock code={CLIENT} lang="typescript" />

      <h3>Step 2 — Power up (stake)</h3>
      <p>
        <code>transferToVesting</code> converts liquid VIZ into SHARES. Point <code>to</code> at
        yourself to build your own stake, or at another account to hand them capital directly.
      </p>
      <CodeBlock code={UP} lang="typescript" />

      <h3>Step 3 — Power down (unstake)</h3>
      <p>
        <code>withdrawVesting</code> starts the reverse. The amount is denominated in{' '}
        <strong>SHARES</strong> (six decimals). Unlike powering up, the payout is gradual — the chain
        releases it back to liquid VIZ over scheduled installments.
      </p>
      <CodeBlock code={DOWN} lang="typescript" />

      <h3>Optional — Cancel a power-down</h3>
      <p>
        Withdrawing <code>0.000000 SHARES</code> stops an active power-down and keeps your capital
        staked.
      </p>
      <CodeBlock code={CANCEL} lang="typescript" />

      <p>
        Capital that&apos;s scheduled to power down still counts as yours until each installment lands.
        To lend capital to others without unstaking, see <code>Delegate SHARES</code>.
      </p>
    </>
  )
}
