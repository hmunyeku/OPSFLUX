"""Database-level field encryption for GDPR-sensitive data.

Uses PostgreSQL pgcrypto extension (pgp_sym_encrypt / pgp_sym_decrypt)
for AES-256 symmetric encryption at the database level.

The encryption key is read from ENCRYPTION_KEY env var (or SECRET_KEY fallback).

Usage:
    from app.core.encryption import sql_encrypt, sql_decrypt, ENCRYPTION_KEY

    # In raw SQL:
    pgp_sym_encrypt(:value, :key)
    pgp_sym_decrypt(column::bytea, :key)

    # Helpers for SQLAlchemy:
    await db.execute(text("UPDATE users SET medical_notes = pgp_sym_encrypt(:val, :key)"),
                     {"val": "sensitive data", "key": ENCRYPTION_KEY})
"""

import os
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Encryption key — from dedicated env var, fallback to SECRET_KEY in dev only.
#
# In production, reusing SECRET_KEY for field encryption is a bad practice:
#   - SECRET_KEY may be rotated for session invalidation; rotating it would
#     silently break decryption of every encrypted row.
#   - Different security boundaries: SECRET_KEY is "may leak in logs",
#     ENCRYPTION_KEY is "if leaked, past PII is exposed forever".
# Crash at boot if the dedicated key is missing in prod — better a visible
# deploy failure than silently encrypting with the wrong key.
_ENCRYPTION_KEY_ENV = os.environ.get("ENCRYPTION_KEY")
if _ENCRYPTION_KEY_ENV:
    ENCRYPTION_KEY = _ENCRYPTION_KEY_ENV
elif settings.ENVIRONMENT == "production":
    raise RuntimeError(
        "ENCRYPTION_KEY env var is required in production. "
        "Set a strong random value (at least 32 bytes, e.g. "
        "`openssl rand -base64 48`) and keep it stable across deploys — "
        "rotating it invalidates every encrypted field in the database."
    )
else:
    logger.warning(
        "ENCRYPTION_KEY not set — falling back to SECRET_KEY (dev/staging only). "
        "DO NOT run this configuration in production."
    )
    ENCRYPTION_KEY = settings.SECRET_KEY


def sql_encrypt(column_value: str, key: str | None = None) -> str:
    """Return SQL expression to encrypt a value with pgcrypto."""
    k = key or ENCRYPTION_KEY
    return f"pgp_sym_encrypt('{column_value}', '{k}')"


def sql_decrypt(column_name: str, key: str | None = None) -> str:
    """Return SQL expression to decrypt a column with pgcrypto."""
    k = key or ENCRYPTION_KEY
    return f"pgp_sym_decrypt({column_name}::bytea, '{k}')"
