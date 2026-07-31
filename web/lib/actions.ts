import {
  account,
  createHttpTransport,
  createTxBuilder,
  DEFAULT_EXPIRATION_SEC,
  HF13_PROPS_VERSION,
  type ChainProperties,
  type PublicKey,
  type SignedTransaction,
  type Transport,
  type TransactionResult,
  type Wif,
} from '@viz-cx/core'
import { BroadcastUnconfirmedError, CONFIRM_TIMEOUT_MS, watchForOp } from './broadcast-confirm'
import { NODE_ENDPOINTS } from './config'
import { NULL_SIGNING_KEY } from './validator'

// The VIZ node's broadcast_transaction_synchronous hangs indefinitely for
// non-expired transactions on this node setup. Use the async variant instead —
// and because that variant only confirms the *call* was accepted, not that the
// tx validated, wait for the op to actually appear on the live stream before
// reporting success. See lib/broadcast-confirm.ts.
function makeBroadcastTransport(inner: Transport): Transport {
  return {
    call: inner.call.bind(inner),
    async broadcast(signed: SignedTransaction): Promise<TransactionResult> {
      const wire = {
        ref_block_num: signed.refBlockNum,
        ref_block_prefix: signed.refBlockPrefix,
        expiration: signed.expiration,
        operations: signed.operations,
        extensions: signed.extensions,
        signatures: signed.signatures,
      }
      // Every action here builds a single-op tx, so the first op identifies it.
      const first = signed.operations[0]
      const watcher = first ? watchForOp(first[0], first[1]) : null
      try {
        const listening = watcher ? await watcher.opened : false
        await inner.call('network_broadcast_api.broadcast_transaction', [wire])
        // No live stream to confirm against: fall back to the old unverified
        // behaviour rather than failing a tx that most likely went through.
        if (!watcher || !listening) return { id: '', blockNum: 0, expiration: signed.expiration }

        const outcome = await watcher.waitForMatch(CONFIRM_TIMEOUT_MS)
        if (outcome.status !== 'confirmed') throw new BroadcastUnconfirmedError()
        return { id: '', blockNum: outcome.blockNum, expiration: signed.expiration }
      } finally {
        watcher?.stop()
      }
    },
  }
}

function makeBuilder() {
  const transport = makeBroadcastTransport(createHttpTransport(NODE_ENDPOINTS[0]))
  return createTxBuilder({ transport, expirationSec: DEFAULT_EXPIRATION_SEC })
}

export async function awardAccount(
  wif: Wif,
  initiator: string,
  receiver: string,
  energyPct: number,
  memo?: string
): Promise<void> {
  await makeBuilder()
    .award({ initiator: account(initiator), receiver: account(receiver), energy: energyPct * 100, memo })
    .sign(wif)
    .broadcast()
}

export async function sendTransfer(
  wif: Wif,
  from: string,
  to: string,
  amount: string,
  memo?: string
): Promise<void> {
  await makeBuilder()
    .transfer({ from: account(from), to: account(to), amount, memo })
    .sign(wif)
    .broadcast()
}

export async function powerUp(
  wif: Wif,
  from: string,
  to: string,
  amount: string
): Promise<void> {
  await makeBuilder()
    .transferToVesting({ from: account(from), to: account(to), amount })
    .sign(wif)
    .broadcast()
}

export async function powerDown(
  wif: Wif,
  accountName: string,
  vestingShares: string
): Promise<void> {
  await makeBuilder()
    .withdrawVesting({ account: account(accountName), vestingShares })
    .sign(wif)
    .broadcast()
}

export async function delegateShares(
  wif: Wif,
  delegator: string,
  delegatee: string,
  vestingShares: string
): Promise<void> {
  await makeBuilder()
    .delegateVestingShares({ delegator: account(delegator), delegatee: account(delegatee), vestingShares })
    .sign(wif)
    .broadcast()
}

export async function voteValidator(
  wif: Wif,
  accountName: string,
  validator: string,
  approve: boolean
): Promise<void> {
  await makeBuilder()
    .accountValidatorVote({ account: account(accountName), validator: account(validator), approve })
    .sign(wif)
    .broadcast()
}

export async function setValidatorProxy(
  wif: Wif,
  accountName: string,
  proxy: string
): Promise<void> {
  await makeBuilder()
    .accountValidatorProxy({
      account: account(accountName),
      proxy: proxy === '' ? '' : account(proxy),
    })
    .sign(wif)
    .broadcast()
}

export async function createProposal(
  wif: Wif,
  creator: string,
  worker: string,
  url: string,
  requiredAmountMin: string,
  requiredAmountMax: string,
  duration: number
): Promise<void> {
  await makeBuilder()
    .committeeWorkerCreateRequest({ creator: account(creator), worker: account(worker), url, requiredAmountMin, requiredAmountMax, duration })
    .sign(wif)
    .broadcast()
}

export async function voteProposal(
  wif: Wif,
  voter: string,
  requestId: number,
  votePercent: number
): Promise<void> {
  await makeBuilder()
    .committeeVoteRequest({ voter: account(voter), requestId, votePercent })
    .sign(wif)
    .broadcast()
}

export async function cancelProposal(
  wif: Wif,
  creator: string,
  requestId: number
): Promise<void> {
  await makeBuilder()
    .committeeWorkerCancelRequest({ creator: account(creator), requestId })
    .sign(wif)
    .broadcast()
}

export async function updateValidator(
  wif: Wif,
  owner: string,
  url: string,
  blockSigningKey: string
): Promise<void> {
  await makeBuilder()
    .validatorUpdate({ owner: account(owner), url, blockSigningKey: blockSigningKey as PublicKey })
    .sign(wif)
    .broadcast()
}

export async function goIdleValidator(wif: Wif, owner: string, url: string): Promise<void> {
  await updateValidator(wif, owner, url, NULL_SIGNING_KEY)
}

export async function updateChainProperties(
  wif: Wif,
  owner: string,
  props: ChainProperties
): Promise<void> {
  await makeBuilder()
    .versionedChainPropertiesUpdate({ owner: account(owner), props: [HF13_PROPS_VERSION, props] })
    .sign(wif)
    .broadcast()
}
