import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDeviceKey, __resetDeviceKeyCache } from '@/lib/device-key'
import { encryptWith, decryptWith } from '@/lib/wallet-crypto'

describe('device-key', () => {
  beforeEach(() => { __resetDeviceKeyCache() })

  it('returns a non-extractable AES-GCM key', async () => {
    const key = await getDeviceKey()
    expect(key).not.toBeNull()
    expect(key!.extractable).toBe(false)
    expect(key!.algorithm.name).toBe('AES-GCM')
  })

  it('exportKey on the device key throws', async () => {
    const key = await getDeviceKey()
    await expect(crypto.subtle.exportKey('raw', key!)).rejects.toThrow()
  })

  it('returns the identical key object within a session (cached)', async () => {
    expect(await getDeviceKey()).toBe(await getDeviceKey())
  })

  it('persists across a simulated reload — ciphertext from before still decrypts', async () => {
    const first = await getDeviceKey()
    const ct = await encryptWith(first!, 'hello')

    __resetDeviceKeyCache() // simulates a fresh page load
    const second = await getDeviceKey()

    expect(await decryptWith(second!, ct)).toBe('hello')
  })

  describe('when IndexedDB is unavailable', () => {
    const real = globalThis.indexedDB

    afterEach(() => {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, writable: true, configurable: true })
    })

    it('returns null when open() throws', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: { open: () => { throw new Error('storage blocked') } },
        writable: true,
        configurable: true,
      })
      __resetDeviceKeyCache()
      expect(await getDeviceKey()).toBeNull()
    })
  })
})
