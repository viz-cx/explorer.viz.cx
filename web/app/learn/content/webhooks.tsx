import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/api @viz-cx/core`

const REGISTER = `import { createApiClient } from '@viz-cx/api'
import { keys, wif } from '@viz-cx/core'

// Registering a webhook is an authenticated call. A Signer proves you
// control the account by signing a server-issued nonce with your key.
const signer = {
  account: 'alice',
  sign: (bytes: Uint8Array) => keys.sign(bytes, wif(process.env.VIZ_REGULAR_KEY!)),
}

const api = createApiClient({ auth: signer })

const { id, secret } = await api.webhooks.create({
  url: 'https://myapp.example/hooks/viz',
  filter: { op_type: 'transfer', account: 'alice' },  // both fields optional
})

// The secret is shown ONCE. Store it — you'll need it to verify deliveries.
console.log('Webhook id:', id)
console.log('Signing secret:', secret)`

const RECEIVE = `import express from 'express'
import crypto from 'node:crypto'

const SECRET = process.env.VIZ_WEBHOOK_SECRET!
const app = express()

// Verify against the RAW body — parsing first would change the bytes.
app.post('/hooks/viz', express.raw({ type: 'application/json' }), (req, res) => {
  const got = req.header('X-Viz-Signature') ?? ''
  const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.body).digest('hex')
  if (got.length !== want.length ||
      !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return res.status(401).end()
  }

  // Same shape as the live stream: { op_id, timestamp, op_type, body }
  const { op_type, body, timestamp } = JSON.parse(req.body.toString())
  console.log(timestamp, op_type, body)

  res.status(200).end()   // ack fast — anything under 500 counts as delivered
})

app.listen(3000)`

const MANAGE = `// List your webhooks (returns rows without the secret)
const hooks = await api.webhooks.list()

// Remove one when you're done
await api.webhooks.delete(id)`

export default async function Webhooks() {
  return (
    <>
      <p>
        A live WebSocket is great for a dashboard, but a poor fit for a serverless function or a
        backend that shouldn&apos;t hold an open socket. Webhooks flip it around:{' '}
        <strong>viz.cx watches the chain for you</strong> and <code>POST</code>s matching operations
        to your URL — signed, with retries.
      </p>

      <p>
        The delivery payload is identical to the live stream —{' '}
        <code>{'{ op_id, timestamp, op_type, body }'}</code> — so code that handles one handles both.
      </p>

      <h3>Step 1 — Install the SDK</h3>
      <CodeBlock code={INSTALL} lang="bash" />

      <h3>Step 2 — Register a webhook</h3>
      <p>
        Registration is authenticated by <strong>signature challenge</strong>: you sign a
        server-issued nonce with your regular key. The API returns an <code>id</code> and a{' '}
        <code>secret</code> — the secret is shown only once and is used to verify every delivery.
      </p>
      <CodeBlock code={REGISTER} lang="typescript" />

      <h3>Step 3 — Receive and verify deliveries</h3>
      <p>
        Every POST carries an <code>X-Viz-Signature: sha256=&lt;hex&gt;</code> header — an HMAC-SHA256
        of the raw body keyed by your secret. Verify it against the <strong>raw</strong> bytes before
        trusting anything, then acknowledge quickly.
      </p>
      <CodeBlock code={RECEIVE} lang="typescript" />
      <p>
        Delivery retries three times with backoff on any 5xx or network error, then drops that event
        — so respond fast and keep your handler idempotent (dedupe on <code>op_id</code>).
      </p>

      <h3>Manage your webhooks</h3>
      <CodeBlock code={MANAGE} lang="typescript" />

      <p>
        Narrow deliveries at registration with the <code>filter</code> — by <code>op_type</code>, by{' '}
        <code>account</code>, or both — so you only get the ops you actually care about.
      </p>
    </>
  )
}
