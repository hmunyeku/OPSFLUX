"""Unit tests for app.services.core.secret_redaction."""

from app.services.core.secret_redaction import REDACTED, redact_secrets


def test_none_input() -> None:
    assert redact_secrets(None) is None


def test_empty_string() -> None:
    assert redact_secrets("") == ""


def test_plain_sentence_is_untouched() -> None:
    msg = "The system shows an error on the dashboard."
    assert redact_secrets(msg) == msg


def test_password_equals_is_redacted() -> None:
    out = redact_secrets("password=topsecret!")
    assert "topsecret" not in out
    assert REDACTED in out


def test_password_colon_is_redacted() -> None:
    out = redact_secrets("password: Hunter2")
    assert "Hunter2" not in out


def test_mot_de_passe_fr() -> None:
    out = redact_secrets("mot_de_passe = lapin42")
    assert "lapin42" not in out


def test_api_key_variants() -> None:
    for variant in ("api_key", "apikey", "api-key", "API_KEY"):
        out = redact_secrets(f"{variant}=sk-live-AAAAAAAAAAAAAAAAAAAA")
        assert "sk-live" not in out


def test_bearer_token_header() -> None:
    out = redact_secrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")
    assert "eyJ" not in out


def test_jwt_anywhere_in_text() -> None:
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNjAwMDAwMDAwfQ.sig12345"
    out = redact_secrets(f"Header I pasted: {jwt} — please debug")
    assert jwt not in out


def test_credit_card_luhn_valid() -> None:
    # Classic test number: 4111 1111 1111 1111 (Visa test)
    out = redact_secrets("card: 4111 1111 1111 1111")
    assert "4111 1111" not in out


def test_credit_card_luhn_invalid_passthrough() -> None:
    # A number that fails Luhn — keep it, no redaction (probably not a PAN)
    out = redact_secrets("reference 1234567890123456")
    assert "1234567890123456" in out


def test_idempotent() -> None:
    once = redact_secrets("password=topsecret")
    twice = redact_secrets(once)
    assert once == twice


def test_multiple_secrets_in_one_string() -> None:
    msg = "Using password=secret123 and api_key=sk-live-test-AAAAAA"
    out = redact_secrets(msg)
    assert "secret123" not in out
    assert "sk-live-test" not in out
    assert out.count(REDACTED) >= 2
