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

Env vars required (production only):
  VIZ_SERVICE_ACCOUNT     — service account name on the VIZ network
  VIZ_SERVICE_ACTIVE_KEY  — WIF active key for that account
"""

import os

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
