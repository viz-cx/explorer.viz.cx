import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveWallet, loadWallet, clearWallet } from '@/lib/wallet-storage'
import { __resetDeviceKeyCache } from '@/lib/device-key'

const REGULAR = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'
const ACTIVE = '5JLw5dgQAx6rhZEgNN5C2ds1V47RweGshynFSWFbaMohsYsBvE8'

// Builds a legacy record exactly as the pre-migration code wrote it:
// an extractable AES-GCM key base64'd into viz_wallet_ek, ciphertext in viz_wallet.
async function seedLegacy(account: string, keys: { regular?: string; active?: string }) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem('viz_wallet_ek', btoa(String.fromCharCode(...new Uint8Array(raw))))

  const enc = async (wif: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(wif))
    const combined = new Uint8Array(12 + ct.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ct), 12)
    return btoa(String.fromCharCode(...combined))
  }

  const encrypted: { regular?: string; active?: string } = {}
  if (keys.regular) encrypted.regular = await enc(keys.regular)
  if (keys.active) encrypted.active = await enc(keys.active)
  localStorage.setItem('viz_wallet', JSON.stringify({ account, keys: encrypted }))
}

describe('wallet-storage', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetDeviceKeyCache()
  })

  it('round-trips both keys', async () => {
    expect(await saveWallet('alice', { regular: REGULAR, active: ACTIVE })).toEqual({ persisted: true })
    expect(await loadWallet()).toEqual({ account: 'alice', keys: { regular: REGULAR, active: ACTIVE } })
  })

  it('round-trips a regular-only wallet', async () => {
    await saveWallet('alice', { regular: REGULAR })
    expect(await loadWallet()).toEqual({ account: 'alice', keys: { regular: REGULAR } })
  })

  it('round-trips an active-only wallet', async () => {
    await saveWallet('alice', { active: ACTIVE })
    expect(await loadWallet()).toEqual({ account: 'alice', keys: { active: ACTIVE } })
  })

  it('never writes key material readable from localStorage', async () => {
    await saveWallet('alice', { regular: REGULAR, active: ACTIVE })
    const dump = JSON.stringify(localStorage.getItem('viz_wallet_v2'))
    expect(dump).not.toContain(REGULAR)
    expect(dump).not.toContain(ACTIVE)
    expect(localStorage.getItem('viz_wallet_ek')).toBeNull()
  })

  it('returns null when nothing is stored', async () => {
    expect(await loadWallet()).toBeNull()
  })

  it('returns null on a corrupt record instead of throwing', async () => {
    localStorage.setItem('viz_wallet_v2', '{ not json')
    expect(await loadWallet()).toBeNull()
  })

  it('clearWallet removes the record and both legacy entries', async () => {
    await saveWallet('alice', { regular: REGULAR })
    localStorage.setItem('viz_wallet', 'x')
    localStorage.setItem('viz_wallet_ek', 'y')
    clearWallet()
    expect(localStorage.getItem('viz_wallet_v2')).toBeNull()
    expect(localStorage.getItem('viz_wallet')).toBeNull()
    expect(localStorage.getItem('viz_wallet_ek')).toBeNull()
  })

  describe('legacy migration', () => {
    it('carries both keys over and deletes the legacy entries', async () => {
      await seedLegacy('alice', { regular: REGULAR, active: ACTIVE })

      expect(await loadWallet()).toEqual({ account: 'alice', keys: { regular: REGULAR, active: ACTIVE } })

      expect(localStorage.getItem('viz_wallet')).toBeNull()
      expect(localStorage.getItem('viz_wallet_ek')).toBeNull()
      expect(localStorage.getItem('viz_wallet_v2')).not.toBeNull()
    })

    it('the migrated record is readable on the next load', async () => {
      await seedLegacy('alice', { regular: REGULAR })
      await loadWallet()
      __resetDeviceKeyCache() // next page load
      expect(await loadWallet()).toEqual({ account: 'alice', keys: { regular: REGULAR } })
    })

    it('discards a legacy record whose EK is missing', async () => {
      await seedLegacy('alice', { regular: REGULAR })
      localStorage.removeItem('viz_wallet_ek')
      expect(await loadWallet()).toBeNull()
      expect(localStorage.getItem('viz_wallet')).toBeNull()
    })
  })

  describe('when IndexedDB is unavailable', () => {
    const real = globalThis.indexedDB

    afterEach(() => {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, writable: true, configurable: true })
      __resetDeviceKeyCache()
    })

    it('reports memory-only and writes nothing to localStorage', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: { open: () => { throw new Error('storage blocked') } },
        writable: true,
        configurable: true,
      })
      __resetDeviceKeyCache()

      expect(await saveWallet('alice', { regular: REGULAR })).toEqual({ persisted: false })
      expect(localStorage.getItem('viz_wallet_v2')).toBeNull()
      expect(await loadWallet()).toBeNull()
    })
  })
})
