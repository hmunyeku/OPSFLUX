"""Login security — rate limiting, CAPTCHA verification, session tracking."""

import hashlib
import logging
from datetime import datetime, UTC

import httpx
from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# ── Rate Limiting ──────────────────────────────────────────────

async def check_login_rate_limit(request: Request, email: str | None = None) -> None:
    """Enforce per-IP and per-email rate limits on login attempts."""
    redis = get_redis()
    ip = request.client.host if request.client else "unknown"

    # Per-IP rate limit
    ip_key = f"auth:ratelimit:ip:{ip}"
    ip_count = await redis.incr(ip_key)
    if ip_count == 1:
        await redis.expire(ip_key, 60)
    if ip_count > settings.AUTH_LOGIN_RATE_LIMIT_PER_IP:
        logger.warning("Login rate limit exceeded for IP %s (%d attempts)", ip, ip_count)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": "60"},
        )

    # Per-email rate limit
    if email:
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()[:16]
        email_key = f"auth:ratelimit:email:{email_hash}"
        email_count = await redis.incr(email_key)
        if email_count == 1:
            await redis.expire(email_key, 60)
        if email_count > settings.AUTH_LOGIN_RATE_LIMIT_PER_EMAIL:
            logger.warning("Login rate limit exceeded for email %s (%d attempts)", email, email_count)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts for this account. Please try again later.",
                headers={"Retry-After": "60"},
            )


# ── CAPTCHA Verification ──────────────────────────────────────

async def verify_captcha(token: str | None) -> bool:
    """Verify CAPTCHA token with the configured provider."""
    if not settings.AUTH_CAPTCHA_ENABLED:
        return True

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification required.",
        )

    provider = settings.AUTH_CAPTCHA_PROVIDER.lower()
    secret = settings.AUTH_CAPTCHA_SECRET_KEY

    if not secret:
        logger.warning("CAPTCHA enabled but no secret key configured — skipping verification")
        return True

    verify_urls = {
        "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        "hcaptcha": "https://hcaptcha.com/siteverify",
        "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
    }

    url = verify_urls.get(provider)
    if not url:
        logger.error("Unknown CAPTCHA provider: %s", provider)
        return True  # fail open to avoid blocking login

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
        return True  # fail open
    except HTTPException:
        raise
    except Exception as e:
        logger.error("CAPTCHA verification error: %s", e)
        return True  # fail open


# ── Login Config Endpoint Data ────────────────────────────────

def get_login_config() -> dict:
    """Return public login configuration for the frontend."""
    return {
        "captcha_enabled": settings.AUTH_CAPTCHA_ENABLED,
        "captcha_provider": settings.AUTH_CAPTCHA_PROVIDER if settings.AUTH_CAPTCHA_ENABLED else None,
        "captcha_site_key": settings.AUTH_CAPTCHA_SITE_KEY if settings.AUTH_CAPTCHA_ENABLED else None,
        "max_failed_attempts": settings.AUTH_MAX_FAILED_ATTEMPTS,
        "lockout_duration_min": settings.AUTH_LOCKOUT_DURATION_MIN,
    }
