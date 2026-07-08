"""Tests for the /people search endpoint."""
import pytest


def test_short_query_returns_empty(client):
    """Queries shorter than 2 chars return an empty list immediately."""
    r = client.get("/people", params={"q": "a"})
    assert r.status_code == 200
    assert r.json() == {"people": []}


def test_empty_query_returns_empty(client):
    """Empty query string returns an empty list."""
    r = client.get("/people", params={"q": ""})
    assert r.status_code == 200
    assert r.json() == {"people": []}


def test_missing_q_returns_empty(client):
    """Missing q param returns an empty list."""
    r = client.get("/people")
    assert r.status_code == 200
    assert r.json() == {"people": []}


def test_prefix_match_returns_results(client, monkeypatch):
    """A 2+ char query returns matching usernames."""
    monkeypatch.setattr(
        "endpoints.people.search_usernames",
        lambda q, limit: ["alice", "alina"],
    )
    r = client.get("/people", params={"q": "al"})
    assert r.status_code == 200
    data = r.json()
    assert "people" in data
    names = [p["username"] for p in data["people"]]
    assert names == ["alice", "alina"]


def test_prefix_match_includes_display_name_field(client, monkeypatch):
    """Each result includes a display_name field (may be null)."""
    monkeypatch.setattr(
        "endpoints.people.search_usernames",
        lambda q, limit: ["bob"],
    )
    r = client.get("/people", params={"q": "bo"})
    assert r.status_code == 200
    people = r.json()["people"]
    assert len(people) == 1
    assert people[0]["username"] == "bob"
    assert "display_name" in people[0]


def test_results_capped_at_25(client, monkeypatch):
    """Results are capped at 25 entries."""
    monkeypatch.setattr(
        "endpoints.people.search_usernames",
        lambda q, limit: [f"user{i}" for i in range(limit)],
    )
    r = client.get("/people", params={"q": "us"})
    assert r.status_code == 200
    assert len(r.json()["people"]) == 25


def test_two_char_query_is_accepted(client, monkeypatch):
    """A 2-char query (minimum valid length) triggers a search."""
    called_with = {}

    def fake_search(q, limit):
        called_with["q"] = q
        return []

    monkeypatch.setattr("endpoints.people.search_usernames", fake_search)
    r = client.get("/people", params={"q": "ab"})
    assert r.status_code == 200
    assert called_with.get("q") == "ab"
