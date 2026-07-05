import { CodeBlock } from '@/components/CodeBlock'

const CURL = `curl -X POST https://node.viz.cx \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"get_accounts","params":{"account_names":["alice"]}}'`

const RESPONSE = `[{
  "name": "alice",
  "balance": "42.000 VIZ",
  "vesting_shares": "1000.000000 SHARES",
  "delegated_vesting_shares": "0.000000 SHARES",
  "received_vesting_shares": "0.000000 SHARES",
  "energy": 8500,
  "last_vote_time": "2026-06-20T14:00:00"
}]`

const SDK = `import { createClient } from '@viz-cx/core'

const client = createClient({ endpoint: 'https://node.viz.cx' })

const [alice] = await client.api.getAccounts(['alice'])
if (!alice) { console.log('account not found'); process.exit(1) }

// Balances
console.log('Liquid VIZ:', alice.balance)          // "42.000 VIZ"
console.log('SHARES:    ', alice.vesting_shares)   // "1000.000000 SHARES"

// Energy — VIZ's core mechanic
// energy is stored as 0–10000 (basis points). 10000 = 100%.
// It regenerates over 5 days from 0 to 100%.
const energyPct = alice.energy / 100
console.log(\`Energy: \${energyPct.toFixed(2)}%\`)`

const EFFECTIVE = `import { createClient } from '@viz-cx/core'

const client = createClient({ endpoint: 'https://node.viz.cx' })

const dgp = await client.api.getDynamicGlobalProperties()
const [alice] = await client.api.getAccounts(['alice'])

// Effective capital = own SHARES + received delegations - outgoing delegations
// (delegated_vesting_shares are lent out; received_vesting_shares are borrowed in)
// Convert SHARES to VIZ using the current vesting rate.
const fund   = parseFloat(dgp.total_vesting_fund?.split(' ')[0] ?? '0')
const supply = parseFloat((dgp.total_vesting_shares as string)?.split(' ')[0] ?? '1')
const rate   = fund / supply  // VIZ per SHARE (≈ 1.0)

const ownShares      = parseFloat(alice.vesting_shares.split(' ')[0])
const delegatedOut   = parseFloat(alice.delegated_vesting_shares.split(' ')[0])
const delegatedIn    = parseFloat(alice.received_vesting_shares.split(' ')[0])
const effectiveShares = ownShares - delegatedOut + delegatedIn

console.log(\`Effective capital: \${(effectiveShares * rate).toFixed(3)} VIZ\`)`

export default async function QueryAccount() {
  return (
    <>
      <p>
        Accounts are the core identity unit in VIZ. Each account holds liquid VIZ, capital
        (SHARES), and an energy percentage that recharges over time. This guide shows how to fetch
        and interpret account data.
      </p>

      <h3>Step 1 — Fetch account data with curl</h3>
      <p>
        <code>get_accounts</code> accepts an array of names and returns an array of account objects.
        It never returns null — missing accounts are simply absent from the result array.
      </p>
      <CodeBlock code={CURL} lang="bash" />
      <CodeBlock code={RESPONSE} lang="json" />

      <h3>Step 2 — Read balances and energy via SDK</h3>
      <p>
        <strong>Energy</strong> (<code>0–10000</code>) is VIZ&apos;s core voting-power mechanic. Awards
        cost energy; it regenerates fully in 5 days.
      </p>
      <CodeBlock code={SDK} lang="typescript" />

      <h3>Step 3 — Compute effective capital</h3>
      <p>
        Effective capital accounts for delegations. Use the{' '}
        <code>total_vesting_fund / total_vesting_shares</code> ratio from{' '}
        <code>getDynamicGlobalProperties</code> to convert SHARES to VIZ.
      </p>
      <CodeBlock code={EFFECTIVE} lang="typescript" />
    </>
  )
}
