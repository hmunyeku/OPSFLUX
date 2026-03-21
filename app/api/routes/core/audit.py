"""Audit log routes — paginated, filterable audit trail."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import AuditLog, User
from app.schemas.common import AuditLogRead, PaginatedResponse

router = APIRouter(prefix="/api/v1/audit-log", tags=["audit"])


@router.get("", response_model=PaginatedResponse[AuditLogRead])
async def list_audit_log(
    action: str | None = Query(None, description="Filter by action type"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    user_id: UUID | None = Query(None, description="Filter by user ID"),
    date_from: datetime | None = Query(None, description="Start date (inclusive)"),
    date_to: datetime | None = Query(None, description="End date (inclusive)"),
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated audit log for the current user's entity."""
    query = select(AuditLog).where(AuditLog.entity_id == entity_id)

    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)

    query = query.order_by(AuditLog.created_at.desc())

    return await paginate(db, query, pagination)
