"""Test JWT and password security."""

from uuid import uuid4

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
