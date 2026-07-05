'use client'
import { useEffect, useState } from 'react'
import { publicKey, type ChainProperties } from '@viz-cx/core'
import { useWallet } from '@/lib/wallet'
import { fetchValidator, propsFromRaw, type RawValidator } from '@/lib/validator'
import { updateValidator, goIdleValidator, updateChainProperties } from '@/lib/actions'
import { ValidatorStatusCard } from '@/components/ValidatorStatusCard'
import { ChainPropertiesForm } from '@/components/ChainPropertiesForm'
import { withNode } from '@/lib/core'
import { formatAsset } from '@/lib/format'

type Step = 'idle' | 'confirm-register' | 'confirm-idle' | 'confirm-props'

const DEFAULT_PROPS: ChainProperties = {
  accountCreationFee: '1.000 VIZ',
  maximumBlockSize: 131072,
  createAccountDelegationRatio: 10,
  createAccountDelegationTime: 2592000,
  minDelegation: '0.001 VIZ',
  minCurationPercent: 1600,
  maxCurationPercent: 1600,
  bandwidthReservePercent: 1000,
  bandwidthReserveBelow: '500.000000 SHARES',
  flagEnergyAdditionalCost: 0,
  voteAccountingMinRshares: 5000000,
  committeeRequestApproveMinPercent: 1000,
  inflationValidatorPercent: 2000,
  inflationRatioCommitteeVsRewardFund: 5000,
  inflationRecalcPeriod: 806400,
  dataOperationsCostAdditionalBandwidth: 0,
  validatorMissPenaltyPercent: 100,
  validatorMissPenaltyDuration: 86400,
  createInviteMinBalance: '10.000 VIZ',
  committeeCreateRequestFee: '100.000 VIZ',
  createPaidSubscriptionFee: '100.000 VIZ',
  accountOnSaleFee: '10.000 VIZ',
  subaccountOnSaleFee: '100.000 VIZ',
  validatorDeclarationFee: '10.000 VIZ',
  withdrawIntervals: 28,
  distributionEpochLength: 28800,
}

