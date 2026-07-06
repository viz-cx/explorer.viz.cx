import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core`

const DELEGATE = `import { createClient } from '@viz-cx/core'

const client = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_ACTIVE_KEY!,
  endpoint: 'https://node.viz.cx',
})

// Lend capital to 'bob'. 'delegator' is implicit (the client's account).
// Bob gains the energy and voting power of these SHARES without owning them.
const result = await client.delegateVestingShares({
  delegatee: 'bob',
  vestingShares: '500.000000 SHARES',  // 6 decimals
})
console.log('Delegated:', result.id)`

const ADJUST = `// Delegation is a target, not a delta. Set the NEW total to change it.
// Raise it:
await client.delegateVestingShares({ delegatee: 'bob', vestingShares: '800.000000 SHARES' })

// Lower it (or set 0 to revoke entirely):
await client.delegateVestingShares({ delegatee: 'bob', vestingShares: '0.000000 SHARES' })`

const READ = `// Delegations are visible on the account. Reading Bob shows what he
// borrowed; reading Alice shows what she lent out.
const [bob] = await client.api.getAccounts(['bob'])
console.log('received:', bob.received_vesting_shares)   // borrowed in
console.log('own:     ', bob.vesting_shares)            // owned outright`

export default async function DelegateShares() {
  return (
    <>
      <p>
        Delegation lets you <strong>lend capital without giving it away</strong>. The recipient gets
        the energy and voting power of your SHARES; you keep ownership and can pull it back anytime.
        It&apos;s how communities bootstrap newcomers — pair it with an invite and a new user can act
        immediately, funded by you.
      </p>

      <h3>Step 1 — Delegate SHARES</h3>
      <CodeBlock code={INSTALL} lang="bash" />
      <p>
        <code>delegateVestingShares</code> takes the delegatee and an amount in SHARES. The delegator
        is implicit.
      </p>
      <CodeBlock code={DELEGATE} lang="typescript" />

      <h3>Step 2 — Adjust or revoke</h3>
      <p>
        The amount is the <strong>new total</strong>, not an increment — re-send with a higher or
        lower value to change it, or <code>0.000000 SHARES</code> to revoke. Reclaimed capital returns
        to you after a short cooldown, then can be powered down again.
      </p>
      <CodeBlock code={ADJUST} lang="typescript" />

      <h3>Step 3 — See what&apos;s delegated</h3>
      <p>
        <code>received_vesting_shares</code> is capital borrowed in; <code>delegated_vesting_shares</code>{' '}
        is capital lent out. Effective power is own + received − delegated.
      </p>
      <CodeBlock code={READ} lang="typescript" />

      <p>
        Delegated capital can&apos;t be powered down until it&apos;s returned — so keep a buffer of
        undelegated SHARES if you may need to unstake.
      </p>
    </>
  )
}
