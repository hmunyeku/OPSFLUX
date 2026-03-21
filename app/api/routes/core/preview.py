"""Preview route — compact object summary for CrossModuleLink hover tooltips."""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.models.common import (
    Asset,
    ComplianceRecord,
    ComplianceType,
    Project,
    Tier,
    User,
)
from app.models.paxlog import PaxProfile
from app.models.planner import PlannerActivity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["preview"])


class PreviewResponse(BaseModel):
    id: str
    code: str | None = None
    name: str
    type: str | None = None
    status: str | None = None
    created_at: str | None = None
    extra: dict | None = None


SUPPORTED_MODULES = {"tiers", "assets", "projets", "planner", "paxlog", "conformite", "users"}


@router.get("/preview/{module}/{record_id}", response_model=PreviewResponse)
async def get_preview(
    module: str,
    record_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return a compact summary for a record, used by CrossModuleLink hover tooltips."""
    if module not in SUPPORTED_MODULES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported module: {module}. Supported: {', '.join(sorted(SUPPORTED_MODULES))}",
        )

    handler = _MODULE_HANDLERS.get(module)
    if not handler:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No handler for module: {module}")

    result = await handler(db, entity_id, record_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    return result


def _format_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%d")


# ── Module handlers ─────────────────────────────────────────────────────────


async def _preview_tiers(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(Tier).where(Tier.id == record_id, Tier.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=row.code,
        name=row.name,
        type=row.type,
        status="actif" if row.active and not row.archived else ("bloqué" if row.is_blocked else "archivé"),
        created_at=_format_dt(row.created_at),
        extra={"scope": row.scope} if row.scope else None,
    )


async def _preview_assets(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(Asset).where(Asset.id == record_id, Asset.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=row.code,
        name=row.name,
        type=row.type,
        status=row.status,
        created_at=_format_dt(row.created_at),
        extra={"max_pax": row.max_pax} if row.max_pax else None,
    )


async def _preview_projets(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(Project).where(Project.id == record_id, Project.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=row.code,
        name=row.name,
        type="Projet",
        status=row.status,
        created_at=_format_dt(row.created_at),
        extra={
            "priority": row.priority,
            "progress": row.progress,
            "weather": row.weather,
        },
    )


async def _preview_planner(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(PlannerActivity).where(PlannerActivity.id == record_id, PlannerActivity.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=None,
        name=row.title,
        type=row.type,
        status=row.status,
        created_at=_format_dt(row.created_at),
        extra={
            "priority": row.priority,
            "start_date": _format_dt(row.start_date),
            "end_date": _format_dt(row.end_date),
        },
    )


async def _preview_paxlog(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(PaxProfile).where(PaxProfile.id == record_id, PaxProfile.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=row.badge_number,
        name=f"{row.first_name} {row.last_name}",
        type=row.type,
        status=row.status,
        created_at=_format_dt(row.created_at),
        extra={"nationality": row.nationality} if row.nationality else None,
    )


async def _preview_conformite(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = (
        select(ComplianceRecord, ComplianceType.name.label("type_name"), ComplianceType.category)
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    result = (await db.execute(stmt)).first()
    if not result:
        return None
    record, type_name, category = result
    return PreviewResponse(
        id=str(record.id),
        code=record.reference_number,
        name=type_name,
        type=category,
        status=record.status,
        created_at=_format_dt(record.created_at),
        extra={"owner_type": record.owner_type, "issuer": record.issuer} if record.issuer else {"owner_type": record.owner_type},
    )


async def _preview_users(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(User).where(User.id == record_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=row.email,
        name=row.full_name,
        type="Utilisateur",
        status="actif" if row.active else "inactif",
        created_at=_format_dt(row.created_at),
    )


_MODULE_HANDLERS = {
    "tiers": _preview_tiers,
    "assets": _preview_assets,
    "projets": _preview_projets,
    "planner": _preview_planner,
    "paxlog": _preview_paxlog,
    "conformite": _preview_conformite,
    "users": _preview_users,
}
