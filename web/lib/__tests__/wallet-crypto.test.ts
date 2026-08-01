import { describe, it, expect } from 'vitest'
import { encryptWith, decryptWith } from '@/lib/wallet-crypto'

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

const TEST_WIF = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'

describe('wallet-crypto', () => {
  it('encrypt → decrypt round-trip returns original WIF', async () => {
    const key = await makeKey()
    const ct = await encryptWith(key, TEST_WIF)
    expect(await decryptWith(key, ct)).toBe(TEST_WIF)
  })

  it('decrypting with a different key returns null', async () => {
    const ct = await encryptWith(await makeKey(), TEST_WIF)
    expect(await decryptWith(await makeKey(), ct)).toBeNull()
  })

  it('encrypting the same WIF twice produces different ciphertext (IV randomness)', async () => {
    const key = await makeKey()
    expect(await encryptWith(key, TEST_WIF)).not.toBe(await encryptWith(key, TEST_WIF))
  })

  it('returns null on malformed ciphertext instead of throwing', async () => {
    expect(await decryptWith(await makeKey(), 'not-base64-$$$')).toBeNull()
  })
})
