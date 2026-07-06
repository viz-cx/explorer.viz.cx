import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core @viz-cx/api`

const WRITE = `import { createClient } from '@viz-cx/core'

// custom ops are authorized by the REGULAR authority, so sign with the
// regular key (the 'activeKey' option is simply the signing key).
const client = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_REGULAR_KEY!,
  endpoint: 'https://node.viz.cx',
})

// Emit an app event. 'id' namespaces your protocol; 'json' is a string
// payload. List the accounts whose regular authority must sign.
const result = await client.custom({
  id: 'chess',                       // your app id (keep it short & unique)
  json: JSON.stringify({ t: 'move', game: 42, from: 'e2', to: 'e4' }),
  requiredRegularAuths: ['alice'],
})
console.log('Wrote move:', result.id)`

const READ_STREAM = `import { createApiClient } from '@viz-cx/api'

const api = createApiClient()

// Index your protocol live: subscribe to custom ops and keep the ones
// tagged with your app id.
const stream = api.streamOps({ op_type: 'custom' })
for await (const { body, timestamp } of stream) {
  if (body.id !== 'chess') continue          // ignore other apps' ops
  const payload = JSON.parse(body.json)
  console.log(timestamp, payload)            // { t: 'move', game: 42, ... }
}`

const READ_HISTORY = `import { createClient } from '@viz-cx/core'

const client = createClient({ endpoint: 'https://node.viz.cx' })

// Backfill an account's past custom ops from its history (newest first).
const history = await client.api.getAccountHistory('alice', -1, 100)
for (const [, item] of history) {
  const [opType, body] = item.op
  if (opType === 'custom' && body.id === 'chess') {
    console.log(JSON.parse(body.json))
  }
}`

export default async function CustomAppData() {
  return (
    <>
      <p>
        The <code>custom</code> operation turns VIZ into a <strong>data layer for your own app</strong>
        . You write arbitrary JSON under an app id; the chain timestamps and orders it; you index it
        off the op stream. No smart contracts, no schema migrations — just append-only, signed,
        publicly verifiable events. It&apos;s the &ldquo;VIZ as a platform&rdquo; primitive.
      </p>

      <p>
        The chain doesn&apos;t interpret your payload — <strong>your app defines the meaning</strong>.
        A game, a social feed, a marketplace, a poll: all of it is custom ops plus an indexer.
      </p>

      <h3>Step 1 — Write an event</h3>
      <CodeBlock code={INSTALL} lang="bash" />
      <p>
        <code>id</code> namespaces your protocol so you can filter later; <code>json</code> is a
        string payload. Custom ops use the <strong>regular</strong> authority, so sign with the
        regular key and list the signer in <code>requiredRegularAuths</code>.
      </p>
      <CodeBlock code={WRITE} lang="typescript" />

      <h3>Step 2 — Index it live</h3>
      <p>
        Subscribe to <code>custom</code> ops and keep the ones matching your <code>id</code>. This is
        your real-time indexer — fold each event into whatever state your app holds.
      </p>
      <CodeBlock code={READ_STREAM} lang="typescript" />

      <h3>Step 3 — Backfill from history</h3>
      <p>
        To rebuild state on startup, walk an account&apos;s history and replay its past custom ops. Use{' '}
        <code>get_ops_in_block</code> across a block range to reconstruct the whole protocol.
      </p>
      <CodeBlock code={READ_HISTORY} lang="typescript" />

      <p>
        Keep payloads small and version them (e.g. a <code>v</code> field) — custom ops are permanent,
        so a forward-compatible schema saves you later. For push-based indexing without a socket, wire
        a <code>custom</code> filter into a webhook.
      </p>
    </>
  )
}
