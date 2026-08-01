// Test environment is `node`, which has neither IndexedDB nor localStorage.
// fake-indexeddb/auto installs a spec-compliant indexedDB on globalThis; it
// round-trips non-extractable CryptoKey objects correctly (verified against
// fake-indexeddb 6.2.5).
import 'fake-indexeddb/auto'

const store: Record<string, string> = {}

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  },
  writable: true,
  configurable: true,
})
