import Link from "next/link";
import type { Metadata } from "next";
import { getBlock } from "@/lib/api";
import { Card, DefRow, SectionTitle } from "@/components/ui";
import { OpSentence } from "@/components/OpRow";
import { Hash } from "@/components/Hash";
import { SearchBox } from "@/components/SearchBox";
import { RawJson } from "@/components/RawJson";
import { CATEGORY_DOT, CATEGORY_TONE, decodeOp } from "@/lib/ops";
import { formatUTC, timeAgo, truncateMiddle } from "@/lib/format";
import type { OpRecord } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tx ${truncateMiddle(id, 8, 6)}` };
}

export default async function TxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { id } = await params;
  const { b } = await searchParams;
  const blockNum = b && /^\d+$/.test(b) ? Number(b) : null;

  const doc = blockNum ? await getBlock(blockNum) : null;
  const ops: OpRecord[] = (doc?.block ?? []).filter((o) => o.trx_id === id);
  const ts = ops[0]?.timestamp;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Transaction</h1>
        <div className="mt-1">
          <Hash value={id} head={16} tail={12} />
        </div>
      </div>

      {/* When we can't resolve the block context, guide the user honestly. */}
      {!blockNum || !doc || ops.length === 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="font-prose text-sm text-fg-muted">
            {blockNum
              ? `No operations with this transaction id were found in block #${blockNum.toLocaleString("en-US")}.`
              : "To open a transaction directly, the explorer needs its block number. Transactions are reachable from any block or account page, where the block context is known."}
          </p>
          <div className="max-w-xl">
            <SearchBox />
          </div>
          <p className="font-prose text-xs text-fg-dim">
            Tip: search a block number or an @account to navigate to its operations.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <DefRow label="Block">
              <Link href={`/block/${blockNum}`} className="text-acc-blue hover:underline">
                #{blockNum.toLocaleString("en-US")}
              </Link>
            </DefRow>
            <DefRow label="Timestamp">
              {ts ? `${formatUTC(ts)} (${timeAgo(ts)})` : "—"}
            </DefRow>
            <DefRow label="Operations">{ops.length}</DefRow>
            <DefRow label="Transaction id">
              <Hash value={id} head={10} tail={8} />
            </DefRow>
          </Card>

          {ops.map((op, i) => {
            const decoded = decodeOp(op.op[0], op.op[1]);
            return (
              <div key={i}>
                <SectionTitle>
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[decoded.category]}`} />
                    <span className={CATEGORY_TONE[decoded.category]}>{decoded.label}</span>
                  </span>
                </SectionTitle>
                <Card className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed">
                    <OpSentence decoded={decoded} />
                  </p>
                  <div>
                    {Object.entries(op.op[1]).map(([k, v]) =>
                      typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? (
                        <DefRow key={k} label={k}>
                          <span className="break-all">{String(v)}</span>
                        </DefRow>
                      ) : null,
                    )}
                  </div>
                  <RawJson data={op.op[1]} />
                </Card>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
