"""DB-driven security settings with Redis cache and env var fallback.

Security settings are stored in the ``settings`` table (scope='tenant',
key prefix 'auth.').  When a key is not found in DB, the corresponding
environment variable from ``config.py`` is used as the default value.

A Redis cache (TTL 60s) avoids hitting the DB on every login request.
Call ``invalidate_security_settings_cache()`` after any PUT update.
"""

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_client import get_redis
from app.models.common import Setting

logger = logging.getLogger(__name__)

CACHE_KEY = "auth:settings:tenant"
CACHE_TTL = 60  # seconds

# Mapping: short key → (env attr name, type, default)
_DEFAULTS: dict[str, tuple[str, type, Any]] = {
    "password_min_length":       ("AUTH_PASSWORD_MIN_LENGTH", int, 12),
    "password_require_special":  ("AUTH_PASSWORD_REQUIRE_SPECIAL", bool, True),
    "password_require_uppercase":("AUTH_PASSWORD_REQUIRE_UPPERCASE", bool, True),
    "password_require_digit":    ("AUTH_PASSWORD_REQUIRE_DIGIT", bool, True),
    # AUP §5.2 — advanced policy
    "password_reject_upn":       ("AUTH_PASSWORD_REJECT_UPN", bool, True),
    "password_history_size":     ("AUTH_PASSWORD_HISTORY_SIZE", int, 5),
    "password_max_age_days":     ("AUTH_PASSWORD_MAX_AGE_DAYS", int, 180),
    "max_failed_attempts":       ("AUTH_MAX_FAILED_ATTEMPTS", int, 5),
    "lockout_duration_min":      ("AUTH_LOCKOUT_DURATION_MIN", int, 15),
    "rate_limit_per_ip":         ("AUTH_LOGIN_RATE_LIMIT_PER_IP", int, 10),
    "rate_limit_per_email":      ("AUTH_LOGIN_RATE_LIMIT_PER_EMAIL", int, 5),
    "captcha_enabled":           ("AUTH_CAPTCHA_ENABLED", bool, False),
    "captcha_provider":          ("AUTH_CAPTCHA_PROVIDER", str, "turnstile"),
    "captcha_site_key":          ("AUTH_CAPTCHA_SITE_KEY", str, ""),
    "captcha_secret_key":        ("AUTH_CAPTCHA_SECRET_KEY", str, ""),
    "suspicious_login_notify":   ("AUTH_SUSPICIOUS_LOGIN_NOTIFY", bool, True),
    # Compliance: require verified email/phone to be declared compliant
    "require_account_verification": ("CONFORMITE_REQUIRE_ACCOUNT_VERIFICATION", bool, True),
    # Messaging: default channel per message type (auto | whatsapp | sms | email)
    "messaging_channel_otp":          ("MESSAGING_CHANNEL_OTP", str, "auto"),
    "messaging_channel_notification": ("MESSAGING_CHANNEL_NOTIFICATION", str, "auto"),
    "messaging_channel_alert":        ("MESSAGING_CHANNEL_ALERT", str, "auto"),
}

# Keys that are allowed to be set via admin API
ALLOWED_KEYS = set(_DEFAULTS.keys())

# Keys that are secrets (never returned in GET responses)
SECRET_KEYS = {"captcha_secret_key"}


def _env_default(key: str) -> Any:
    """Get default value from env var or hardcoded default."""
    env_attr, _, fallback = _DEFAULTS[key]
    return getattr(settings, env_attr, fallback)


def _cast(key: str, value: Any) -> Any:
    """Cast value to the expected type for a key."""
    _, expected_type, _ = _DEFAULTS[key]
    if expected_type is bool and isinstance(value, str):
        return value.lower() in ("true", "1", "yes")
    return expected_type(value)


async def get_security_settings(db: AsyncSession) -> dict[str, Any]:
    """Return all security settings, merging DB overrides with env defaults.

    Returns a flat dict like ``{"max_failed_attempts": 5, ...}``.
    """
    # Try Redis cache first
    try:
        redis = get_redis()
        cached = await redis.get(CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception:
        logger.debug("Redis cache miss or error for auth settings")

    # Build defaults from env
    result: dict[str, Any] = {}
    for key in _DEFAULTS:
        result[key] = _env_default(key)

    # Override with DB values
    try:
        stmt = select(Setting).where(
            Setting.key.like("auth.%"),
            Setting.scope == "tenant",
        )
        rows = await db.execute(stmt)
        for row in rows.scalars():
            short_key = row.key.removeprefix("auth.")
            if short_key in _DEFAULTS:
                # Setting.value is JSONB stored as {"v": actual_value}
                raw = row.value.get("v") if isinstance(row.value, dict) else row.value
                if raw is not None:
                    result[short_key] = _cast(short_key, raw)
    except Exception:
        logger.warning("Failed to read auth settings from DB, using env defaults", exc_info=True)

    # Cache in Redis
    try:
        redis = get_redis()
        await redis.set(CACHE_KEY, json.dumps(result), ex=CACHE_TTL)
    except Exception:
        logger.debug("Failed to cache auth settings in Redis")

    return result


async def invalidate_security_settings_cache() -> None:
    """Delete the Redis cache so next read picks up fresh DB values."""
    try:
        redis = get_redis()
        await redis.delete(CACHE_KEY)
    except Exception:
        logger.debug("Failed to invalidate auth settings cache")
