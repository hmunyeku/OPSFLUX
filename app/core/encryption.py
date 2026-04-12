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

import logging
import os

from app.core.config import settings

logger = logging.getLogger(__name__)

# Encryption key — from dedicated env var or fallback to SECRET_KEY
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", settings.SECRET_KEY)


def sql_encrypt(column_value: str, key: str | None = None) -> str:
    """Return SQL expression to encrypt a value with pgcrypto."""
    k = key or ENCRYPTION_KEY
    return f"pgp_sym_encrypt('{column_value}', '{k}')"


def sql_decrypt(column_name: str, key: str | None = None) -> str:
    """Return SQL expression to decrypt a column with pgcrypto."""
    k = key or ENCRYPTION_KEY
    return f"pgp_sym_decrypt({column_name}::bytea, '{k}')"
