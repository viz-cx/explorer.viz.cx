import { CodeBlock } from '@/components/CodeBlock'

const CONNECT = `const ws = new WebSocket('wss://api.viz.cx/ws/ops')

ws.onopen = () => console.log('connected')

ws.onmessage = (event) => {
  const item = JSON.parse(event.data)
  // item shape:
  // { op_id: '82134935.0', timestamp: '2026-08-01T02:01:27',
  //   op_type: 'award', body: { initiator: 'alice', receiver: 'bob', ... } }
  console.log(item.timestamp, item.op_type, item.body)
}

ws.onclose = () => console.log('disconnected')
ws.onerror = (e) => console.error('ws error', e)`

const FILTER = `// Server-side: only 'award' ops ever reach this socket.
const ws = new WebSocket('wss://api.viz.cx/ws/ops?op_type=award')

ws.onmessage = (event) => {
  const { body } = JSON.parse(event.data)

  console.log(
    \`\${body.initiator} awarded \${body.receiver}\`,
    \`energy: \${body.energy / 100}%\`,
    body.memo ?? ''
  )
}

// Or filter by account — matches these body fields, across every op type:
//   from, to, receiver, account, benefactor, witness,
//   required_active_auths, required_regular_auths
// wss://api.viz.cx/ws/ops?account=alice
//
// Note: an award's 'initiator' is NOT one of them — ?account=alice catches
// awards alice RECEIVED, not ones she sent. Filter senders in JS.
//
// Both params combine, and you can still narrow further in JS on fields
// the server doesn't index:
// if (body.energy < 5000) return`

const BLOCK_NUM = `// op_id is '<block>.<op-fraction>' — the block number is the integer part.
const blockNum = Math.floor(Number(item.op_id))
console.log(\`https://viz.cx/block/\${blockNum}\`)`

const RECONNECT = `function connect() {
  const ws = new WebSocket('wss://api.viz.cx/ws/ops?op_type=award')

  ws.onmessage = (event) => {
    const { body } = JSON.parse(event.data)
    console.log(\`award: \${body.initiator} → \${body.receiver}\`)
  }

  ws.onclose = () => {
    console.log('reconnecting in 3s…')
    setTimeout(connect, 3000)
  }

  ws.onerror = () => ws.close()

  return ws
}

const ws = connect()`

export default async function StreamLiveOps() {
  return (
    <>
      <p>
        <code>wss://api.viz.cx/ws/ops</code> emits a message for every operation applied at the chain
        head, typically <strong>1.5–4.5 seconds</strong> after it was signed (3s blocks, 1.5s
        poller). This makes it easy to react to live awards, transfers, and other events without
        polling.
      </p>

      <h3>Step 1 — Connect and log all operations</h3>
      <p>
        Each message is a flat JSON object with four fields: <code>op_id</code>,{' '}
        <code>timestamp</code>, <code>op_type</code>, and <code>body</code>. The{' '}
        <code>body</code> is the operation&apos;s payload — its shape depends on{' '}
        <code>op_type</code>.
      </p>
      <CodeBlock code={CONNECT} lang="typescript" />

      <h3>Step 2 — Filter by operation type or account</h3>
      <p>
        Most apps care about a subset of ops. Filter <strong>server-side</strong> with the{' '}
        <code>op_type</code> and <code>account</code> query params so unwanted traffic never crosses
        the wire. Common types: <code>award</code>, <code>transfer</code>,{' '}
        <code>account_create</code>, <code>delegate_vesting_shares</code>, <code>custom</code>.
      </p>
      <CodeBlock code={FILTER} lang="typescript" />

      <h3>Step 3 — Resolve the block number</h3>
      <p>
        Need to link an op back to the explorer? <code>op_id</code> encodes its block.
      </p>
      <CodeBlock code={BLOCK_NUM} lang="typescript" />

      <h3>Step 4 — Add reconnect logic</h3>
      <p>
        WebSocket connections drop. A simple 3-second retry on <code>onclose</code> is sufficient for
        most use cases.
      </p>
      <CodeBlock code={RECONNECT} lang="typescript" />

      <h3>Two things to know</h3>
      <p>
        The feed carries <strong>real operations only</strong> — virtual ops (author rewards,
        curation payouts, vesting withdrawals) are produced when a block becomes irreversible and
        never appear here. Read those from account history instead.
      </p>
      <p>
        And because these are <strong>head blocks, not irreversible ones</strong>, an op you see is
        overwhelmingly likely to stick but is not yet final. For anything with money attached, treat
        the stream as a notification and confirm against account history.
      </p>
    </>
  )
}
