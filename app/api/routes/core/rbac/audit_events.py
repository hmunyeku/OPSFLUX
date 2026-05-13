"""List route for rbac_audit_events with filters and pagination."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.models.common import RbacAuditEvent

router = APIRouter(prefix="/api/v1/rbac/audit-events", tags=["rbac"])


class AuditEventRead(BaseModel):
    id: UUID
    tenant_id: UUID
    event_type: str
    target: str | None
    params: dict | None
    result_summary: dict | None
    file_hash_sha256: str | None
    actor_user_id: UUID
    occurred_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    status: str
    error_code: str | None


class AuditEventsList(BaseModel):
    items: list[AuditEventRead]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditEventsList)
async def list_audit_events(
    event_type: str | None = Query(None),
    event_type_prefix: str | None = Query(None),
    actor_user_id: UUID | None = Query(None),
    status: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.audit.read"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RbacAuditEvent).where(RbacAuditEvent.tenant_id == entity_id)
    count_stmt = select(func.count()).select_from(RbacAuditEvent).where(RbacAuditEvent.tenant_id == entity_id)

    if event_type:
        stmt = stmt.where(RbacAuditEvent.event_type == event_type)
        count_stmt = count_stmt.where(RbacAuditEvent.event_type == event_type)
    if event_type_prefix:
        stmt = stmt.where(RbacAuditEvent.event_type.like(f"{event_type_prefix}%"))
        count_stmt = count_stmt.where(RbacAuditEvent.event_type.like(f"{event_type_prefix}%"))
    if actor_user_id:
        stmt = stmt.where(RbacAuditEvent.actor_user_id == actor_user_id)
        count_stmt = count_stmt.where(RbacAuditEvent.actor_user_id == actor_user_id)
    if status:
        stmt = stmt.where(RbacAuditEvent.status == status)
        count_stmt = count_stmt.where(RbacAuditEvent.status == status)
    if start_date:
        stmt = stmt.where(RbacAuditEvent.occurred_at >= start_date)
        count_stmt = count_stmt.where(RbacAuditEvent.occurred_at >= start_date)
    if end_date:
        stmt = stmt.where(RbacAuditEvent.occurred_at <= end_date)
        count_stmt = count_stmt.where(RbacAuditEvent.occurred_at <= end_date)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(RbacAuditEvent.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().all())

    return AuditEventsList(
        items=[AuditEventRead.model_validate(e, from_attributes=True) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )
