"""Tests for POST /onboarding/register."""

VALID = {
    "invite_secret": "5Kfake...",
    "new_account_name": "bob",
    "new_account_public_key": "VIZ7...",
}


def test_register_success(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.account_exists", lambda n: False)
    monkeypatch.setattr(
        "services.onboarding.broadcast_invite_registration", lambda **kw: None
    )
    r = client.post("/onboarding/register", json=VALID)
    assert r.status_code == 200
    assert r.json() == {"username": "bob"}


def test_register_username_taken(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.account_exists", lambda n: True)
    r = client.post("/onboarding/register", json=VALID)
    assert r.status_code == 409
    assert r.json()["detail"] == "username_taken"


def test_register_broadcast_error_returns_400(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.account_exists", lambda n: False)
    monkeypatch.setattr(
        "services.onboarding.broadcast_invite_registration",
        lambda **kw: (_ for _ in ()).throw(ValueError("bad invite")),
    )
    r = client.post("/onboarding/register", json=VALID)
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid_invite"


def test_register_rejects_missing_fields(client):
    r = client.post("/onboarding/register", json={"new_account_name": "bob"})
    assert r.status_code == 422
