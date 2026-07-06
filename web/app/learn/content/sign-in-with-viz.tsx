import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/api @viz-cx/core`

const SIGNER = `import { createApiClient } from '@viz-cx/api'
import { keys, wif } from '@viz-cx/core'

// A Signer proves control of an account by signing challenges with its
// regular key. In a real dApp this comes from the user's wallet — here we
// load the WIF from the environment for a server-side or CLI login.
const signer = {
  account: 'alice',
  sign: (bytes: Uint8Array) => keys.sign(bytes, wif(process.env.VIZ_REGULAR_KEY!)),
}

const api = createApiClient({ auth: signer })`

const LOGIN = `// authedFetch runs the whole challenge for you:
//   1. POST /auth/nonce            -> a single-use nonce (valid 5 min)
//   2. sign the nonce with the key
//   3. resend with X-Auth-Account / X-Auth-Nonce / X-Auth-Signature
// Exchange that proof for a 30-day bearer token.
const res = await api.authedFetch('/session', { method: 'POST' })
if (!res.ok) throw new Error('login failed')

const { token } = await res.json()
console.log('Session token:', token)   // store it (cookie / secure storage)`

const USE = `// Use the bearer token on session-gated endpoints — no more signing.
const base = 'https://api.viz.cx'
const auth = { Authorization: \`Bearer \${token}\` }

// e.g. add an account to the signed-in user's watchlist
await fetch(\`\${base}/watchlist\`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'bob' }),
})

const count = await fetch(\`\${base}/notifications/count\`, { headers: auth }).then(r => r.json())
console.log('unread:', count)`

const LOGOUT = `// Log out — revoke the token server-side. Idempotent.
await fetch('https://api.viz.cx/session', {
  method: 'DELETE',
  headers: { Authorization: \`Bearer \${token}\` },
})`

export default async function SignInWithViz() {
  return (
    <>
      <p>
        &ldquo;Sign in with VIZ&rdquo; is passwordless auth backed by the blockchain: a user proves
        they control an account by <strong>signing a challenge with their key</strong>, and your app
        gets a session token in return. No passwords to store, no email flow — the same key that signs
        transactions signs the login.
      </p>

      <p>
        The flow is a <strong>signature challenge</strong>: fetch a one-time nonce, sign it, exchange
        the proof for a bearer token. viz.cx&apos;s own watchlist and notifications run on exactly
        this.
      </p>

      <h3>Step 1 — Build a signer</h3>
      <CodeBlock code={INSTALL} lang="bash" />
      <p>
        A <code>Signer</code> is an account name plus a function that signs bytes with its regular key.
      </p>
      <CodeBlock code={SIGNER} lang="typescript" />

      <h3>Step 2 — Exchange a signature for a token</h3>
      <p>
        <code>authedFetch</code> handles the nonce round-trip and header signing, so hitting{' '}
        <code>POST /session</code> returns a 30-day bearer token.
      </p>
      <CodeBlock code={LOGIN} lang="typescript" />

      <h3>Step 3 — Call session-gated endpoints</h3>
      <p>
        Send the token as <code>Authorization: Bearer &lt;token&gt;</code>. No signing per request —
        the token is the session.
      </p>
      <CodeBlock code={USE} lang="typescript" />

      <h3>Step 4 — Log out</h3>
      <p>
        <code>DELETE /session</code> revokes the token immediately. It&apos;s idempotent, so
        double-logout is fine.
      </p>
      <CodeBlock code={LOGOUT} lang="typescript" />

      <p>
        Nonces are single-use and expire in 5 minutes; tokens last 30 days or until revoked. In the
        browser, get the signature from the user&apos;s wallet rather than handling their raw key.
      </p>
    </>
  )
}
