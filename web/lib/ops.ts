/**
 * Decode on-chain operations into plain-English, linkable sentences.
 *
 * Op bodies on the wire (getOpsInBlock / account history / ws stream) are
 * snake_case — distinct from @viz-cx/core's camelCase OperationMap *input*
 * types. Common types get a hand-written decoder; the long tail falls back to a
 * field summary + raw-JSON toggle (handled by the renderer).
 */

export type OpCategory = "transfer" | "award" | "governance" | "account" | "other";

export type OpPart =
  | { kind: "text"; text: string }
  | { kind: "account"; name: string }
  | { kind: "amount"; text: string; tone?: "pos" | "neg" | "neutral" }
  | { kind: "memo"; text: string };

export interface DecodedOp {
  /** raw op type, e.g. "transfer" */
  type: string;
  category: OpCategory;
  /** Human label, e.g. "Transfer", "Award" */
  label: string;
  /** The english sentence as renderable parts. */
  parts: OpPart[];
  /** Accounts touched (for chips / filtering). */
  accounts: string[];
}

type Body = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

function titleCase(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const CATEGORY: Record<string, OpCategory> = {
  transfer: "transfer",
  transfer_to_vesting: "transfer",
  withdraw_vesting: "transfer",
  delegate_vesting_shares: "transfer",
  award: "award",
  fixed_award: "award",
  receive_award: "award",
  author_reward: "award",
  curation_reward: "award",
  producer_reward: "award",
  validator_reward: "award",
  account_witness_vote: "governance",
  account_validator_vote: "governance",
  account_witness_proxy: "governance",
  account_validator_proxy: "governance",
  validator_update: "governance",
  witness_update: "governance",
  chain_properties_update: "governance",
  versioned_chain_properties_update: "governance",
  proposal_create: "governance",
  proposal_update: "governance",
  proposal_delete: "governance",
  committee_worker_create_request: "governance",
  committee_worker_cancel_request: "governance",
  committee_vote_request: "governance",
  account_create: "account",
  account_update: "account",
  account_metadata: "account",
  set_reward_sharing: "account",
  set_account_price: "account",
  custom: "account",
};

const acc = (name: unknown): OpPart => ({ kind: "account", name: s(name) });
const txt = (text: string): OpPart => ({ kind: "text", text });
const amt = (text: string, tone: "pos" | "neg" | "neutral" = "neutral"): OpPart => ({
  kind: "amount",
  text,
  tone,
});

type Decoder = (b: Body) => OpPart[];

const DECODERS: Record<string, Decoder> = {
  transfer: (b) => {
    const parts: OpPart[] = [
      acc(b.from),
      txt("sent"),
      amt(s(b.amount), "neutral"),
      txt("to"),
      acc(b.to),
    ];
    if (b.memo) parts.push({ kind: "memo", text: s(b.memo) });
    return parts;
  },
  transfer_to_vesting: (b) => {
    const parts = [acc(b.from), txt("powered up"), amt(s(b.amount), "pos")];
    if (b.to && b.to !== b.from) parts.push(txt("to"), acc(b.to));
    return parts;
  },
  withdraw_vesting: (b) => [acc(b.account), txt("started power-down of"), amt(s(b.vesting_shares), "neg")],
  delegate_vesting_shares: (b) => [
    acc(b.delegator),
    txt("delegated"),
    amt(s(b.vesting_shares)),
    txt("to"),
    acc(b.delegatee),
  ],
  award: (b) => {
    const pct = +(Number(b.energy) / 100).toFixed(2);
    const parts = [acc(b.initiator), txt("awarded"), acc(b.receiver), txt(`(${pct}%)`)];
    if (b.memo) parts.push({ kind: "memo", text: s(b.memo) });
    return parts;
  },
  fixed_award: (b) => {
    const parts = [
      acc(b.initiator),
      txt("fixed-awarded"),
      amt(s(b.reward_amount), "pos"),
      txt("to"),
      acc(b.receiver),
    ];
    if (b.memo) parts.push({ kind: "memo", text: s(b.memo) });
    return parts;
  },
  receive_award: (b) => [acc(b.receiver), txt("received award"), amt(s(b.reward ?? b.shares ?? ""), "pos")],
  account_witness_vote: (b) => voteParts(b, b.witness),
  account_validator_vote: (b) => voteParts(b, b.validator),
  account_witness_proxy: (b) => proxyParts(b),
  account_validator_proxy: (b) => proxyParts(b),
  validator_update: (b) => [acc(b.owner), txt("updated validator node"), txt(s(b.url))],
  witness_update: (b) => [acc(b.owner), txt("updated validator node"), txt(s(b.url))],
  account_create: (b) => [acc(b.creator), txt("created account"), acc(b.new_account_name)],
  account_update: (b) => [acc(b.account), txt("updated account keys/authorities")],
  account_metadata: (b) => [acc(b.account), txt("updated profile metadata")],
  set_reward_sharing: (b) => [
    acc(b.owner),
    txt(`set reward sharing to ${(Number(b.sharing_rate) / 100).toFixed(0)}%`),
  ],
  custom: (b) => [
    ...(Array.isArray(b.required_active_auths) && b.required_active_auths.length
      ? [acc((b.required_active_auths as unknown[])[0])]
      : Array.isArray(b.required_regular_auths) && b.required_regular_auths.length
        ? [acc((b.required_regular_auths as unknown[])[0])]
        : []),
    txt(`custom "${s(b.id)}"`),
  ],
  producer_reward: (b) => [acc(b.producer ?? b.validator), txt("block reward"), amt(s(b.vesting_shares), "pos")],
  validator_reward: (b) => [acc(b.validator), txt("block reward"), amt(s(b.shares), "pos")],
};

function voteParts(b: Body, target: unknown): OpPart[] {
  const approve = b.approve === undefined ? true : Boolean(b.approve);
  return [acc(b.account), txt(approve ? "voted for validator" : "unvoted validator"), acc(target)];
}

function proxyParts(b: Body): OpPart[] {
  return b.proxy
    ? [acc(b.account), txt("set vote proxy to"), acc(b.proxy)]
    : [acc(b.account), txt("cleared vote proxy")];
}

/** Collect account-name-shaped fields from any op body for chips/links. */
const ACCOUNT_FIELDS = [
  "from",
  "to",
  "account",
  "initiator",
  "receiver",
  "delegator",
  "delegatee",
  "creator",
  "new_account_name",
  "owner",
  "witness",
  "validator",
  "proxy",
  "producer",
  "voter",
  "author",
];

function collectAccounts(body: Body): string[] {
  const out = new Set<string>();
  for (const f of ACCOUNT_FIELDS) {
    const v = body[f];
    if (typeof v === "string" && v) out.add(v);
  }
  return [...out];
}

export function decodeOp(type: string, body: Body): DecodedOp {
  const decoder = DECODERS[type];
  const category = CATEGORY[type] ?? "other";
  const label = titleCase(type);
  if (decoder) {
    return { type, category, label, parts: decoder(body), accounts: collectAccounts(body) };
  }
  // Fallback: short field summary; the raw JSON lives behind a toggle in the UI.
  const summary = Object.entries(body)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .slice(0, 3)
    .map(([k, v]) => `${k}=${s(v)}`)
    .join(", ");
  return {
    type,
    category,
    label,
    parts: summary ? [txt(summary)] : [txt("(no decodable fields)")],
    accounts: collectAccounts(body),
  };
}

export const CATEGORY_TONE: Record<OpCategory, string> = {
  transfer: "text-acc-blue",
  award: "text-acc-green",
  governance: "text-acc-amber",
  account: "text-fg-muted",
  other: "text-fg-muted",
};

export const CATEGORY_DOT: Record<OpCategory, string> = {
  transfer: "bg-acc-blue",
  award: "bg-acc-green",
  governance: "bg-acc-amber",
  account: "bg-fg-dim",
  other: "bg-fg-dim",
};
