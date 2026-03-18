"""Audit logging service — append-only audit_log records."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def record_audit(
    db: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    user_id: UUID | None = None,
    entity_id: UUID | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Record an immutable audit log entry."""
    await db.execute(
        text(
            "INSERT INTO audit_log "
            "(id, entity_id, user_id, action, resource_type, resource_id, "
            "details, ip_address, user_agent) "
            "VALUES (gen_random_uuid(), :entity_id, :user_id, :action, "
            ":resource_type, :resource_id, :details, :ip_address, :user_agent)"
        ),
        {
            "entity_id": str(entity_id) if entity_id else None,
            "user_id": str(user_id) if user_id else None,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": __import__("json").dumps(details) if details else None,
            "ip_address": ip_address,
            "user_agent": user_agent,
        },
    )
