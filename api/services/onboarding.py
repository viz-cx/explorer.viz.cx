"""Onboarding service — account registration via invite on the VIZ network.

Implementation note on broadcast_invite_registration
-----------------------------------------------------
viz-python-lib (vizbase.operations) does NOT include an Invite_registration
operation class, so the standard Signed_Transaction serialization path is
unavailable.  The function below raises NotImplementedError until the
operation class is added to the library or a custom binary-serializer is
wired in.  All production callers must monkeypatch this function in tests
(see api/tests/test_onboarding_register.py) and replace it with a real
implementation in a follow-up task.

Implementation note on create_funded_invite / _broadcast_create_invite
-----------------------------------------------------------------------
viz-python-lib (vizbase.operations) does NOT include a CreateInvite operation
class either.  _broadcast_create_invite always raises NotImplementedError.
Callers must monkeypatch create_funded_invite in tests.

Env vars required (production only):
  VIZ_SERVICE_ACCOUNT     — service account name on the VIZ network
  VIZ_SERVICE_ACTIVE_KEY  — WIF active key for that account
  INVITE_DAILY_CAP        — max invites per member per UTC day (default 5)
"""

import os
from datetime import datetime, timezone

from helpers.viz import get_client


def account_exists(name: str) -> bool:
    """Return True if *name* is already registered on the VIZ network."""
    client = get_client()
    result = client.rpc.get_accounts([name])
    return bool(result and result[0])


def broadcast_invite_registration(
    *,
    initiator: str,
    new_account_name: str,
    invite_secret: str,
    new_account_key: str,
) -> None:
    """Broadcast an invite_registration operation to the VIZ network.

    This requires the service account's active key (VIZ_SERVICE_ACTIVE_KEY)
    and uses the service account as *initiator*.

    .. warning::
        NOT IMPLEMENTED — vizbase.operations has no Invite_registration class
        so binary serialization via Signed_Transaction is unavailable.
        This stub is always monkeypatched in tests.  Replace with a real
        implementation once viz-python-lib gains the operation class or a
        custom serializer is provided.
    """
    _service_key = os.environ.get("VIZ_SERVICE_ACTIVE_KEY")  # noqa: F841 (read for env check)
    raise NotImplementedError(
        "broadcast_invite_registration is not yet implemented: "
        "vizbase.operations does not include Invite_registration. "
        "Track as DONE_WITH_CONCERNS in task-0.2-report.md."
    )


# ---------------------------------------------------------------------------
# Invite creation
# ---------------------------------------------------------------------------

def within_rate_limit(member: str) -> bool:
    """Return True if *member* has not yet hit their daily invite cap.

    Uses a MongoDB-backed daily counter (UTC date).  If the cap has not been
    reached, the counter is atomically incremented.  The daily cap is read from
    the ``INVITE_DAILY_CAP`` env var (default 5).
    """
    from helpers.db_client import get_db

    db = get_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cap = int(os.environ.get("INVITE_DAILY_CAP", "5"))
    result = db["invite_counters"].find_one_and_update(
        {"member": member, "date": today},
        {"$inc": {"count": 1}, "$setOnInsert": {"member": member, "date": today}},
        upsert=True,
        return_document=True,  # ReturnDocument.AFTER equivalent
    )
    return result["count"] <= cap


def _broadcast_create_invite(pub_key: str) -> None:  # pragma: no cover
    """Broadcast a create_invite operation to the VIZ network.

    .. warning::
        NOT IMPLEMENTED — vizbase.operations has no CreateInvite class so
        binary serialization via Signed_Transaction is unavailable.
        This stub always raises.  Monkeypatch ``create_funded_invite`` in tests.
    """
    raise NotImplementedError(
        "create_invite op not in viz-python-lib 1.1.0"
    )


def create_funded_invite() -> str:
    """Generate a throwaway keypair and broadcast a funded create_invite.

    Returns the private key WIF so the caller can hand it to the new member
    as the ``claim_secret``.

    .. warning::
        The broadcast step is not implemented (see _broadcast_create_invite).
        All production callers must monkeypatch this function in tests.
    """
    from vizbase.account import PrivateKey

    key = PrivateKey()
    _broadcast_create_invite(str(key.pubkey))
    return key.wif
