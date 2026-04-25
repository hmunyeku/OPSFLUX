"""Middleware — audit access to sensitive data endpoints.

Logs when users access endpoints that return health, medical,
passport, or other GDPR-sensitive personal data.
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Endpoints that serve sensitive personal data (GDPR Art. 9 — special categories)
SENSITIVE_PATTERNS = [
    "/api/v1/users/", "/passports", "/visas", "/vaccines",
    "/health-conditions", "/medical", "/emergency-contacts",
    "/social-securities", "/driving-licenses",
    "/api/v1/gdpr/my-data", "/api/v1/gdpr/download-export",
    "/api/v1/pax/credentials",
]


class SensitiveDataAuditMiddleware(BaseHTTPMiddleware):
    """Log access to sensitive data endpoints for GDPR compliance."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        method = request.method

        # Only audit GET/POST that read sensitive data (skip OPTIONS, static, etc.)
        if method not in ("GET", "POST", "PATCH"):
            return await call_next(request)

        is_sensitive = any(pattern in path for pattern in SENSITIVE_PATTERNS)
        if not is_sensitive:
            return await call_next(request)

        response = await call_next(request)

        # Only log successful access (2xx)
        if 200 <= response.status_code < 300:
            user_id = getattr(request.state, "user_id", None)
            ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
            logger.info(
                "SENSITIVE_DATA_ACCESS: user=%s ip=%s method=%s path=%s status=%d",
                user_id or "anonymous", ip, method, path, response.status_code,
            )

        return response
