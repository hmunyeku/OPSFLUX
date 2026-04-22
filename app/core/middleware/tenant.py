"""TenantSchemaMiddleware — resolve tenant schema from host and set context."""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.tenant_context import set_tenant_schema


class TenantSchemaMiddleware(BaseHTTPMiddleware):
    """Resolve tenant schema with secure defaults."""

    # Paths that don't require tenant context
    EXEMPT_PATHS = {
        "/api/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/sso/providers",
        "/api/v1/auth/sso/authorize",
        "/api/v1/auth/sso/callback",
        "/.well-known/",
        "/authorize",
    }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # Skip tenant resolution for exempt paths
        if any(path.startswith(p) for p in self.EXEMPT_PATHS):
            request.state.tenant_schema = "public"
            set_tenant_schema("public")
            return await call_next(request)

        # Extract tenant from subdomain: tenant.app.opsflux.io -> tenant
        host = request.headers.get("host", "localhost")
        host_no_port = host.split(":")[0].strip().lower()
        parts = host_no_port.split(".")

        if len(parts) >= 3 and parts[1] in ("app", "api"):
            # tenant.app.opsflux.io → tenant
            tenant_slug = parts[0].lower().replace("-", "_")
        elif request.headers.get("X-Tenant"):
            # Explicit header (used by api.opsflux.io clients)
            tenant_slug = request.headers["X-Tenant"].lower().replace("-", "_")
        elif host_no_port in {"localhost", "127.0.0.1"}:
            tenant_slug = "public"
        else:
            # Default to public for bare domains (api.opsflux.io)
            tenant_slug = "public"

        # Validate tenant slug (prevent SQL injection)
        if not tenant_slug.isidentifier():
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid tenant identifier"},
            )

        request.state.tenant_schema = tenant_slug
        set_tenant_schema(tenant_slug)
        return await call_next(request)
