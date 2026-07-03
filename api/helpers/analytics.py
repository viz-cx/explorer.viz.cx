"""Pure aggregation of account operation history into reward + activity summaries.

Side-effect-free: the endpoint does the RPC walk and hands the collected entries
here. `OP_CATEGORY` mirrors the frontend map in web/lib/ops.ts — keep them in sync.
"""
import datetime as dt
from collections import defaultdict

OP_CATEGORY: dict[str, str] = {
    "transfer": "transfer",
    "transfer_to_vesting": "transfer",
    "withdraw_vesting": "transfer",
    "delegate_vesting_shares": "transfer",
    "award": "award",
    "fixed_award": "award",
    "receive_award": "award",
    "author_reward": "award",
    "curation_reward": "award",
    "producer_reward": "award",
    "validator_reward": "award",
    "account_witness_vote": "governance",
    "account_validator_vote": "governance",
    "account_witness_proxy": "governance",
    "account_validator_proxy": "governance",
    "validator_update": "governance",
    "witness_update": "governance",
    "chain_properties_update": "governance",
    "versioned_chain_properties_update": "governance",
    "proposal_create": "governance",
    "proposal_update": "governance",
    "proposal_delete": "governance",
    "committee_worker_create_request": "governance",
    "committee_worker_cancel_request": "governance",
    "committee_vote_request": "governance",
    "account_create": "account",
    "account_update": "account",
    "account_metadata": "account",
    "set_reward_sharing": "account",
    "set_account_price": "account",
    "custom": "account",
}

CATEGORIES = ("transfer", "award", "governance", "account", "other")

# Max ops the endpoint collects; mirrored here to decide the window label.
OP_CAP = 2000


def parse_asset(s) -> tuple[float, str]:
    """"1.234000 SHARES" -> (1.234, "SHARES"). Malformed/non-str -> (0.0, "")."""
    if not isinstance(s, str):
        return (0.0, "")
    parts = s.strip().split()
    if not parts:
        return (0.0, "")
    try:
        amount = float(parts[0])
    except ValueError:
        return (0.0, "")
    symbol = parts[1] if len(parts) > 1 else ""
    return (amount, symbol)


def _reward_amount(op_type: str, body: dict, account: str) -> tuple[str, float, float]:
    """Return (symbol, received, given) token amounts for one op. Zero when N/A."""
    if op_type == "receive_award":
        amt, sym = parse_asset(body.get("reward") or body.get("shares"))
        return (sym, amt, 0.0)
    if op_type in ("producer_reward", "validator_reward"):
        amt, sym = parse_asset(body.get("shares") or body.get("reward") or body.get("vesting_shares"))
        return (sym, amt, 0.0)
    if op_type == "fixed_award":
        amt, sym = parse_asset(body.get("reward_amount"))
        if body.get("receiver") == account:
            return (sym, amt, 0.0)
        if body.get("initiator") == account:
            return (sym, 0.0, amt)
    return ("", 0.0, 0.0)


def _sym_totals(acc: dict) -> list:
    return [
        {"symbol": sym, "total": round(v["total"], 6), "count": v["count"]}
        for sym, v in sorted(acc.items())
    ]


def aggregate_history(entries: list, account: str, now: dt.datetime) -> dict:
    received: dict = defaultdict(lambda: {"total": 0.0, "count": 0})
    given: dict = defaultdict(lambda: {"total": 0.0, "count": 0})
    reward_days: dict = defaultdict(lambda: {"received": 0.0, "given": 0.0})
    activity_days: dict = defaultdict(int)
    by_category: dict = {c: 0 for c in CATEGORIES}

    ts_min = ts_max = None
    for entry in entries:
        _seq, rec = entry
        ts = rec.get("timestamp", "")
        op = rec.get("op") or ["", {}]
        op_type, body = op[0], (op[1] if len(op) > 1 else {})
        day = ts[:10]

        if ts_min is None or ts < ts_min:
            ts_min = ts
        if ts_max is None or ts > ts_max:
            ts_max = ts

        by_category[OP_CATEGORY.get(op_type, "other")] += 1
        if day:
            activity_days[day] += 1

        sym, r, g = _reward_amount(op_type, body, account)
        if r:
            received[sym]["total"] += r
            received[sym]["count"] += 1
            reward_days[day]["received"] += r
        if g:
            given[sym]["total"] += g
            given[sym]["count"] += 1
            reward_days[day]["given"] += g

    ops_scanned = len(entries)
    window = "2000ops" if ops_scanned >= OP_CAP else "90d"
    return {
        "range": {
            "from": ts_min,
            "to": ts_max,
            "ops_scanned": ops_scanned,
            "window": window,
            "truncated": ops_scanned >= OP_CAP,
        },
        "rewards": {
            "received": _sym_totals(received),
            "given": _sym_totals(given),
            "timeline": [
                {"date": d, "received": round(v["received"], 6), "given": round(v["given"], 6)}
                for d, v in sorted(reward_days.items())
            ],
        },
        "activity": {
            "by_category": by_category,
            "timeline": [{"date": d, "count": c} for d, c in sorted(activity_days.items())],
        },
    }
