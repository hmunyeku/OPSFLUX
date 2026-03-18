"""TenantSchemaMiddleware — SET search_path from subdomain."""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from sqlalchemy import text

from app.core.database import async_session_factory


class TenantSchemaMiddleware(BaseHTTPMiddleware):
    """Resolves tenant schema from request subdomain and sets PostgreSQL search_path."""

    # Paths that don't require tenant context
    EXEMPT_PATHS = {
        "/api/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/sso/callback",
    }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # Skip tenant resolution for exempt paths
        if any(path.startswith(p) for p in self.EXEMPT_PATHS):
            request.state.tenant_schema = "public"
            return await call_next(request)

        # Extract tenant from subdomain: perenco.app.opsflux.io -> perenco
        host = request.headers.get("host", "localhost")
        parts = host.split(".")

        if len(parts) >= 3 and parts[1] in ("app", "api"):
            tenant_slug = parts[0].lower().replace("-", "_")
        elif request.headers.get("X-Tenant"):
            tenant_slug = request.headers["X-Tenant"].lower().replace("-", "_")
        else:
            # Default to public schema in development
            tenant_slug = "public"

        # Validate tenant slug (prevent SQL injection)
        if not tenant_slug.isidentifier():
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid tenant identifier"},
            )

        request.state.tenant_schema = tenant_slug
        return await call_next(request)