export default function ValidatorManagePage() {
  const wallet = useWallet()
  const [validator, setValidator] = useState<RawValidator | null>(null)
  const [declarationFee, setDeclarationFee] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState('')
  const [signingKey, setSigningKey] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [pendingProps, setPendingProps] = useState<ChainProperties | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Flag loading when the connected account changes (render-phase, before paint).
  const [prevAccount, setPrevAccount] = useState(wallet.account)
  if (prevAccount !== wallet.account) {
    setPrevAccount(wallet.account)
    if (wallet.connected && wallet.account) setLoading(true)
  }

  useEffect(() => {
    if (!wallet.connected || !wallet.account) return
    let cancelled = false
    fetchValidator(wallet.account).then((v) => {
      if (cancelled) return
      setValidator(v)
      if (v) { setUrl(v.url ?? ''); setSigningKey(v.signing_key ?? '') }
    }).finally(() => { if (!cancelled) setLoading(false) })
    withNode((api) => api.getDynamicGlobalProperties())
      .then((dgp) => fetchValidator(dgp.current_witness))
      .then((top) => {
        if (cancelled || !top?.props) return
        const fee = (top.props as Record<string, unknown>)['validator_declaration_fee']
        if (typeof fee === 'string') setDeclarationFee(fee)
      })
      .catch(() => {/* non-fatal */})
    return () => { cancelled = true }
  }, [wallet.connected, wallet.account])

  /** Navigate between steps, clearing any stale success/error feedback. */
  function goStep(s: Step) {
    setError(null)
    setDone(false)
    setStep(s)
  }

  function handleRegisterSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!url || !signingKey) { setError('URL and signing key are required'); return }
    try {
      publicKey(signingKey)
    } catch {
      setError('Invalid block-signing public key format')
      return
    }
    goStep('confirm-register')
  }

  async function handleConfirmRegister() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setBusy(true); setError(null); setDone(false)
    try {
      await updateValidator(wif, wallet.account!, url, signingKey)
      setDone(true)
      const v = await fetchValidator(wallet.account!)
      setValidator(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setBusy(false); setStep('idle') }
  }

  async function handleConfirmIdle() {
    const wif = wallet.keyFor('active')
    if (!wif) { setError('Active key required'); return }
    setBusy(true); setError(null); setDone(false)
    try {
      await goIdleValidator(wif, wallet.account!, url)
      setDone(true)
      const v = await fetchValidator(wallet.account!)
      setValidator(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setBusy(false); setStep('idle') }
  }

  function handlePropsSubmit(props: ChainProperties) {
    setPendingProps(props)
    goStep('confirm-props')
  }

  async function handleConfirmProps() {
    const wif = wallet.keyFor('active')
    if (!wif || !pendingProps) { setError('Active key required'); return }
    setBusy(true); setError(null); setDone(false)
    try {
      await updateChainProperties(wif, wallet.account!, pendingProps)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally { setBusy(false); setStep('idle'); setPendingProps(null) }
  }

  if (!wallet.connected) {
    return (
      <div className="flex flex-col items-center gap-6 py-24">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Manage My Validator</h1>
        <p className="font-prose text-sm text-fg-muted">Connect your VIZ key to manage your validator.</p>
        <button
          onClick={() => wallet.openModal('connect')}
          className="rounded-md bg-acc-green px-6 py-2 font-prose text-sm font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Connect
        </button>
      </div>
    )
  }

  if (!wallet.keyFor('active')) {
    return (
      <div className="flex flex-col items-center gap-6 py-24">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Manage My Validator</h1>
        <p className="font-prose text-sm text-fg-muted">An active key is required to manage a validator.</p>
        <button
          onClick={() => wallet.openModal('add-key')}
          className="rounded-md bg-acc-green px-6 py-2 font-prose text-sm font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Add active key
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Manage My Validator</h1>

      {loading ? (
        <p className="font-prose text-sm text-fg-dim">Loading…</p>
      ) : (
        <ValidatorStatusCard validator={validator} declarationFee={declarationFee ? formatAsset(declarationFee) : null} />
      )}

      {error && <p className="font-prose text-sm text-acc-red">{error}</p>}
      {done && <p className="font-prose text-sm text-acc-green">✓ Submitted</p>}

      {step === 'confirm-register' ? (
        <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
          <p className="font-prose text-sm text-fg">
            {validator ? 'Update' : 'Register'} validator <span className="font-mono text-fg-muted">{wallet.account}</span> with URL{' '}
            <span className="font-mono text-fg-muted">{url}</span> and signing key{' '}
            <span className="font-mono text-fg-muted">{signingKey}</span>?
          </p>
          <div className="flex gap-2">
            <button onClick={() => goStep('idle')} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Back</button>
            <button onClick={handleConfirmRegister} disabled={busy} className="flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50">
              {busy ? 'Processing…' : 'Confirm'}
            </button>
          </div>
        </div>
      ) : step === 'confirm-idle' ? (
        <div className="flex flex-col gap-3 rounded border border-acc-red/40 bg-acc-red/10 p-4">
          <p className="font-prose text-sm text-fg">
            This stops block production for <span className="font-mono text-fg-muted">{wallet.account}</span>. Continue?
          </p>
          <div className="flex gap-2">
            <button onClick={() => goStep('idle')} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Back</button>
            <button onClick={handleConfirmIdle} disabled={busy} className="flex-1 rounded bg-acc-red py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50">
              {busy ? 'Processing…' : 'Go idle'}
            </button>
          </div>
        </div>
      ) : step === 'confirm-props' ? (
        <div className="flex flex-col gap-3 rounded border border-acc-amber/40 bg-acc-amber/10 p-4">
          <p className="font-prose text-sm text-fg">
            Submit a new chain-properties vote for <span className="font-mono text-fg-muted">{wallet.account}</span>? This affects network-wide consensus parameters via median.
          </p>
          <div className="flex gap-2">
            <button onClick={() => goStep('idle')} className="flex-1 rounded border border-border py-2 font-prose text-sm text-fg-muted hover:text-fg">Back</button>
            <button onClick={handleConfirmProps} disabled={busy} className="flex-1 rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas disabled:opacity-50">
              {busy ? 'Processing…' : 'Confirm'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
            <h2 className="font-prose text-xs font-semibold uppercase tracking-widest text-fg-muted">
              {validator ? 'Update' : 'Register'}
            </h2>
            <div className="flex flex-col gap-1">
              <label htmlFor="validator-url" className="font-prose text-[11px] text-fg-dim">URL</label>
              <input
                id="validator-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://t.me/yourhandle"
                className="rounded border border-border bg-surface-2 px-3 py-1.5 font-mono text-sm text-fg focus:border-border-strong focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="validator-key" className="font-prose text-[11px] text-fg-dim">Block-signing public key</label>
              <input
                id="validator-key"
                type="text"
                value={signingKey}
                onChange={(e) => setSigningKey(e.target.value)}
                placeholder="VIZ..."
                className="rounded border border-border bg-surface-2 px-3 py-1.5 font-mono text-sm text-fg focus:border-border-strong focus:outline-none"
              />
            </div>
            <button type="submit" className="w-full rounded bg-acc-green py-2 font-prose text-sm font-semibold text-canvas hover:opacity-90">
              Review
            </button>
            {validator && (
              <button
                type="button"
                onClick={() => goStep('confirm-idle')}
                className="w-full rounded border border-acc-red/40 py-2 font-prose text-sm text-acc-red hover:bg-acc-red/10"
              >
                Go idle
              </button>
            )}
          </form>

          {validator && (
            <ChainPropertiesForm
              initial={validator.props ? propsFromRaw(validator.props) : DEFAULT_PROPS}
              onSubmit={handlePropsSubmit}
              submitting={busy}
            />
          )}
        </>
      )}
    </div>
  )
}
