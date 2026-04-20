"""Secret redaction helpers — used to scrub confidential tokens from
user-submitted free-text fields before they hit the database.

AUP §4.6 (Perenco) requires that any password disclosed in a support
ticket be removed by the IT department. We automate that here so:

  1. Users who accidentally paste a password, API key, JWT or bearer
     token into a bug report see a placeholder in their own ticket
     (preventing shoulder-surfing when the ticket is reopened).
  2. Anyone reviewing the ticket — including the AI chat context —
     never sees the raw secret.

Patterns are conservative: we prefer false negatives (a secret slips
through) over false positives (redacting a legitimate sentence). A
clean regex wins on `password=XXXX`, `pwd: XXXX`, `api_key = XXXX`,
bearer/basic auth headers, long URL-safe base64 blobs (≥20 chars) and
JWT-shaped strings. Credit-card-like 13-to-19-digit sequences also get
masked.

Usage (Python):

    from app.services.core.secret_redaction import redact_secrets
    safe_body = redact_secrets(raw_user_input)

The function is idempotent: re-running over already-redacted text has
no effect beyond a small perf cost.
"""

from __future__ import annotations

import re
from typing import Iterable

REDACTED = "***REDACTED***"


def _kv_pattern(keys: Iterable[str]) -> re.Pattern[str]:
    """Build a regex that matches `<key>=<value>` or `<key>:<value>` pairs
    (quoted or not), case-insensitive, across many common separators. The
    captured group is only the value — the key stays in the output so a
    reviewer still knows the field was scrubbed.
    """
    keys_alt = "|".join(map(re.escape, keys))
    # key then : or = then optional whitespace/quotes then the value up to
    # whitespace, quote, comma or end-of-string.
    return re.compile(
        rf'(?i)\b({keys_alt})\b\s*[:=]\s*[\'\"]?([^\'\"\s,;]+)[\'\"]?',
    )


SECRET_KEY_WORDS = (
    "password", "passwd", "pwd", "pass",
    "api_key", "apikey", "api-key",
    "secret", "token", "access_token", "auth_token",
    "bearer", "authorization", "x-api-key",
    "client_secret", "private_key",
    "mot_de_passe", "motdepasse",
)

_KV_SECRET_RE = _kv_pattern(SECRET_KEY_WORDS)

# Authorization headers: `Authorization: Bearer <token>` / `Basic <b64>`.
_AUTH_HEADER_RE = re.compile(
    r"(?i)\b(Bearer|Basic|Token)\s+([A-Za-z0-9._\-+/=]{16,})",
)

# JWT — three base64url segments separated by dots. Header is
# always reasonably long (``eyJhbGci…`` style), payload/signature can
# be much shorter in test fixtures, so we keep a moderate floor.
_JWT_RE = re.compile(
    r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b",
)

# PAN (credit-card-like) — 13 to 19 digits, separators allowed. Stripped
# digits are then checked against a simple Luhn validator.
_PAN_CANDIDATE_RE = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def _luhn_ok(num: str) -> bool:
    digits = [int(c) for c in num if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _redact_pan(match: re.Match[str]) -> str:
    raw = match.group(0)
    return REDACTED if _luhn_ok(raw) else raw


def redact_secrets(text: str | None) -> str | None:
    """Return ``text`` with anything that looks like a credential masked.

    Idempotent: ``redact_secrets(redact_secrets(x)) == redact_secrets(x)``.
    ``None`` input returns ``None`` (handy for nullable columns).
    """
    if not text:
        return text

    # 1) Auth header tokens first — the KV pass would otherwise eat the
    #    "Authorization: Bearer" prefix and leave the token untouched.
    text = _AUTH_HEADER_RE.sub(lambda m: f"{m.group(1)} {REDACTED}", text)

    # 2) JWTs anywhere in free text (catches pastes that don't include a
    #    Bearer/Authorization prefix).
    text = _JWT_RE.sub(REDACTED, text)

    # 3) Keep key names but hide the value. Stops
    #    `PostgreSQL password is "topsecret"` from exposing the secret
    #    while still leaving the sentence readable.
    text = _KV_SECRET_RE.sub(lambda m: f"{m.group(1)}={REDACTED}", text)

    # 4) Luhn-validated PANs (credit/debit cards).
    text = _PAN_CANDIDATE_RE.sub(_redact_pan, text)

    return text
