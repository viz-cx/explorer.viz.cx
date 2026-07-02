import { describe, it, expect } from 'vitest'
import { keys, type Wif } from '@viz-cx/core'
import { resolveRoleMap, keyForRole, signableRoles, type KeyCandidate } from '@/lib/wallet-roles'

// Deterministic fixtures derived from a master password — no hardcoded pubkeys.
const ACC = 'alice'
const PW = 'hunter2hunter2'
const regularWif = keys.fromPassword(ACC, PW, 'regular')
const activeWif = keys.fromPassword(ACC, PW, 'active')
// @viz-cx/core derives the master key under the role name 'owner'; on-chain it
// populates `master_authority`.
const masterWif = keys.fromPassword(ACC, PW, 'owner')
const memoWif = keys.fromPassword(ACC, PW, 'memo')

const pub = (w: Wif) => String(keys.toPublic(w))
const cand = (w: Wif): KeyCandidate => ({ wif: w, pub: pub(w) })

// Raw RPC-shaped account: each authority lists [pubkey, weight] pairs.
function rawAccount(opts: { regular?: Wif; active?: Wif; master?: Wif }) {
  const auth = (w?: Wif) => (w ? { key_auths: [[pub(w), 1]] } : { key_auths: [] })
  return {
    regular_authority: auth(opts.regular),
    active_authority: auth(opts.active),
    master_authority: auth(opts.master),
  } as Record<string, unknown>
}

describe('resolveRoleMap', () => {
  const raw = rawAccount({ regular: regularWif, active: activeWif, master: masterWif })

  it('maps an active key to the active role', () => {
    const m = resolveRoleMap(raw, [cand(activeWif)])
    expect(m.get('active')).toBe(activeWif)
    expect(m.has('regular')).toBe(false)
  })

  it('maps a regular key to the regular role', () => {
    const m = resolveRoleMap(raw, [cand(regularWif)])
    expect(m.get('regular')).toBe(regularWif)
    expect(m.has('active')).toBe(false)
  })

  it('maps a master key to the active role (master grants active)', () => {
    const m = resolveRoleMap(raw, [cand(masterWif)])
    expect(m.get('active')).toBe(masterWif)
  })

  it('prefers the direct active key over the master key for the active slot', () => {
    const m = resolveRoleMap(raw, [cand(masterWif), cand(activeWif)])
    expect(m.get('active')).toBe(activeWif)
  })

  it('fills both slots from a full password derivation', () => {
    const m = resolveRoleMap(raw, [cand(masterWif), cand(activeWif), cand(regularWif)])
    expect(m.get('active')).toBe(activeWif)
    expect(m.get('regular')).toBe(regularWif)
  })

  it('stores a single key under both roles when it is in both authorities', () => {
    const shared = rawAccount({ regular: activeWif, active: activeWif })
    const m = resolveRoleMap(shared, [cand(activeWif)])
    expect(m.get('active')).toBe(activeWif)
    expect(m.get('regular')).toBe(activeWif)
  })

  it('returns an empty map for a key in no authority (e.g. memo)', () => {
    const m = resolveRoleMap(raw, [cand(memoWif)])
    expect(m.size).toBe(0)
  })

  it('only keeps password-derived keys that match (rotated keys)', () => {
    // Account whose on-chain active key is NOT the password-derived one.
    const rotated = rawAccount({ regular: regularWif, active: masterWif })
    const m = resolveRoleMap(rotated, [cand(masterWif), cand(activeWif), cand(regularWif)])
    expect(m.get('regular')).toBe(regularWif)
    expect(m.get('active')).toBe(masterWif) // active authority holds the master-derived pub
  })
})

describe('keyForRole', () => {
  it('prefers the regular key for a regular op (least privilege)', () => {
    expect(keyForRole({ regular: regularWif, active: activeWif }, 'regular')).toBe(regularWif)
  })

  it('falls back UP to active for a regular op when no regular key is held', () => {
    expect(keyForRole({ active: activeWif }, 'regular')).toBe(activeWif)
  })

  it('returns the regular key for a regular op when only regular is held', () => {
    expect(keyForRole({ regular: regularWif }, 'regular')).toBe(regularWif)
  })

  it('never climbs DOWN: a regular-only wallet cannot satisfy an active op', () => {
    expect(keyForRole({ regular: regularWif }, 'active')).toBeUndefined()
  })

  it('returns the active key for an active op', () => {
    expect(keyForRole({ active: activeWif }, 'active')).toBe(activeWif)
  })

  it('returns undefined when no key is held', () => {
    expect(keyForRole({}, 'regular')).toBeUndefined()
    expect(keyForRole({}, 'active')).toBeUndefined()
  })
})

describe('signableRoles', () => {
  it('returns [active] for an active-only key match', () => {
    const raw = rawAccount({ regular: regularWif, active: activeWif, master: masterWif })
    expect(signableRoles(raw, cand(activeWif))).toEqual(['active'])
  })

  it('returns [regular] for a regular-only key match', () => {
    const raw = rawAccount({ regular: regularWif, active: activeWif, master: masterWif })
    expect(signableRoles(raw, cand(regularWif))).toEqual(['regular'])
  })

  it('returns [regular, active] when a shared key sits in both authorities', () => {
    const shared = rawAccount({ regular: activeWif, active: activeWif })
    expect(signableRoles(shared, cand(activeWif))).toEqual(['regular', 'active'])
  })

  it('returns [] for a memo-only (non-signing) key', () => {
    const raw = rawAccount({ regular: regularWif, active: activeWif, master: masterWif })
    expect(signableRoles(raw, cand(memoWif))).toEqual([])
  })

  it('returns [] when the key belongs to no authority on this account', () => {
    const other = rawAccount({ regular: regularWif })
    expect(signableRoles(other, cand(activeWif))).toEqual([])
  })
})
