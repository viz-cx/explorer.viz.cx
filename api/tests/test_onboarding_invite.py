"""Tests for POST /onboarding/invite."""


def test_invite_returns_claim_secret(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.within_rate_limit", lambda m: True)
    monkeypatch.setattr("services.onboarding.create_funded_invite",
                        lambda: "5KclaimSecretWIF")
    r = client.post("/onboarding/invite", json={"member": "alice"})
    assert r.status_code == 200
    assert r.json() == {"claim_secret": "5KclaimSecretWIF"}


def test_invite_rate_limited(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.within_rate_limit", lambda m: False)
    r = client.post("/onboarding/invite", json={"member": "alice"})
    assert r.status_code == 429
    assert r.json()["detail"] == "invite_limit_reached"


def test_invite_missing_member_returns_422(client):
    r = client.post("/onboarding/invite", json={})
    assert r.status_code == 422


def test_invite_create_error_returns_500(client, monkeypatch):
    monkeypatch.setattr("services.onboarding.within_rate_limit", lambda m: True)
    monkeypatch.setattr(
        "services.onboarding.create_funded_invite",
        lambda: (_ for _ in ()).throw(RuntimeError("broadcast failed")),
    )
    r = client.post("/onboarding/invite", json={"member": "alice"})
    assert r.status_code == 500
    assert r.json()["detail"] == "invite_creation_failed"
