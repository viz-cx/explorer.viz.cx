"""Tests for notification dispatch + matching."""
import datetime as dt
import os

from helpers import notifications, watchlist
from helpers.db_client import get_db


def _op(op_type, body, op_id=1.0001):
    return {"_id": op_id, "timestamp": dt.datetime(2026, 7, 5, tzinfo=dt.UTC), "op": [op_type, body]}


def _notifs(owner):
    coll = get_db()[os.getenv("COLLECTION_NOTIFICATIONS", "notifications")]
    return list(coll.find({"owner": owner}))


def test_matched_accounts_transfer():
    assert notifications.matched_accounts(_op("transfer", {"from": "a", "to": "b"})) == {"a", "b"}


def test_matched_accounts_delegation():
    got = notifications.matched_accounts(_op("delegate_vesting_shares", {"delegator": "a", "delegatee": "b"}))
    assert got == {"a", "b"}


def test_reward_op_is_ignored():
    assert notifications.matched_accounts(_op("benefactor_award", {"receiver": "b"})) == set()


def test_dispatch_writes_row_for_watcher():
    watchlist.ensure_indexes()
    notifications.ensure_indexes()
    watchlist.add("alice", "bob")
    notifications.dispatch(_op("transfer", {"from": "bob", "to": "carol"}))
    rows = _notifs("alice")
    assert len(rows) == 1
    assert rows[0]["op_type"] == "transfer"
    assert rows[0]["account"] == "bob"
    assert rows[0]["read"] is False


def test_dispatch_fans_out_to_all_watchers():
    watchlist.ensure_indexes()
    notifications.ensure_indexes()
    watchlist.add("alice", "bob")
    watchlist.add("carol", "bob")
    notifications.dispatch(_op("transfer", {"from": "bob", "to": "x"}))
    assert len(_notifs("alice")) == 1
    assert len(_notifs("carol")) == 1


def test_dispatch_dedupes_same_op_for_same_owner():
    watchlist.ensure_indexes()
    notifications.ensure_indexes()
    watchlist.add("alice", "bob")
    op = _op("transfer", {"from": "bob", "to": "x"}, op_id=5.0001)
    notifications.dispatch(op)
    notifications.dispatch(op)
    assert len(_notifs("alice")) == 1


def test_dispatch_no_watchers_writes_nothing():
    notifications.dispatch(_op("transfer", {"from": "bob", "to": "x"}))
    assert _notifs("alice") == []
