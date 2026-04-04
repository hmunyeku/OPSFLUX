"""Test JWT and password security."""

from uuid import uuid4

from app.api.routes.core.settings import _is_sensitive_setting_key, _redact_setting_value
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


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
