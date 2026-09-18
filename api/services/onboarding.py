"""Onboarding service — account registration via invite on the VIZ network.

Operation serialization
-----------------------
viz-python-lib 1.1.0 registers the ``create_invite`` / ``invite_registration``
operation *ids* but ships no matching ``GrapheneObject`` serializer classes.
Those classes live locally in ``services.viz_invite_ops`` and are broadcast
through a signing client (``helpers.viz.get_signing_client``) that holds the
service account's active key in an in-RAM key store.

Env vars required (production only):
  VIZ_SERVICE_ACCOUNT     — service account name on the VIZ network
  VIZ_SERVICE_ACTIVE_KEY  — WIF active key for that account
  INVITE_DAILY_CAP        — max invites per member per UTC day (default 5)
  INVITE_BALANCE          — VIZ funded into each invite (default: the chain's
                            create_invite_min_balance property)
"""

import os
from datetime import UTC, datetime

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

    Signs with the service account's active key (VIZ_SERVICE_ACTIVE_KEY),
    using *initiator* as the authorizing account. The op is built with the
    local ``Invite_registration`` serializer (see viz_invite_ops) since
    viz-python-lib 1.1.0 ships no such class.
    """
    from helpers.viz import get_signing_client
    from services.viz_invite_ops import Invite_registration

    op = Invite_registration(
        initiator=initiator,
        new_account_name=new_account_name,
        invite_secret=invite_secret,
        new_account_key=new_account_key,
    )
    get_signing_client().finalizeOp(op, initiator, "active")


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
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    cap = int(os.environ.get("INVITE_DAILY_CAP", "5"))
    result = db["invite_counters"].find_one_and_update(
        {"member": member, "date": today},
        {"$inc": {"count": 1}, "$setOnInsert": {"member": member, "date": today}},
        upsert=True,
        return_document=True,  # ReturnDocument.AFTER equivalent
    )
    return result["count"] <= cap


def _broadcast_create_invite(pub_key: str) -> None:
    """Broadcast a create_invite operation to the VIZ network.

    The service account (VIZ_SERVICE_ACCOUNT) funds the invite and signs with
    its active key. ``pub_key`` is the invite's public key; the matching private
    WIF is handed back to the new member as the claim secret. Built with the
    local ``Create_invite`` serializer since viz-python-lib 1.1.0 ships no such
    class.

    The funded amount is ``INVITE_BALANCE`` if set, otherwise the chain's
    ``create_invite_min_balance`` property (the network rejects invites funded
    below that minimum), so the default is always valid without hardcoding it.
    """
    from helpers.viz import get_signing_client
    from services.viz_invite_ops import Create_invite

    creator = os.environ.get("VIZ_SERVICE_ACCOUNT", "")
    client = get_signing_client()
    balance = os.environ.get("INVITE_BALANCE") or client.rpc.get_chain_properties()[
        "create_invite_min_balance"
    ]

    op = Create_invite(creator=creator, balance=balance, invite_key=pub_key)
    client.finalizeOp(op, creator, "active")


def create_funded_invite() -> str:
    """Generate a throwaway keypair and broadcast a funded create_invite.

    Returns the private key WIF so the caller can hand it to the new member
    as the ``claim_secret``.
    """
    from vizbase.account import PrivateKey

    key = PrivateKey()
    _broadcast_create_invite(str(key.pubkey))
    return str(key)
