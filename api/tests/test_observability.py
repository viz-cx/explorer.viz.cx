"""Tests for the DSN-gated Sentry init and header scrubbing."""
from helpers import observability


def test_init_sentry_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert observability.init_sentry() is False


def test_before_send_scrubs_sensitive_headers():
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer secret-token",
                "X-Auth-Signature": "deadbeef",
                "X-Auth-Nonce": "abc123",
                "User-Agent": "pytest",
            }
        }
    }
    scrubbed = observability._before_send(event, {})
    headers = scrubbed["request"]["headers"]
    assert headers["Authorization"] == "[filtered]"
    assert headers["X-Auth-Signature"] == "[filtered]"
    assert headers["X-Auth-Nonce"] == "[filtered]"
    # Non-sensitive headers pass through untouched.
    assert headers["User-Agent"] == "pytest"


def test_before_send_tolerates_missing_request():
    assert observability._before_send({}, {}) == {}
