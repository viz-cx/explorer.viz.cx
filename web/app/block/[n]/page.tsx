import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBlock, getChainInfo } from "@/lib/api";
import { withNode } from "@/lib/core";
import { isInHistoryHole } from "@/lib/config";
import { Card, DefRow, Empty, SectionTitle } from "@/components/ui";
import { OpRow } from "@/components/OpRow";
import { AccountChip } from "@/components/AccountChip";
import { Hash } from "@/components/Hash";
import { formatUTC, timeAgo } from "@/lib/format";
import type { Block } from "@viz-cx/core";
import type { OpRecord } from "@/lib/types";

function parseNum(n: string): number | null {
  if (!/^\d+$/.test(n)) return null;
  const v = Number(n);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  return { title: `Block #${n}` };
}

export default async function BlockPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const num = parseNum(n);
  if (num === null) notFound();

  const [doc, header, nodeOps] = await Promise.all([
    getBlock(num),
    withNode((api) => api.getBlock(num)).catch(() => null as Block | null),
    // The DB indexes only irreversible blocks (it trails the chain head by the
    // ~10-block confirmation window). For a still-reversible block the REST doc
    // is absent, so read its ops straight from the node — getOpsInBlock serves
    // exactly that recent window and returns the same shape we store.
    withNode((api) => api.getOpsInBlock(num, false))
      .then((r) => r as unknown as OpRecord[])
      .catch(() => [] as OpRecord[]),
  ]);

  const inHole = isInHistoryHole(num);

  // A block exists if any data source knows it, or it falls in the known archive
  // gap (real past blocks whose ops were lost). Otherwise it's beyond the chain
  // head (not yet produced) or otherwise unknown — show a distinct state, not an
  // empty skeleton of em-dashes.
  if (!inHole && doc === null && header === null) {
    const head = (await getChainInfo())?.head_block_number;
    const future = typeof head === "number" && num > head;
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Block #{num.toLocaleString("en-US")}
          </h1>
          <span className="rounded-md border border-acc-amber/40 bg-acc-amber/10 px-2 py-0.5 font-prose text-xs text-acc-amber">
            {future ? "not yet produced" : "not found"}
          </span>
        </div>
        <Card className="border-acc-amber/40 bg-acc-amber/5">
          <p className="font-prose text-sm text-fg">
            {future ? (
              <>
                This block doesn’t exist yet. The chain head is currently block{" "}
                <Link href={`/block/${head}`} className="text-acc-blue hover:underline">
                  #{head!.toLocaleString("en-US")}
                </Link>
                , so #{num.toLocaleString("en-US")} hasn’t been produced.
              </>
            ) : (
              <>
                No block #{num.toLocaleString("en-US")} was found on the chain or in the archive. It
                may not exist, or no reachable node currently retains it.
              </>
            )}
          </p>
        </Card>
        <div>
          <Link
            href={typeof head === "number" ? `/block/${head}` : "/dashboard"}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
          >
            {typeof head === "number" ? "Go to chain head →" : "Back to dashboard →"}
          </Link>
        </div>
      </div>
    );
  }

  // Indexed (irreversible) blocks come from the DB; a block the node knows but
  // the DB hasn't indexed yet is still reversible — serve its ops live.
  const reversible = doc === null && header !== null;
  const ops: OpRecord[] = reversible ? nodeOps : (doc?.block ?? []);
  const timestamp = ops[0]?.timestamp ?? header?.timestamp;

  // Group ops by transaction (virtual ops have no trx_id).
  const txMap = new Map<string, OpRecord[]>();
  const virtual: OpRecord[] = [];
  for (const op of ops) {
    if (op.trx_id) {
      const list = txMap.get(op.trx_id) ?? [];
      list.push(op);
      txMap.set(op.trx_id, list);
    } else {
      virtual.push(op);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Block #{num.toLocaleString("en-US")}</h1>
          {timestamp && (
            <span className="font-prose text-sm text-fg-dim" title={formatUTC(timestamp)}>
              {timeAgo(timestamp)}
            </span>
          )}
          {reversible && (
            <span
              className="rounded-md border border-acc-blue/40 bg-acc-blue/10 px-2 py-0.5 font-prose text-xs text-acc-blue"
              title="Served live from the node; not yet irreversible / indexed."
            >
              reversible
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={`/block/${num - 1}`}
            className="rounded-md border border-border px-2.5 py-1.5 text-fg-muted hover:border-border-strong hover:text-fg"
          >
            ← prev
          </Link>
          <Link
            href={`/block/${num + 1}`}
            className="rounded-md border border-border px-2.5 py-1.5 text-fg-muted hover:border-border-strong hover:text-fg"
          >
            next →
          </Link>
        </div>
      </div>

      {/* Meta */}
      <Card>
        <DefRow label="Timestamp">{timestamp ? formatUTC(timestamp) : "—"}</DefRow>
        <DefRow label="Validator">
          {header?.validator || header?.witness ? (
            <AccountChip name={(header.validator ?? header.witness)!} size={18} />
          ) : (
            "—"
          )}
        </DefRow>
        <DefRow label="Transactions">
          {txMap.size} {txMap.size === 1 ? "transaction" : "transactions"} · {ops.length} ops
        </DefRow>
        {header?.block_id && (
          <DefRow label="Block id">
            <Hash value={header.block_id} copy />
          </DefRow>
        )}
        {header?.previous && (
          <DefRow label="Previous">
            <Hash value={header.previous} href={`/block/${num - 1}`} copy />
          </DefRow>
        )}
        {header?.transaction_merkle_root && (
          <DefRow label="Merkle root">
            <Hash value={header.transaction_merkle_root} copy />
          </DefRow>
        )}
      </Card>

      {/* History hole notice */}
      {inHole && (
        <Card className="border-acc-amber/40 bg-acc-amber/5">
          <p className="font-prose text-sm text-acc-amber">
            Archived snapshot gap — operations are unavailable for blocks{" "}
            {(79_105_831).toLocaleString("en-US")}–{(80_679_604).toLocaleString("en-US")}. This range
            was lost in an unrecoverable snapshot-restore window and no node retains the operations.
          </p>
        </Card>
      )}

      {/* Transactions */}
      {!inHole && ops.length === 0 && (
        <Card pad={false}>
          <Empty>No operations in this block (empty block).</Empty>
        </Card>
      )}

      {[...txMap.entries()].map(([trxId, txOps], i) => (
        <div key={trxId}>
          <SectionTitle
            right={
              <Link
                href={`/tx/${trxId}?b=${num}`}
                className="font-prose text-xs text-acc-blue hover:underline"
              >
                tx detail →
              </Link>
            }
          >
            Transaction {i + 1}
          </SectionTitle>
          <div className="mb-2 px-1">
            <Hash value={trxId} href={`/tx/${trxId}?b=${num}`} head={12} tail={8} />
          </div>
          <Card pad={false} className="overflow-hidden">
            {txOps.map((op, j) => (
              <OpRow key={j} type={op.op[0]} body={op.op[1]} timestamp={op.timestamp} />
            ))}
          </Card>
        </div>
      ))}

      {virtual.length > 0 && (
        <div>
          <SectionTitle>Virtual operations</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {virtual.map((op, j) => (
              <OpRow key={j} type={op.op[0]} body={op.op[1]} timestamp={op.timestamp} />
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
