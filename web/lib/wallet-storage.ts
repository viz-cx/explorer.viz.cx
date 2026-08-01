import { encryptWith, decryptWith } from './wallet-crypto'
import { getDeviceKey } from './device-key'

const WALLET_KEY = 'viz_wallet_v2'
const LEGACY_WALLET_KEY = 'viz_wallet'
const LEGACY_EK_KEY = 'viz_wallet_ek'

export interface StoredWallet {
  account: string
  keys: { regular?: string; active?: string }
}

interface WalletRecord {
  v: 2
  account: string
  keys: { regular?: string; active?: string }
}

async function decryptKeys(
  account: string,
  keys: { regular?: string; active?: string },
  key: CryptoKey
): Promise<StoredWallet | null> {
  const decrypted: { regular?: string; active?: string } = {}
  if (keys.regular) {
    const d = await decryptWith(key, keys.regular)
    if (!d) return null
    decrypted.regular = d
  }
  if (keys.active) {
    const d = await decryptWith(key, keys.active)
    if (!d) return null
    decrypted.active = d
  }
  return { account, keys: decrypted }
}

/**
 * Migrates a pre-2026-08 record, which was encrypted with a key stored openly
 * in localStorage under `viz_wallet_ek`. Both keys carry over silently; the
 * legacy entries are always removed, success or failure, so the exposed EK
 * cannot survive a load.
 */
async function migrateLegacy(): Promise<StoredWallet | null> {
  const raw = localStorage.getItem(LEGACY_WALLET_KEY)
  if (!raw) return null

  const dropLegacy = () => {
    localStorage.removeItem(LEGACY_WALLET_KEY)
    localStorage.removeItem(LEGACY_EK_KEY)
  }

  try {
    const ekRaw = localStorage.getItem(LEGACY_EK_KEY)
    if (!ekRaw) return null

    const parsed = JSON.parse(raw) as { account?: string; keys?: { regular?: string; active?: string } }
    if (!parsed.account || typeof parsed.account !== 'string') return null

    const bytes = Uint8Array.from(atob(ekRaw), (c) => c.charCodeAt(0))
    const legacyKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])

    const plain = await decryptKeys(parsed.account, parsed.keys ?? {}, legacyKey)
    if (!plain) return null

    await saveWallet(plain.account, plain.keys)
    return plain
  } catch {
    return null
  } finally {
    dropLegacy()
  }
}

export async function saveWallet(
  account: string,
  walletKeys: { regular?: string; active?: string }
): Promise<{ persisted: boolean }> {
  const key = await getDeviceKey()
  if (!key) return { persisted: false }

  const encrypted: { regular?: string; active?: string } = {}
  if (walletKeys.regular) encrypted.regular = await encryptWith(key, walletKeys.regular)
  if (walletKeys.active) encrypted.active = await encryptWith(key, walletKeys.active)

  const record: WalletRecord = { v: 2, account, keys: encrypted }
  localStorage.setItem(WALLET_KEY, JSON.stringify(record))
  return { persisted: true }
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const migrated = await migrateLegacy()
  if (migrated) return migrated

  const raw = localStorage.getItem(WALLET_KEY)
  if (!raw) return null

  let parsed: WalletRecord
  try {
    parsed = JSON.parse(raw) as WalletRecord
  } catch {
    return null
  }
  if (!parsed?.account || typeof parsed.account !== 'string') return null

  const key = await getDeviceKey()
  if (!key) return null

  return decryptKeys(parsed.account, parsed.keys ?? {}, key)
}

export function clearWallet(): void {
  localStorage.removeItem(WALLET_KEY)
  localStorage.removeItem(LEGACY_WALLET_KEY)
  localStorage.removeItem(LEGACY_EK_KEY)
  // The IndexedDB device key stays — reusable on next connect, and useless on
  // its own once the ciphertext is gone.
}
