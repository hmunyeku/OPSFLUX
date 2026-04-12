"""Preview route — compact object summary for CrossModuleLink hover tooltips."""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.asset_registry import Installation
from app.models.common import (
    ComplianceRecord,
    ComplianceType,
    Project,
    Tier,
    TierContact,
    User,
)
from app.models.planner import PlannerActivity
from app.services.core.module_lifecycle_service import is_module_enabled, normalize_module_slug

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
PREVIEW_PERMISSION_MAP: dict[str, tuple[str, ...]] = {
    "tiers": ("tier.read",),
    "assets": ("asset.read",),
    "projets": ("project.read",),
    "planner": ("planner.activity.read",),
    "paxlog": (
        "paxlog.ads.read",
        "paxlog.ads.create",
        "paxlog.ads.update",
        "paxlog.ads.approve",
        "paxlog.avm.read",
        "paxlog.profile.read",
        "paxlog.compliance.read",
    ),
    "conformite": ("conformite.record.read",),
    "users": ("user.read", "core.users.read"),
}


@router.get("/preview/{module}/{record_id}", response_model=PreviewResponse)
async def get_preview(
    module: str,
    record_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return a compact summary for a record, used by CrossModuleLink hover tooltips."""
    normalized_module = normalize_module_slug(module) or module
    preview_module = "assets" if normalized_module == "asset_registry" else normalized_module

    if preview_module not in SUPPORTED_MODULES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported module: {module}. Supported: {', '.join(sorted(SUPPORTED_MODULES))}",
        )

    gating_module = "asset_registry" if preview_module == "assets" else preview_module
    if gating_module != "users" and not await is_module_enabled(db, entity_id, gating_module):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module unavailable")

    required_permissions = PREVIEW_PERMISSION_MAP.get(preview_module, ())
    if required_permissions:
        has_preview_access = False
        for permission in required_permissions:
            if await has_user_permission(current_user, entity_id, permission, db):
                has_preview_access = True
                break
        if not has_preview_access:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    handler = _MODULE_HANDLERS.get(preview_module)
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


async def _user_belongs_to_entity(db: AsyncSession, *, user_id: UUID, entity_id: UUID) -> bool:
    from app.models.common import UserGroup, UserGroupMember

    result = await db.execute(
        select(User.id)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            User.id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,  # noqa: E712
        )
    )
    if result.first():
        return True

    fallback = await db.execute(select(User.id).where(User.id == user_id, User.default_entity_id == entity_id))
    return fallback.first() is not None


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
    stmt = select(Installation).where(Installation.id == record_id, Installation.entity_id == entity_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return None
    return PreviewResponse(
        id=str(row.id),
        code=getattr(row, "code", None),
        name=row.name,
        type=getattr(row, "installation_type", getattr(row, "type", None)),
        status=getattr(row, "status", None),
        created_at=_format_dt(getattr(row, "created_at", None)),
        extra={"max_pax": getattr(row, "max_pax", None)} if getattr(row, "max_pax", None) else None,
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
    # PAX identity now lives on User or TierContact — try both.
    # 1) Try User
    stmt = select(User).where(User.id == record_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row and await _user_belongs_to_entity(db, user_id=row.id, entity_id=entity_id):
        return PreviewResponse(
            id=str(row.id),
            code=row.badge_number,
            name=row.full_name,
            type=row.pax_type,
            status="actif" if row.active else "inactif",
            created_at=_format_dt(row.created_at),
            extra={"nationality": row.nationality} if row.nationality else None,
        )
    # 2) Try TierContact (scoped via its parent Tier's entity_id)
    stmt = (
        select(TierContact)
        .join(Tier, TierContact.tier_id == Tier.id)
        .where(TierContact.id == record_id, Tier.entity_id == entity_id)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row:
        return PreviewResponse(
            id=str(row.id),
            code=row.badge_number,
            name=row.full_name,
            type=row.pax_type,
            status="actif" if row.active else "inactif",
            created_at=_format_dt(row.created_at),
            extra={"nationality": row.nationality} if row.nationality else None,
        )
    return None


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
        extra={"owner_type": record.owner_type, "issuer": record.issuer}
        if record.issuer
        else {"owner_type": record.owner_type},
    )


async def _preview_users(db: AsyncSession, entity_id: UUID, record_id: UUID) -> PreviewResponse | None:
    stmt = select(User).where(User.id == record_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row or not await _user_belongs_to_entity(db, user_id=row.id, entity_id=entity_id):
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
