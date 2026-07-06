import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core @viz-cx/api`

const SETUP = `import { createApiClient } from '@viz-cx/api'
import { createClient } from '@viz-cx/core'

const BOT = 'tipbot'

// api = the hosted viz.cx stream (read-only, no key needed)
const api = createApiClient()

// chain = a signing client that pays out awards from the bot's energy.
// Load the WIF from the environment — never hardcode it.
const chain = createClient({
  account: BOT,
  activeKey: process.env.VIZ_ACTIVE_KEY!,
  endpoint: 'https://node.viz.cx',
})`

const LOOP = `// Server-side filter: only transfers that involve the bot reach us.
const stream = api.streamOps({ op_type: 'transfer', account: BOT })

// Each message is { op_id, timestamp, op_type, body }.
// body is the operation itself: { from, to, amount, memo }.
for await (const { body } of stream) {
  if (body.to !== BOT) continue                 // ignore the bot's own sends

  // Command syntax the sender puts in the memo: "tip alice"
  const [cmd, target] = (body.memo ?? '').trim().split(/\\s+/)
  if (cmd !== 'tip' || !target || target === body.from) continue

  await chain.award({
    receiver: target,
    energy: 100,                                // 1% of the bot's energy
    memo: \`Tipped by \${body.from}\`,
  })
  console.log(\`\${body.from} tipped \${target}\`)
}`

const RESILIENT = `// streamOps auto-reconnects; surface status changes and keep going
// even if a single award fails (e.g. the target account is gone).
stream.onStatus((s) => console.log('stream:', s))

for await (const { body } of stream) {
  try {
    // ... command parsing + chain.award(...) as above
  } catch (err) {
    console.error('skip:', err)                 // never let one op kill the loop
  }
}`

export default async function BuildTipBot() {
  return (
    <>
      <p>
        Time to build something real. This bot listens to the live chain and turns a memo into an
        on-chain reward: whenever someone sends the bot a transfer with a memo like{' '}
        <code>tip alice</code>, it awards <code>alice</code> from the bot&apos;s energy. It&apos;s the
        whole loop — <strong>read the chain, react, write back</strong> — in about 40 lines.
      </p>

      <p>
        Awards are funded by <strong>energy</strong>, not your balance, so a tip bot costs nothing but
        the energy that regenerates on its own (fully in 5 days). That makes VIZ a natural fit for
        social, high-frequency micro-rewards.
      </p>

      <h3>Step 1 — Install both packages</h3>
      <p>
        <code>@viz-cx/api</code> gives you the hosted live-op stream; <code>@viz-cx/core</code> signs
        and broadcasts the award.
      </p>
      <CodeBlock code={INSTALL} lang="bash" />

      <h3>Step 2 — Wire up the stream and the signer</h3>
      <p>
        One client reads (no key), one client writes (the bot&apos;s active WIF, from the
        environment). Run this on a server or in a background Node.js process — never in a browser.
      </p>
      <CodeBlock code={SETUP} lang="typescript" />

      <h3>Step 3 — React to tips</h3>
      <p>
        <code>streamOps</code> is an async iterable. The server-side <code>op_type</code> +{' '}
        <code>account</code> filter means only transfers touching the bot ever arrive, so the loop
        stays cheap.
      </p>
      <CodeBlock code={LOOP} lang="typescript" />

      <h3>Step 4 — Make it robust</h3>
      <p>
        Long-running bots see dropped sockets and bad input. The stream reconnects itself; wrap each
        award so one failure can&apos;t stop the loop.
      </p>
      <CodeBlock code={RESILIENT} lang="typescript" />

      <p>
        From here: rate-limit per sender, require a minimum transfer to fund tips, or split the award
        with <code>beneficiaries</code>. To move off a persistent socket entirely, see{' '}
        <code>React to events with webhooks</code>.
      </p>
    </>
  )
}
