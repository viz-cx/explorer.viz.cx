import { CodeBlock } from '@/components/CodeBlock'

const INSTALL = `npm install @viz-cx/core`

const CREATE = `import { createClient, keys } from '@viz-cx/core'

// A signing client for the account that funds the invite.
const client = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_ACTIVE_KEY!,
  endpoint: 'https://node.viz.cx',
})

// 1. Generate a throwaway keypair for the invite itself.
const invite = keys.generate()   // { wif, pub }

// 2. Create the invite on-chain, pre-funded with VIZ.
//    'creator' is implicit (the client's account).
await client.createInvite({
  balance: '5.000 VIZ',          // becomes the new account's starting capital
  inviteKey: invite.pub,
})

// The invite's PRIVATE key is the claim secret. Hand it to your
// user however you like — a link, a QR code, an email.
console.log('Claim secret:', invite.wif)`

const REGISTER = `import { createClient, keys } from '@viz-cx/core'

// Your service submits the registration on the user's behalf —
// the user has no account yet, so they can't sign anything.
const service = createClient({
  account: 'alice',
  activeKey: process.env.VIZ_ACTIVE_KEY!,
  endpoint: 'https://node.viz.cx',
})

// 3. Generate the NEW account's keypair. This single key controls
//    all of the account's authorities — this is what the user keeps.
const account = keys.generate()  // { wif, pub }

// 4. Redeem the invite secret to create and fund the account.
await service.inviteRegistration({
  newAccountName: 'bob',
  inviteSecret: inviteWif,       // the invite's private key from step 2
  newAccountKey: account.pub,
})

console.log('bob is live. Their key (keep it safe):', account.wif)`

const PASSWORD = `// Prefer a memorable master password over a raw key?
// Derive a keyset, then register with the regular public key.
const ks = keys.fromPassword('bob', userMasterPassword)  // { owner, active, regular, memo }
await service.inviteRegistration({
  newAccountName: 'bob',
  inviteSecret: inviteWif,
  newAccountKey: keys.toPublic(ks.regular),
})`

export default async function OnboardWithInvites() {
  return (
    <>
      <p>
        Invites are how you bring people onto VIZ with <strong>zero friction</strong>: no exchange, no
        pre-existing account, no fee paid by the newcomer. You fund an invite, hand over a secret, and
        the recipient turns it into a live, capitalized account. It&apos;s one of the best reasons to
        build a product on VIZ.
      </p>

      <p>
        The flow has two halves: <strong>you create a funded invite</strong>, then{' '}
        <strong>redeem it into a named account</strong>. The invite&apos;s private key is the claim
        secret that ties the two together.
      </p>

      <h3>Step 1 — Install the SDK</h3>
      <CodeBlock code={INSTALL} lang="bash" />

      <h3>Step 2 — Create a funded invite</h3>
      <p>
        Generate a throwaway keypair, then broadcast <code>create_invite</code> with its public key
        and some VIZ. That balance becomes the new account&apos;s starting capital. Keep the private
        key — it&apos;s the secret your user will redeem.
      </p>
      <CodeBlock code={CREATE} lang="typescript" />

      <h3>Step 3 — Redeem it into an account</h3>
      <p>
        Generate the new account&apos;s keypair, then submit <code>invite_registration</code> with the
        chosen name, the invite secret, and the new public key. The newcomer can&apos;t sign yet, so
        your service is the <code>initiator</code>.
      </p>
      <CodeBlock code={REGISTER} lang="typescript" />

      <h3>Optional — Password-derived keys</h3>
      <p>
        If you&apos;d rather your users remember a password than store a raw WIF, derive a keyset with{' '}
        <code>keys.fromPassword</code> and register the public regular key. They can regenerate the
        same keys from the password later.
      </p>
      <CodeBlock code={PASSWORD} lang="typescript" />

      <p>
        Whoever holds <code>account.wif</code> (or the master password) controls the account —
        deliver it over a secure channel and never log it in production.
      </p>
    </>
  )
}
