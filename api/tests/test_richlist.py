"""Richlist snapshot: full-account pagination and ranking."""
from unittest.mock import MagicMock

from helpers import richlist_snapshot as rl


def _acc(name: str, balance: float, shares: float) -> dict:
    return {
        "name": name,
        "balance": f"{balance:.3f} VIZ",
        "vesting_shares": f"{shares:.6f} SHARES",
        "delegated_vesting_shares": "0.000000 SHARES",
        "received_vesting_shares": "0.000000 SHARES",
    }


def test_all_account_names_pages_without_repeating_the_boundary(monkeypatch):
    """lookup_accounts includes its lower bound, so every page after the first
    starts with the previous page's last name; it must not be counted twice."""
    monkeypatch.setattr(rl, "_LOOKUP_LIMIT", 3)
    names = ["a", "b", "c", "d", "e", "f"]
    client = MagicMock()
    client.rpc.lookup_accounts.side_effect = lambda lower, limit: [
        n for n in names if n >= lower
    ][:limit]

    assert rl._all_account_names(client) == names


def test_refresh_once_ranks_by_total_holdings(_viz, _mongo):
    _viz.rpc.get_dynamic_global_properties.return_value = {
        "total_vesting_fund": "200.000 VIZ",
        "total_vesting_shares": "100.000000 SHARES",  # 2 VIZ per SHARE
    }
    _viz.rpc.lookup_accounts.return_value = ["liquid", "staked"]
    _viz.rpc.get_accounts.return_value = [
        _acc("liquid", balance=50, shares=0),
        _acc("staked", balance=1, shares=40),  # 1 + 40 * 2 = 81
        None,  # the node returns null for an account it cannot load
    ]

    assert rl.refresh_once() == 2

    doc = _mongo["viztest"][rl.COLLECTION].find_one({"_id": rl.SNAPSHOT_ID})
    assert [(a["name"], a["wallet"]) for a in doc["accounts"]] == [("staked", 81.0), ("liquid", 50.0)]
    assert doc["total_accounts"] == 2
