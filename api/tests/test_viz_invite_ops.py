"""Tests for the local invite operation serializers and their service wiring.

These guard the gap that viz-python-lib 1.1.0 leaves open: it registers the
``create_invite`` / ``invite_registration`` op ids but ships no serializer
classes. The op classes here must resolve to the correct chain ids and produce
stable binary output, and the onboarding service must broadcast them with the
service account's active key.
"""

import pytest

from services.viz_invite_ops import Create_invite, Invite_registration

# A syntactically valid VIZ public key (regular test key).
PUBKEY = "VIZ6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV"


def _op_id(op):
    """Resolve the chain op id the same way finalizeOp does (Op_wrapper)."""
    from vizbase.objects import Op_wrapper

    return Op_wrapper(op=op).data["op"].id


def test_create_invite_resolves_to_chain_id():
    from vizbase.operationids import operations

    op = Create_invite(creator="alice", balance="1.000 VIZ", invite_key=PUBKEY)
    assert _op_id(op) == operations["create_invite"]


def test_invite_registration_resolves_to_chain_id():
    from vizbase.operationids import operations

    op = Invite_registration(
        initiator="alice",
        new_account_name="bob",
        invite_secret="5Ktest",
        new_account_key=PUBKEY,
    )
    assert _op_id(op) == operations["invite_registration"]


def test_create_invite_field_order_and_json():
    op = Create_invite(creator="alice", balance="1.000 VIZ", invite_key=PUBKEY)
    assert list(op.json().keys()) == ["creator", "balance", "invite_key"]
    assert op.json()["creator"] == "alice"
    assert op.json()["balance"] == "1.000 VIZ"
    # Binary serialization must not raise.
    assert len(bytes(op)) > 0


def test_invite_registration_field_order_and_json():
    op = Invite_registration(
        initiator="alice",
        new_account_name="bob",
        invite_secret="5Ktest",
        new_account_key=PUBKEY,
    )
    assert list(op.json().keys()) == [
        "initiator",
        "new_account_name",
        "invite_secret",
        "new_account_key",
    ]
    assert len(bytes(op)) > 0


def test_create_invite_rejects_bad_asset():
    # Amount requires a known asset symbol; "5.000 XXX" must fail.
    from vizbase.exceptions import AssetUnknown

    with pytest.raises(AssetUnknown):
        bytes(Create_invite(creator="alice", balance="5.000 XXX", invite_key=PUBKEY))


class _FakeRpc:
    def __init__(self, min_balance="10.000 VIZ"):
        self._min_balance = min_balance

    def get_chain_properties(self):
        return {"create_invite_min_balance": self._min_balance}


class _FakeSigningClient:
    """Records finalizeOp calls instead of broadcasting."""

    def __init__(self, min_balance="10.000 VIZ"):
        self.calls = []
        self.rpc = _FakeRpc(min_balance)

    def finalizeOp(self, op, account, permission):
        self.calls.append((type(op).__name__, account, permission, op.json()))
        return {"id": "fake-tx"}


def test_create_funded_invite_broadcasts_create_invite(monkeypatch):
    import helpers.viz as vizmod
    import services.onboarding as ob

    monkeypatch.setenv("VIZ_SERVICE_ACCOUNT", "kudos.service")
    monkeypatch.setenv("INVITE_BALANCE", "3.000 VIZ")
    fake = _FakeSigningClient()
    monkeypatch.setattr(vizmod, "get_signing_client", lambda: fake)

    secret = ob.create_funded_invite()

    assert secret.startswith("5")  # WIF private key
    name, account, permission, payload = fake.calls[-1]
    assert name == "Create_invite"
    assert account == "kudos.service"
    assert permission == "active"
    assert payload["creator"] == "kudos.service"
    assert payload["balance"] == "3.000 VIZ"
    assert payload["invite_key"].startswith("VIZ")


def test_create_funded_invite_defaults_balance_to_chain_minimum(monkeypatch):
    import helpers.viz as vizmod
    import services.onboarding as ob

    monkeypatch.setenv("VIZ_SERVICE_ACCOUNT", "kudos.service")
    monkeypatch.delenv("INVITE_BALANCE", raising=False)
    fake = _FakeSigningClient(min_balance="10.000 VIZ")
    monkeypatch.setattr(vizmod, "get_signing_client", lambda: fake)

    ob.create_funded_invite()

    assert fake.calls[-1][3]["balance"] == "10.000 VIZ"


def test_broadcast_invite_registration_signs_with_active(monkeypatch):
    import helpers.viz as vizmod
    import services.onboarding as ob

    fake = _FakeSigningClient()
    monkeypatch.setattr(vizmod, "get_signing_client", lambda: fake)

    ob.broadcast_invite_registration(
        initiator="kudos.service",
        new_account_name="newbie",
        invite_secret="5Ksecret",
        new_account_key=PUBKEY,
    )

    name, account, permission, payload = fake.calls[-1]
    assert name == "Invite_registration"
    assert account == "kudos.service"
    assert permission == "active"
    assert payload["new_account_name"] == "newbie"


def test_get_signing_client_requires_active_key(monkeypatch):
    import helpers.viz as vizmod

    monkeypatch.setattr(vizmod, "_signing_client", None)
    monkeypatch.delenv("VIZ_SERVICE_ACTIVE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="VIZ_SERVICE_ACTIVE_KEY"):
        vizmod.get_signing_client()
