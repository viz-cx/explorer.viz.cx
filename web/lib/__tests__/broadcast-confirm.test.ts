import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { OpStreamMessage } from '@viz-cx/api'

/** A hand-driven stand-in for @viz-cx/api's OpStream. */
class FakeStream {
  msgHandlers = new Set<(m: OpStreamMessage) => void>()
  statusHandlers = new Set<(s: string) => void>()
  closed = false
  constructor(public filter?: { opType?: string; account?: string }) {}
  on(h: (m: OpStreamMessage) => void) { this.msgHandlers.add(h); return () => this.msgHandlers.delete(h) }
  off(h: (m: OpStreamMessage) => void) { this.msgHandlers.delete(h) }
  onStatus(h: (s: string) => void) { this.statusHandlers.add(h); return () => this.statusHandlers.delete(h) }
  close() { this.closed = true }
  open() { this.statusHandlers.forEach((h) => h('open')) }
  emit(msg: Partial<OpStreamMessage>) {
    this.msgHandlers.forEach((h) => h({ opId: null, timestamp: null, opType: null, body: {}, ...msg }))
  }
}

const streams: FakeStream[] = []
const mockStreamOps = vi.fn((filter?: { opType?: string }) => {
  const s = new FakeStream(filter)
  streams.push(s)
  return s
})

vi.mock('@viz-cx/api', () => ({
  createApiClient: vi.fn(() => ({ streamOps: mockStreamOps })),
}))

const last = () => streams[streams.length - 1]

beforeEach(() => {
  streams.length = 0
  mockStreamOps.mockClear()
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('bodyMatches', () => {
  it('matches identical bodies', async () => {
    const { bodyMatches } = await import('@/lib/broadcast-confirm')
    expect(bodyMatches({ from: 'alice', to: 'bob' }, { from: 'alice', to: 'bob' })).toBe(true)
  })

  it('ignores fields the chain does not echo (SDK wire defaults)', async () => {
    const { bodyMatches } = await import('@/lib/broadcast-confirm')
    // transfer_to_vesting carries memo/custom_sequence locally; the chain omits them.
    const sent = { from: 'alice', to: 'bob', amount: '1.000 VIZ', memo: '', custom_sequence: 0, beneficiaries: [] }
    expect(bodyMatches(sent, { from: 'alice', to: 'bob', amount: '1.000 VIZ' })).toBe(true)
  })

  it('rejects a differing value on a shared field', async () => {
    const { bodyMatches } = await import('@/lib/broadcast-confirm')
    expect(bodyMatches({ from: 'alice', to: 'bob' }, { from: 'alice', to: 'carol' })).toBe(false)
  })

  it('compares asset strings by value, not spelling', async () => {
    const { bodyMatches } = await import('@/lib/broadcast-confirm')
    expect(bodyMatches({ amount: '10.000 VIZ' }, { amount: '10.0 VIZ' })).toBe(true)
    expect(bodyMatches({ amount: '10.000 VIZ' }, { amount: '10.001 VIZ' })).toBe(false)
    expect(bodyMatches({ amount: '10.000 VIZ' }, { amount: '10.000 SHARES' })).toBe(false)
  })

  it('recurses into nested objects and arrays', async () => {
    const { bodyMatches } = await import('@/lib/broadcast-confirm')
    expect(bodyMatches({ props: [4, { account_creation_fee: '1.000 VIZ' }] }, { props: [4, { account_creation_fee: '1.000 VIZ', maximum_block_size: 65536 }] })).toBe(true)
    expect(bodyMatches({ props: [4, { maximum_block_size: 65536 }] }, { props: [4, { maximum_block_size: 131072 }] })).toBe(false)
    expect(bodyMatches({ beneficiaries: [] }, { beneficiaries: [{ account: 'a', weight: 1 }] })).toBe(false)
  })
})

describe('watchForOp', () => {
  it('subscribes with a server-side op_type filter', async () => {
    const { watchForOp } = await import('@/lib/broadcast-confirm')
    watchForOp('transfer', { from: 'alice' }).stop()
    expect(mockStreamOps).toHaveBeenCalledWith({ opType: 'transfer' })
  })

  it('resolves opened=true once the socket opens', async () => {
    const { watchForOp } = await import('@/lib/broadcast-confirm')
    const w = watchForOp('transfer', { from: 'alice' })
    last().open()
    await expect(w.opened).resolves.toBe(true)
    w.stop()
  })

  it('resolves opened=false when the socket never opens', async () => {
    const { watchForOp, SOCKET_OPEN_TIMEOUT_MS } = await import('@/lib/broadcast-confirm')
    const w = watchForOp('transfer', { from: 'alice' })
    await vi.advanceTimersByTimeAsync(SOCKET_OPEN_TIMEOUT_MS)
    await expect(w.opened).resolves.toBe(false)
    w.stop()
  })

  it('confirms on a matching op and reports the block number from op_id', async () => {
    const { watchForOp } = await import('@/lib/broadcast-confirm')
    const w = watchForOp('transfer', { from: 'alice', to: 'bob', amount: '1.000 VIZ' })
    const pending = w.waitForMatch(20_000)
    last().emit({ opType: 'transfer', opId: 82129071.00001 as unknown as string, body: { from: 'alice', to: 'bob', amount: '1.000 VIZ', memo: '' } })
    await expect(pending).resolves.toEqual({ status: 'confirmed', blockNum: 82129071 })
    w.stop()
  })

  it('ignores non-matching ops and times out as unconfirmed', async () => {
    const { watchForOp } = await import('@/lib/broadcast-confirm')
    const w = watchForOp('transfer', { from: 'alice', to: 'bob', amount: '1.000 VIZ' })
    const pending = w.waitForMatch(20_000)
    last().emit({ opType: 'transfer', opId: '1', body: { from: 'alice', to: 'carol', amount: '1.000 VIZ' } })
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(pending).resolves.toEqual({ status: 'unconfirmed' })
    w.stop()
  })

  it('stop() closes the socket and detaches handlers', async () => {
    const { watchForOp } = await import('@/lib/broadcast-confirm')
    const w = watchForOp('transfer', { from: 'alice' })
    const stream = last()
    w.stop()
    expect(stream.closed).toBe(true)
    expect(stream.msgHandlers.size).toBe(0)
    expect(stream.statusHandlers.size).toBe(0)
  })
})
