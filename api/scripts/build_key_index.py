#!/usr/bin/env python3
"""One-time backfill: populate account_keys from the current node state.

Iterates all VIZ accounts alphabetically via lookup_accounts (1 000 per page),
fetches their current key_auths in batches of 200 via get_accounts, and upserts
into the account_keys collection.

Run from the api/ directory:
    python scripts/build_key_index.py
"""
from dotenv import load_dotenv

from helpers.db_client import ensure_indexes
from helpers.key_index import ensure_key_indexes, keys_from_account_data, upsert_keys
from helpers.viz import get_client

LOOKUP_PAGE = 1000
FETCH_BATCH = 200


def main() -> None:
    load_dotenv()
    ensure_indexes()
    ensure_key_indexes()
    client = get_client()

    lower = ""
    total = 0

    while True:
        names: list[str] = client.rpc.lookup_accounts(lower, LOOKUP_PAGE)
        if not names:
            break
        # lookup_accounts is inclusive of lower_bound; skip it on subsequent pages.
        if lower and names and names[0] == lower:
            names = names[1:]
        if not names:
            break

        for i in range(0, len(names), FETCH_BATCH):
            batch = names[i : i + FETCH_BATCH]
            accounts = client.rpc.get_accounts(batch)
            for acc in accounts:
                if not acc:
                    continue
                upsert_keys(acc["name"], keys_from_account_data(acc))
                total += 1

        print(f"Indexed {total} accounts (last: {names[-1]})", flush=True)
        lower = names[-1]

        if len(names) < LOOKUP_PAGE - 1:
            break  # last page

    print(f"Done — {total} accounts indexed.")


if __name__ == "__main__":
    main()
