import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core`

const AWARD = `import { createClient } from '@viz-cx/core'

// createClient with account + activeKey returns a VizClient (full signing support).
// WARNING: Never put a WIF in client-side (browser) code.
// Use this pattern in a Node.js script or server-side only.
const client = createClient({
  account: 'alice',            // the account initiating the award
  activeKey: process.env.VIZ_ACTIVE_KEY!, // WIF string from env
  endpoint: 'https://node.viz.cx',
})

const result = await client.award({
  receiver: 'bob',
  energy: 100,     // energy to spend in basis points (100 = 1% of total energy)
  memo: 'Great work!',
  // beneficiaries: [{ account: 'charlie', weight: 1000 }] // optional, split award
})

console.log('Transaction ID:', result.id)
console.log('Block:        ', result.blockNum)`

const FIXED = `// fixed_award sends a specific VIZ amount regardless of energy.
// Requires enough liquid VIZ balance.
const result = await client.fixedAward({
  receiver: 'bob',
  rewardAmount: '10.000 VIZ',
  maxEnergy: 100,             // max energy to spend on the internal conversion
  memo: 'Fixed award example',
})`

const CHECK = `// Before awarding, you can check Alice's energy level.
const [alice] = await client.api.getAccounts(['alice'])
const energyPct = alice.energy / 100
console.log(\`Current energy: \${energyPct.toFixed(2)}%\`)
// energy regenerates at 20% per day (full regen in 5 days)`

export default async function SendAward() {
  return (
    <>
      <p>
        Awards are VIZ&apos;s core social mechanic — they transfer value from your energy reserve to a
        recipient, funding the reward pool. This guide shows how to send an award using{' '}
        <code>@viz-cx/core</code>.
      </p>

      <p>
        <strong>Phase 3 of viz.cx will add key management in the browser.</strong> For now, this
        tutorial uses a WIF key directly in a Node.js script. Never hardcode a WIF in
        client-side code or commit it to version control — use environment variables.
      </p>

      <h3>Step 1 — Install the SDK</h3>
      <CodeBlock code={INSTALL} lang="bash" />

      <h3>Step 2 — Check your energy before awarding</h3>
      <p>
        Each award costs energy (basis points). Energy regenerates from 0 to 100% over 5 days. The{' '}
        <code>energy</code> param on the award op is how many basis points to spend (100 = 1%, 10000
        = 100%).
      </p>
      <CodeBlock code={CHECK} lang="typescript" />

      <h3>Step 3 — Send an award</h3>
      <p>
        Pass <code>account</code> and <code>activeKey</code> to <code>createClient</code> to get a
        signing-capable client. The <code>initiator</code> field is implicit — it is taken from the{' '}
        <code>account</code> option.
      </p>
      <CodeBlock code={AWARD} lang="typescript" />

      <h3>Optional — Fixed award</h3>
      <p>
        <code>fixedAward</code> sends a specific VIZ amount instead of a percentage of energy. The
        chain converts it internally at the current rate.
      </p>
      <CodeBlock code={FIXED} lang="typescript" />
    </>
  )
}
