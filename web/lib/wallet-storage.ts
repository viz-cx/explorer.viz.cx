import { encryptWith, decryptWith } from './wallet-crypto'

const EK_KEY = 'viz_wallet_ek'
const WALLET_KEY = 'viz_wallet'

export interface StoredWallet {
  account: string
  keys: { regular?: string; active?: string }
}

async function getOrCreateEk(): Promise<CryptoKey> {
  const stored = localStorage.getItem(EK_KEY)
  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(EK_KEY, btoa(String.fromCharCode(...new Uint8Array(raw))))
  return key
}

export async function saveWallet(
  account: string,
  walletKeys: { regular?: string; active?: string }
): Promise<void> {
  const ek = await getOrCreateEk()
  const encrypted: { regular?: string; active?: string } = {}
  if (walletKeys.regular) encrypted.regular = await encryptWith(ek, walletKeys.regular)
  if (walletKeys.active) encrypted.active = await encryptWith(ek, walletKeys.active)
  localStorage.setItem(WALLET_KEY, JSON.stringify({ account, keys: encrypted }))
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const raw = localStorage.getItem(WALLET_KEY)
  if (!raw) return null
  let parsed: { account: string; keys: { regular?: string; active?: string } }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return null
  }
  const { account, keys } = parsed
  if (!account || typeof account !== 'string') return null
  const ek = await getOrCreateEk()
  const decrypted: { regular?: string; active?: string } = {}
  if (keys.regular) {
    const dec = await decryptWith(ek, keys.regular)
    if (!dec) return null
    decrypted.regular = dec
  }
  if (keys.active) {
    const dec = await decryptWith(ek, keys.active)
    if (!dec) return null
    decrypted.active = dec
  }
  return { account, keys: decrypted }
}

export function clearWallet(): void {
  localStorage.removeItem(WALLET_KEY)
  // Intentionally keeps viz_wallet_ek — reusable on next connect
}
