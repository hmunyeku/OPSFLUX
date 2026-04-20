"""Password policy enforcement — AUP §5.2.

Complements the length / character-class checks baked into
`_validate_password_strength` with three extra gates:

  1. UPN inclusion  — reject if the password contains the user's email
     or its local-part (case-insensitive). Prevents trivial variants
     of a user's own UPN.

  2. History        — reject any password matching a hash stored in
     `password_history` for this user within the last N entries (N
     configurable via Setting key `auth.password_history_size`,
     default 5). The current `users.hashed_password` is also checked.

  3. Max age        — `is_password_expired()` returns True when the
     user's last change is older than `auth.password_max_age_days`
     days (default 180). 0 disables the check.

Writes to the history table use a single transaction with the
associated user update, so rotation and commit are atomic from the
caller's point of view. Call `record_password_change()` right after
updating `user.hashed_password`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.common import PasswordHistory, User


class PasswordPolicyError(Exception):
    """Raised when a candidate password violates the policy.

    The attached `code` maps to a stable error identifier so the API
    layer can surface it as a StructuredHTTPException body.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _upn_contained(password: str, email: str) -> bool:
    """Return True when the password contains the email or local-part,
    case-insensitive. Used by the UPN-rejection gate.
    """
    if not password or not email:
        return False
    pwd = password.lower()
    mail = email.lower().strip()
    if not mail:
        return False
    if mail in pwd:
        return True
    local = mail.split("@", 1)[0]
    # Reject 4+ char matches only so a user whose local-part is a
    # 2-letter initial (e.g. "hd") isn't locked out of every
    # reasonable phrase that happens to contain those letters.
    return len(local) >= 4 and local in pwd


async def check_upn_inclusion(password: str, user: User, config: dict[str, Any]) -> None:
    """Raise PasswordPolicyError when UPN-inclusion is enabled and the
    password contains the user's email / local-part.
    """
    if not config.get("password_reject_upn", True):
        return
    if _upn_contained(password, user.email or ""):
        raise PasswordPolicyError(
            "PASSWORD_CONTAINS_UPN",
            "Le mot de passe ne doit pas contenir votre identifiant (email).",
        )


async def check_history_reuse(
    password: str,
    user: User,
    db: AsyncSession,
    config: dict[str, Any],
) -> None:
    """Raise PasswordPolicyError when the password matches either the
    current hashed_password or any entry in the user's history within
    the configured window.
    """
    size = int(config.get("password_history_size", 5) or 0)

    # Always block reusing the current password — regardless of the
    # history window setting. This catches the "reset to my own
    # password" trick.
    if user.hashed_password and verify_password(password, user.hashed_password):
        raise PasswordPolicyError(
            "PASSWORD_REUSE",
            "Le nouveau mot de passe doit être différent du mot de passe actuel.",
        )

    if size <= 0:
        return

    rows = (
        await db.execute(
            select(PasswordHistory.hashed_password)
            .where(PasswordHistory.user_id == user.id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(size)
        )
    ).scalars().all()

    for h in rows:
        if verify_password(password, h):
            raise PasswordPolicyError(
                "PASSWORD_REUSE_HISTORY",
                f"Ce mot de passe a déjà été utilisé récemment (historique des {size} derniers).",
            )


async def record_password_change(
    new_plain_password: str,
    user: User,
    db: AsyncSession,
    config: dict[str, Any],
) -> None:
    """Insert the new hash into history and trim old entries beyond the
    retention window. Call this AFTER updating `user.hashed_password`.

    When history size is 0 the table is left empty — the rotation step
    still runs so an install that disables history today doesn't keep
    hashes around from the time it was enabled.
    """
    size = int(config.get("password_history_size", 5) or 0)

    # Always store the new hash when history is enabled; the next
    # change will then read it back via check_history_reuse().
    if size > 0:
        db.add(
            PasswordHistory(
                user_id=user.id,
                hashed_password=hash_password(new_plain_password),
            )
        )
        await db.flush()

        # Keep only the newest `size` entries. The DELETE runs against
        # the non-selected IDs so the index on (user_id, created_at)
        # covers both the SELECT and the DELETE.
        keep_ids = (
            await db.execute(
                select(PasswordHistory.id)
                .where(PasswordHistory.user_id == user.id)
                .order_by(PasswordHistory.created_at.desc())
                .limit(size)
            )
        ).scalars().all()

        if keep_ids:
            await db.execute(
                delete(PasswordHistory)
                .where(PasswordHistory.user_id == user.id)
                .where(PasswordHistory.id.notin_(keep_ids))
            )
    else:
        # History disabled — clear any stragglers so a re-enable later
        # starts clean.
        await db.execute(
            delete(PasswordHistory).where(PasswordHistory.user_id == user.id)
        )


def is_password_expired(user: User, config: dict[str, Any]) -> bool:
    """Return True when the user's password is past its max age.

    Called after a successful authentication so the /login response
    can flag `must_change_password=True` and force a change flow.
    Never raises — callers should gate their UI on the return value.
    """
    max_age = int(config.get("password_max_age_days", 0) or 0)
    if max_age <= 0:
        return False
    last = user.password_changed_at
    if last is None:
        # Never changed since creation — treat as expired the day the
        # policy kicks in. Existing installs should bootstrap by
        # setting password_changed_at to `now()` at deploy time, or
        # leave as None to force everyone through a rotation.
        return True
    return datetime.now(timezone.utc) - last > timedelta(days=max_age)
