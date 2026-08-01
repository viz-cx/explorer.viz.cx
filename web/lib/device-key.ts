/**
 * The device key: a single AES-GCM key generated with `extractable: false` and
 * stored in IndexedDB as a CryptoKey object rather than as bytes. Script can
 * pass it to crypto.subtle.decrypt but can never read its material —
 * exportKey() throws. This is what makes a localStorage dump useless.
 *
 * Returns null when IndexedDB is unavailable (private browsing, blocked site
 * storage). Callers must then run memory-only. There is deliberately NO
 * localStorage fallback — that was the vulnerability this module replaces.
 */

const DB_NAME = 'viz-wallet'
const STORE = 'keys'
const KEY_ID = 'device-key'

let cached: Promise<CryptoKey | null> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexedDB blocked'))
  })
}

function readKey(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID)
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
    req.onerror = () => reject(req.error)
  })
}

function writeKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(key, KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function loadOrCreate(): Promise<CryptoKey | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDb()
    const existing = await readKey(db)
    if (existing) return existing
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable — do not change
      ['encrypt', 'decrypt']
    )
    await writeKey(db, key)
    return key
  } catch {
    return null
  }
}

export function getDeviceKey(): Promise<CryptoKey | null> {
  if (!cached) cached = loadOrCreate()
  return cached
}

/** Test-only: clears the in-module cache so a fresh page load can be simulated. */
export function __resetDeviceKeyCache(): void {
  cached = null
}
