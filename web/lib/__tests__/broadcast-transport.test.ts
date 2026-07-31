import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { OpStreamMessage } from '@viz-cx/api'
import type { SignedTransaction, Transport, Wif } from '@viz-cx/core'

/**
 * Covers makeBroadcastTransport in lib/actions.ts: the async broadcast must not
 * report success until the op shows up on the live stream.
 */

class FakeStream {
  msgHandlers = new Set<(m: OpStreamMessage) => void>()
  statusHandlers = new Set<(s: string) => void>()
  closed = false
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
vi.mock('@viz-cx/api', () => ({
  createApiClient: vi.fn(() => ({
    streamOps: vi.fn(() => {
      const s = new FakeStream()
      streams.push(s)
      return s
    }),
  })),
}))

const mockInnerCall = vi.fn().mockResolvedValue(undefined)
const mockCreateTxBuilder = vi.fn()

vi.mock('@viz-cx/core', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>
  return {
    ...real,
    createHttpTransport: vi.fn().mockReturnValue({ call: mockInnerCall }),
    createTxBuilder: mockCreateTxBuilder,
  }
})

const TEST_WIF = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' as Wif

const TRANSFER_BODY = { from: 'alice', to: 'bob', amount: '1.000 VIZ', memo: '', custom_sequence: 0 }

const SIGNED = {
  refBlockNum: 1234,
  refBlockPrefix: 5678,
  expiration: '2026-08-01T00:00:00',
  operations: [['transfer', TRANSFER_BODY]],
  extensions: [],
  signatures: ['deadbeef'],
} as unknown as SignedTransaction

/** Builds a tx via any action so we can grab the transport actions.ts wired up. */
async function captureTransport(): Promise<Transport> {
  const broadcast = vi.fn().mockResolvedValue(undefined)
  mockCreateTxBuilder.mockReturnValue({ transfer: () => ({ sign: () => ({ broadcast }) }) })
  const { sendTransfer } = await import('@/lib/actions')
  await sendTransfer(TEST_WIF, 'alice', 'bob', '1.000 VIZ')
  return mockCreateTxBuilder.mock.calls[0][0].transport as Transport
}

const last = () => streams[streams.length - 1]
/** Let the transport's pending awaits run without advancing the clock. */
const tick = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  streams.length = 0
  vi.clearAllMocks()
  mockInnerCall.mockResolvedValue(undefined)
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('makeBroadcastTransport', () => {
  it('waits for the confirmation socket before broadcasting', async () => {
    const transport = await captureTransport()
    const pending = transport.broadcast(SIGNED)
    await tick()
    expect(mockInnerCall).not.toHaveBeenCalled()

    last().open()
    await tick()
    expect(mockInnerCall).toHaveBeenCalledWith('network_broadcast_api.broadcast_transaction', [
      {
        ref_block_num: 1234,
        ref_block_prefix: 5678,
        expiration: '2026-08-01T00:00:00',
        operations: SIGNED.operations,
        extensions: [],
        signatures: ['deadbeef'],
      },
    ])

    last().emit({ opType: 'transfer', opId: '82129071.00001', body: { from: 'alice', to: 'bob', amount: '1.000 VIZ', memo: '' } })
    await expect(pending).resolves.toEqual({ id: '', blockNum: 82129071, expiration: '2026-08-01T00:00:00' })
    expect(last().closed).toBe(true)
  })

  it('rejects when no matching op arrives before the timeout', async () => {
    const { CONFIRM_TIMEOUT_MS } = await import('@/lib/broadcast-confirm')
    const transport = await captureTransport()
    const pending = transport.broadcast(SIGNED)
    // Attach the rejection handler up front, or advancing the clock surfaces it
    // as an unhandled rejection before the assertion gets to it.
    const rejects = expect(pending).rejects.toThrow(/no matching operation appeared on-chain/)
    await tick()
    last().open()
    await tick()

    await vi.advanceTimersByTimeAsync(CONFIRM_TIMEOUT_MS)
    await rejects
    expect(last().closed).toBe(true)
  })

  it('resolves unverified when the confirmation socket never opens', async () => {
    const { SOCKET_OPEN_TIMEOUT_MS } = await import('@/lib/broadcast-confirm')
    const transport = await captureTransport()
    const pending = transport.broadcast(SIGNED)
    await vi.advanceTimersByTimeAsync(SOCKET_OPEN_TIMEOUT_MS)
    await expect(pending).resolves.toEqual({ id: '', blockNum: 0, expiration: '2026-08-01T00:00:00' })
    expect(mockInnerCall).toHaveBeenCalledOnce()
    expect(last().closed).toBe(true)
  })

  it('propagates an RPC-level broadcast error without waiting for confirmation', async () => {
    mockInnerCall.mockRejectedValueOnce(new Error('missing required active authority'))
    const transport = await captureTransport()
    const pending = transport.broadcast(SIGNED)
    await tick()
    last().open()
    await expect(pending).rejects.toThrow('missing required active authority')
    expect(last().closed).toBe(true)
  })
})
