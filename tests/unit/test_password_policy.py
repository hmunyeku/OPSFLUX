"""Pure-logic tests for app.services.core.password_policy.

Covers the bits that don't need a database session:
  * _upn_contained — email + local-part matching rules
  * is_password_expired — max-age window

History / reuse checks hit the DB and are exercised in integration
tests (tests/api/test_password_policy_flows.py when it lands).
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.core.password_policy import (
    _upn_contained,
    is_password_expired,
)


# ── _upn_contained ──────────────────────────────────────────────────────────


def test_upn_contained_matches_full_email() -> None:
    assert _upn_contained("MyPass-john.doe@perenco.com-2026", "john.doe@perenco.com")


def test_upn_contained_matches_local_part_case_insensitive() -> None:
    assert _upn_contained("John.Doe99!", "john.doe@perenco.com")


def test_upn_contained_rejects_short_local_part() -> None:
    # 2-letter local-part "hd" would otherwise lock users out of common
    # phrases like "The Old Hidden Door!1"
    assert not _upn_contained("The Old Hidden Door!1", "hd@perenco.com")


def test_upn_contained_ignores_when_email_missing() -> None:
    assert not _upn_contained("whatever", "")


def test_upn_contained_ignores_when_password_missing() -> None:
    assert not _upn_contained("", "john.doe@perenco.com")


def test_upn_contained_clean_password() -> None:
    assert not _upn_contained("!L5uraA1meLesAffr3uxBurgers", "john.doe@perenco.com")


# ── is_password_expired ─────────────────────────────────────────────────────


def _user(changed_at):
    return SimpleNamespace(password_changed_at=changed_at)


def test_expired_when_older_than_max_age() -> None:
    old = datetime.now(timezone.utc) - timedelta(days=200)
    assert is_password_expired(_user(old), {"password_max_age_days": 180})


def test_not_expired_within_window() -> None:
    recent = datetime.now(timezone.utc) - timedelta(days=30)
    assert not is_password_expired(_user(recent), {"password_max_age_days": 180})


def test_disabled_when_max_age_zero() -> None:
    old = datetime.now(timezone.utc) - timedelta(days=9999)
    assert not is_password_expired(_user(old), {"password_max_age_days": 0})


def test_never_changed_is_expired() -> None:
    # A fresh user without password_changed_at is treated as expired so
    # everyone is nudged through a rotation at policy activation.
    assert is_password_expired(_user(None), {"password_max_age_days": 180})


def test_never_changed_but_check_disabled() -> None:
    assert not is_password_expired(_user(None), {"password_max_age_days": 0})
