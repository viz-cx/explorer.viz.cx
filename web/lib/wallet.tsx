'use client'
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { keys, createHttpTransport, createReadApi, type Wif } from '@viz-cx/core'
import { saveWallet, loadWallet, clearWallet } from './wallet-storage'
import { resolveRoleMap, keyForRole, signableRoles, type WalletRole } from './wallet-roles'
import { API_BASE, NODE_ENDPOINTS } from './config'

export type ModalMode = 'connect' | 'add-key'

export interface AccountMatch {
  account: string
  roles: WalletRole[]
}

export interface WalletState {
  account: string | null
  walletKeys: { regular?: Wif; active?: Wif }
  connected: boolean
  modalOpen: boolean
  modalMode: ModalMode
  connect(account: string, input: string): Promise<WalletRole[]>
  discoverAccounts(input: string): Promise<AccountMatch[]>
  addKey(input: string): Promise<WalletRole[]>
  disconnect(): void
  keyFor(role: WalletRole): Wif | undefined
  openModal(mode?: ModalMode): void
  closeModal(): void
}

const WalletContext = createContext<WalletState | null>(null)

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}

// Build candidate keys from raw input: a WIF is itself the only candidate; a
// master password derives one key per signing-capable role (memo can't sign).
function inputCandidates(acc: string, input: string): Wif[] {
  if (keys.isWif(input)) return [input as Wif]
  const ks = keys.fromPassword(acc, input)
  return [ks.owner, ks.active, ks.regular]
}

async function resolveKeyRoles(acc: string, input: string): Promise<Map<WalletRole, Wif>> {
  const transport = createHttpTransport(NODE_ENDPOINTS[0])
  const api = createReadApi(transport)
  const [accountData] = await api.lookupAccountNames([acc])
  if (!accountData) throw new Error('Account not found')
  const raw = accountData as unknown as Record<string, unknown>
  const candidates = inputCandidates(acc, input).map((wif) => ({
    wif,
    pub: String(keys.toPublic(wif)),
  }))
  const map = resolveRoleMap(raw, candidates)
  if (map.size === 0) throw new Error(`This key doesn't belong to @${acc}`)
  return map
}

async function discoverByKey(input: string): Promise<AccountMatch[]> {
  if (!keys.isWif(input)) {
    throw new Error('Automatic lookup needs a WIF key')
  }
  const wif = input as Wif
  const pub = String(keys.toPublic(wif))

  const res = await fetch(`${API_BASE}/key-references?pub=${encodeURIComponent(pub)}`)
  if (!res.ok) throw new Error(`Key lookup failed (${res.status})`)
  const { accounts: names } = (await res.json()) as { accounts: string[] }
  if (names.length === 0) return []

  const transport = createHttpTransport(NODE_ENDPOINTS[0])
  const api = createReadApi(transport)
  const accountsData = await api.lookupAccountNames(names)
  const matches: AccountMatch[] = []
  accountsData.forEach((accountData, i) => {
    if (!accountData) return
    const raw = accountData as unknown as Record<string, unknown>
    const roles = signableRoles(raw, { wif, pub })
    if (roles.length > 0) matches.push({ account: names[i], roles })
  })
  return matches
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [walletKeys, setWalletKeys] = useState<{ regular?: Wif; active?: Wif }>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('connect')

  useEffect(() => {
    loadWallet()
      .then((stored) => {
        if (stored?.account) {
          setAccount(stored.account)
          setWalletKeys({
            regular: stored.keys.regular as Wif | undefined,
            active: stored.keys.active as Wif | undefined,
          })
        }
      })
      .catch((err) => {
        console.warn('[wallet] Failed to restore wallet, clearing corrupted state:', err)
        clearWallet()
      })
  }, [])

  const connect = useCallback(async (acc: string, input: string): Promise<WalletRole[]> => {
    const map = await resolveKeyRoles(acc, input)
    const keysToStore = Object.fromEntries(map) as { regular?: Wif; active?: Wif }
    await saveWallet(acc, keysToStore as { regular?: string; active?: string })
    setAccount(acc)
    setWalletKeys(keysToStore)
    return [...map.keys()]
  }, [])

  const discoverAccounts = useCallback(
    (input: string): Promise<AccountMatch[]> => discoverByKey(input),
    []
  )

  const addKey = useCallback(
    async (input: string): Promise<WalletRole[]> => {
      if (!account) throw new Error('Not connected')
      const map = await resolveKeyRoles(account, input)
      const newKeys = { ...walletKeys, ...Object.fromEntries(map) } as {
        regular?: Wif
        active?: Wif
      }
      await saveWallet(account, newKeys as { regular?: string; active?: string })
      setWalletKeys(newKeys)
      return [...map.keys()]
    },
    [account, walletKeys]
  )

  const disconnect = useCallback(() => {
    clearWallet()
    setAccount(null)
    setWalletKeys({})
  }, [])

  const keyFor = useCallback(
    (role: WalletRole) => keyForRole(walletKeys, role),
    [walletKeys]
  )

  const openModal = useCallback((mode: ModalMode = 'connect') => {
    setModalMode(mode)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <WalletContext.Provider
      value={{
        account,
        walletKeys,
        connected: account !== null,
        modalOpen,
        modalMode,
        connect,
        discoverAccounts,
        addKey,
        disconnect,
        keyFor,
        openModal,
        closeModal,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
