/**
 * AES-GCM primitives for wallet key storage. Pure — no storage access, no
 * globals beyond WebCrypto. Ciphertext is base64(iv ‖ ciphertext) with a
 * 12-byte random IV.
 */

export async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(12 + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), 12)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptWith(key: CryptoKey, ciphertext: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
