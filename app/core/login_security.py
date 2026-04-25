"""Login security — rate limiting, CAPTCHA verification, session tracking."""

import hashlib
import logging
from datetime import datetime, UTC
from typing import Any

import httpx
from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# ── Rate Limiting ──────────────────────────────────────────────

async def check_login_rate_limit(
    request: Request,
    email: str | None = None,
    *,
    config: dict[str, Any] | None = None,
) -> None:
    """Enforce per-IP and per-email rate limits on login attempts.

    If *config* is provided, rate limits are read from it (DB-driven).
    Otherwise falls back to env var defaults.
    """
    redis = get_redis()
    ip = request.client.host if request.client else "unknown"

    limit_ip = (config or {}).get("rate_limit_per_ip", settings.AUTH_LOGIN_RATE_LIMIT_PER_IP)
    limit_email = (config or {}).get("rate_limit_per_email", settings.AUTH_LOGIN_RATE_LIMIT_PER_EMAIL)

    # Per-IP rate limit
    ip_key = f"auth:ratelimit:ip:{ip}"
    ip_count = await redis.incr(ip_key)
    if ip_count == 1:
        await redis.expire(ip_key, 60)
    if ip_count > limit_ip:
        ttl = await redis.ttl(ip_key)
        logger.warning("Login rate limit exceeded for IP %s (%d attempts)", ip, ip_count)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": f"Trop de tentatives depuis cette adresse. Réessayez dans {max(ttl, 1)} seconde(s).",
                "retry_after_seconds": max(ttl, 1),
            },
            headers={"Retry-After": str(max(ttl, 1))},
        )

    # Per-email rate limit
    if email:
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()[:16]
        email_key = f"auth:ratelimit:email:{email_hash}"
        email_count = await redis.incr(email_key)
        if email_count == 1:
            await redis.expire(email_key, 60)
        if email_count > limit_email:
            ttl = await redis.ttl(email_key)
            logger.warning("Login rate limit exceeded for email %s (%d attempts)", email, email_count)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMITED",
                    "message": f"Trop de tentatives pour ce compte. Réessayez dans {max(ttl, 1)} seconde(s).",
                    "retry_after_seconds": max(ttl, 1),
                },
                headers={"Retry-After": str(max(ttl, 1))},
            )


# ── CAPTCHA Verification ──────────────────────────────────────

async def verify_captcha(
    token: str | None,
    *,
    config: dict[str, Any] | None = None,
) -> bool:
    """Verify CAPTCHA token with the configured provider.

    If *config* is provided, CAPTCHA settings are read from it (DB-driven).
    """
    captcha_enabled = (config or {}).get("captcha_enabled", settings.AUTH_CAPTCHA_ENABLED)

    if not captcha_enabled:
        return True

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification required.",
        )

    provider = (config or {}).get("captcha_provider", settings.AUTH_CAPTCHA_PROVIDER).lower()
    secret = (config or {}).get("captcha_secret_key", settings.AUTH_CAPTCHA_SECRET_KEY)

    if not secret:
        logger.error("CAPTCHA enabled but no secret key configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA provider misconfigured.",
        )

    verify_urls = {
        "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        "hcaptcha": "https://hcaptcha.com/siteverify",
        "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
    }

    url = verify_urls.get(provider)
    if not url:
        logger.error("Unknown CAPTCHA provider: %s", provider)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA provider misconfigured.",
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, data={"secret": secret, "response": token})
            result = resp.json()
            success = result.get("success", False)
            if not success:
                logger.warning("CAPTCHA verification failed: %s", result)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CAPTCHA verification failed. Please try again.",
                )
            return True
    except httpx.TimeoutException:
        logger.error("CAPTCHA verification timed out")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA verification unavailable. Please try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("CAPTCHA verification error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA verification unavailable. Please try again.",
        )
