"""Tenant schema context — thread-safe via contextvars.

The TenantSchemaMiddleware sets the current tenant schema for each request.
get_db() reads it to execute SET search_path before yielding the session.
"""

from contextvars import ContextVar

_tenant_schema: ContextVar[str] = ContextVar("tenant_schema", default="public")


def get_tenant_schema() -> str:
    """Return the current tenant schema name (defaults to 'public')."""
    return _tenant_schema.get()


def set_tenant_schema(schema: str) -> None:
    """Set the current tenant schema name for this async context."""
    _tenant_schema.set(schema)
