"""Audit-log service — pluggable helper to record business events.

The `AuditLog` model already exists (`app/models/common.py:681`) with the
right schema (action / resource_type / resource_id / details / ip / ua),
the read endpoint exists (`app/api/routes/core/audit.py`), and the
indexes are in place (alembic 148_audit_log_indexes). What was missing
is the *write path* — no module was instantiating `AuditLog()` rows.

This service provides a single helper that the call sites use to register
an event. Pattern : add the event to the session **before** the business
commit so audit + business op share a single transaction (atomic). If
the business commit fails, the audit row is rolled back too — correct
semantics : no audit event for an action that did not happen.

Usage (in a FastAPI route handler) :

    from app.services.core.audit_service import add_event

    @router.post("/{tier_id}/block")
    async def block_tier(tier_id, body, entity_id, current_user, db, request):
        ...
        db.add(tier_block)
        add_event(
            db,
            user=current_user,
            entity_id=entity_id,
            action="block",
            resource_type="tier",
            resource_id=tier_id,
            details={"block_type": body.block_type, "reason": body.reason},
            request=request,
        )
        await db.commit()   # single atomic commit covers both rows
        ...
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from starlette.requests import Request

from app.models.common import AuditLog, User


def add_event(
    db,
    *,
    user: User | None,
    entity_id: UUID | str | None,
    action: str,
    resource_type: str,
    resource_id: UUID | str | None = None,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    """Add an audit event row to the current session.

    The caller is responsible for the `await db.commit()`. The row will
    be committed in the same transaction as the business operation that
    triggered it — atomic by construction.

    Args:
        db: Active AsyncSession.
        user: User performing the action. ``None`` for system events.
        entity_id: Tenant (entity) under which the action took place.
            ``None`` for cross-tenant or platform-level events.
        action: Short verb describing the event. Convention :
            ``create | update | archive | restore | delete | block |
            unblock | transfer | export | login | logout``.
        resource_type: Lower-snake-case object kind, e.g. ``tier``,
            ``tier_contact``, ``project``, ``ads``. Used by the audit
            page filters.
        resource_id: Primary key of the affected row (UUID or string).
        details: Free-form JSON payload — diff summary, payload, related
            ids. Kept in ``details`` JSONB column. Keep it concise
            (under ~2 KB serialized) so the audit table stays cheap to
            query and back up.
        request: Starlette ``Request`` to extract IP and user-agent. If
            omitted, both columns are left ``None``.

    Returns:
        The (un-committed) ``AuditLog`` instance that was added to the
        session. The caller rarely needs it but it can be useful for
        tests or to attach additional info before commit.
    """
    ip: str | None = None
    ua: str | None = None
    if request is not None:
        try:
            ip = request.client.host if request.client else None
        except Exception:
            ip = None
        try:
            ua_raw = request.headers.get("user-agent")
            if ua_raw:
                ua = ua_raw[:500]
        except Exception:
            ua = None

    log = AuditLog(
        entity_id=entity_id if entity_id is not None else None,
        user_id=user.id if user is not None else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details or None,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(log)
    return log
