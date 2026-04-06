"""Test JWT and password security."""

from uuid import uuid4

import pytest

from app.api.routes.core.settings import _is_sensitive_setting_key, _redact_setting_value
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.event_handlers import core_handlers


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _FakeDB:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        return _FakeResult(self.rows)


class _FakeAsyncSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def test_password_hashing():
    password = "SecureP@ss123"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_creation_and_decode():
    user_id = uuid4()
    token = create_access_token(
        user_id=user_id,
        tenant_schema="perenco",
        roles=["DO", "HSE_ADMIN"],
    )
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["tenant"] == "perenco"
    assert payload["type"] == "access"
    assert "DO" in payload["roles"]


def test_refresh_token():
    user_id = uuid4()
    token = create_refresh_token(user_id=user_id)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "refresh"


def test_sensitive_setting_values_are_redacted():
    assert _is_sensitive_setting_key("integration.smtp.password")
    assert _is_sensitive_setting_key("integration.sms_ovh.consumer_key")
    assert not _is_sensitive_setting_key("integration.smtp.host")

    redacted = _redact_setting_value("integration.smtp.password", {"v": "super-secret"})
    assert redacted["v"] == "********"
    assert redacted["masked"] is True
    assert redacted["has_value"] is True

    clear = _redact_setting_value("integration.smtp.host", {"v": "mail.opsflux.io"})
    assert clear == {"v": "mail.opsflux.io"}


@pytest.mark.asyncio
async def test_get_admin_user_ids_uses_user_group_roles(monkeypatch):
    admin_id = uuid4()
    db = _FakeDB([type("Row", (), {"user_id": admin_id})()])

    monkeypatch.setattr(core_handlers, "async_session_factory", lambda: _FakeAsyncSessionContext(db))

    result = await core_handlers._get_admin_user_ids(uuid4())

    sql = str(db.executed[0][0])
    assert "JOIN user_group_roles ugr" in sql
    assert "ugr.role_code" in sql
    assert result == [admin_id]
