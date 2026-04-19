"""MOC (Management of Change) HTTP routes.

Endpoints:
  GET    /api/v1/moc                  — list MOCs (paginated, filtered)
  POST   /api/v1/moc                  — create a MOC
  GET    /api/v1/moc/stats            — summary statistics for dashboards
  GET    /api/v1/moc/{id}             — MOC detail with history + validations
  PATCH  /api/v1/moc/{id}             — update fields (role-limited)
  DELETE /api/v1/moc/{id}             — soft-delete
  POST   /api/v1/moc/{id}/transition  — fire an FSM transition
  POST   /api/v1/moc/{id}/validations — upsert a validation matrix entry
  GET    /api/v1/moc/fsm              — static FSM description for the UI
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_module_enabled,
    require_permission,
)
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pagination import PaginationParams, paginate
from app.models.common import User
from app.models.moc import MOC, MOCStatusHistory, MOC_STATUSES
from app.schemas.common import PaginatedResponse
from app.schemas.moc import (
    MOCCreate,
    MOCRead,
    MOCReadWithDetails,
    MOCStatsByStatus,
    MOCStatsBySite,
    MOCStatsByType,
    MOCStatsSummary,
    MOCStatusHistoryRead,
    MOCTransition,
    MOCUpdate,
    MOCValidationRead,
    MOCValidationUpsert,
)
from app.services.modules.moc_service import (
    FSM,
    allowed_transitions,
    generate_reference,
    transition,
    upsert_validation,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/moc",
    tags=["moc"],
    dependencies=[require_module_enabled("moc")],
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _get_or_404(
    db: AsyncSession, moc_id: UUID, entity_id: UUID, *, with_details: bool = False
) -> MOC:
    stmt = select(MOC).where(
        MOC.id == moc_id,
        MOC.entity_id == entity_id,
        MOC.archived == False,  # noqa: E712
    )
    if with_details:
        stmt = stmt.options(
            selectinload(MOC.status_history),
            selectinload(MOC.validations),
        )
    result = await db.execute(stmt)
    moc = result.scalar_one_or_none()
    if not moc:
        raise StructuredHTTPException(
            404, code="MOC_NOT_FOUND", message="MOC introuvable",
            params={"moc_id": str(moc_id)},
        )
    return moc


async def _user_display(db: AsyncSession, uids: set[UUID]) -> dict[UUID, str]:
    if not uids:
        return {}
    r = await db.execute(
        select(User.id, User.first_name, User.last_name).where(User.id.in_(uids))
    )
    return {row.id: f"{row.first_name} {row.last_name}".strip() for row in r.all()}


def _enrich(moc: MOC, names: dict[UUID, str]) -> dict[str, Any]:
    d = MOCRead.model_validate(moc).model_dump(by_alias=True)
    d["initiator_display"] = names.get(moc.initiator_id)
    d["site_chief_display"] = names.get(moc.site_chief_id) if moc.site_chief_id else None
    d["director_display"] = names.get(moc.director_id) if moc.director_id else None
    d["responsible_display"] = names.get(moc.responsible_id) if moc.responsible_id else None
    return d


# ─── List ────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=PaginatedResponse[dict],
    dependencies=[require_permission("moc.read")],
)
async def list_mocs(
    pagination: PaginationParams = Depends(),
    status: str | None = Query(None, description="Filter by single status"),
    site_label: str | None = Query(None),
    platform_code: str | None = Query(None),
    priority: str | None = Query(None, pattern="^[123]$"),
    search: str | None = Query(None, description="Full-text on reference/objectives/description"),
    initiator_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of MOCs for the current entity."""
    query = select(MOC).where(
        MOC.entity_id == entity_id,
        MOC.archived == False,  # noqa: E712
    ).order_by(MOC.created_at.desc())

    if status:
        if status not in MOC_STATUSES:
            raise StructuredHTTPException(
                400, code="INVALID_STATUS",
                message=f"Unknown status '{status}'",
                params={"status": status},
            )
        query = query.where(MOC.status == status)
    if site_label:
        query = query.where(MOC.site_label == site_label)
    if platform_code:
        query = query.where(MOC.platform_code == platform_code)
    if priority:
        query = query.where(MOC.priority == priority)
    if initiator_id:
        query = query.where(MOC.initiator_id == initiator_id)
    if search:
        q = f"%{search.strip()}%"
        query = query.where(
            or_(
                MOC.reference.ilike(q),
                MOC.objectives.ilike(q),
                MOC.description.ilike(q),
            )
        )

    async def transform(row):
        # Collect all user IDs we need to display for this page
        pass
    # Run pagination with a post-processor that enriches user names in one go.
    page = await paginate(db, query, pagination)
    mocs = page["items"]
    uids: set[UUID] = set()
    for m in mocs:
        uids.add(m.initiator_id)
        for fk in (m.site_chief_id, m.director_id, m.responsible_id):
            if fk:
                uids.add(fk)
    names = await _user_display(db, uids)
    page["items"] = [_enrich(m, names) for m in mocs]
    return page


# ─── Create ──────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=MOCRead,
    status_code=201,
    dependencies=[require_permission("moc.create")],
)
async def create_moc(
    body: MOCCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new MOC. Status is always `created` at this point."""
    ref = await generate_reference(
        db, entity_id=entity_id, platform_code=body.platform_code
    )
    moc = MOC(
        entity_id=entity_id,
        reference=ref,
        initiator_id=current_user.id,
        initiator_name=body.initiator_name or current_user.full_name,
        initiator_function=body.initiator_function,
        site_label=body.site_label,
        site_id=body.site_id,
        platform_code=body.platform_code.strip().upper(),
        installation_id=body.installation_id,
        objectives=body.objectives,
        description=body.description,
        current_situation=body.current_situation,
        proposed_changes=body.proposed_changes,
        impact_analysis=body.impact_analysis,
        modification_type=body.modification_type,
        temporary_duration_days=body.temporary_duration_days,
        planned_implementation_date=body.planned_implementation_date,
        tags=body.tags,
        metadata_=body.metadata_,
        status="created",
    )
    db.add(moc)
    await db.flush()
    # Seed the history with the creation event
    db.add(MOCStatusHistory(
        moc_id=moc.id, old_status=None, new_status="created",
        changed_by=current_user.id, note="MOC créé",
    ))
    await record_audit(
        db,
        user_id=current_user.id,
        entity_id=entity_id,
        action="moc.created",
        resource_type="moc",
        resource_id=str(moc.id),
        details={"reference": ref, "site": body.site_label, "platform": body.platform_code},
    )
    await db.commit()
    await db.refresh(moc)

    names = await _user_display(db, {moc.initiator_id})
    return _enrich(moc, names)


# ─── Stats ────────────────────────────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=MOCStatsSummary,
    dependencies=[require_permission("moc.read")],
)
async def stats(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated counters for dashboards."""
    base = select(MOC).where(
        MOC.entity_id == entity_id, MOC.archived == False  # noqa: E712
    )
    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    async def _bucket(col):
        r = await db.execute(
            select(col, func.count()).select_from(base.subquery())
            .group_by(col).order_by(func.count().desc())
        )
        return r.all()

    # By status
    status_rows = (await db.execute(
        select(MOC.status, func.count()).where(
            MOC.entity_id == entity_id, MOC.archived == False  # noqa: E712
        ).group_by(MOC.status).order_by(func.count().desc())
    )).all()
    by_status = [MOCStatsByStatus(status=s, count=c) for s, c in status_rows]

    # By site
    site_rows = (await db.execute(
        select(MOC.site_label, func.count()).where(
            MOC.entity_id == entity_id, MOC.archived == False  # noqa: E712
        ).group_by(MOC.site_label).order_by(func.count().desc())
    )).all()
    by_site = [
        MOCStatsBySite(
            site_label=s or "—",
            count=c,
            percentage=round(100.0 * c / total, 1) if total else 0.0,
        )
        for s, c in site_rows
    ]

    # By modification type
    type_rows = (await db.execute(
        select(MOC.modification_type, func.count()).where(
            MOC.entity_id == entity_id, MOC.archived == False  # noqa: E712
        ).group_by(MOC.modification_type).order_by(func.count().desc())
    )).all()
    by_type = [
        MOCStatsByType(
            modification_type=t or "unspecified",
            count=c,
            percentage=round(100.0 * c / total, 1) if total else 0.0,
        )
        for t, c in type_rows
    ]

    # By priority
    prio_rows = (await db.execute(
        select(MOC.priority, func.count()).where(
            MOC.entity_id == entity_id, MOC.archived == False  # noqa: E712
        ).group_by(MOC.priority).order_by(MOC.priority)
    )).all()
    by_priority = [
        MOCStatsByStatus(status=(p or "unspecified"), count=c) for p, c in prio_rows
    ]

    # Average cycle time (created → closed) in days, only for closed MOCs
    cycle_expr = func.avg(
        func.extract("epoch", MOC.status_changed_at - MOC.created_at) / 86400.0
    )
    cycle = (await db.execute(
        select(cycle_expr).where(
            MOC.entity_id == entity_id,
            MOC.archived == False,  # noqa: E712
            MOC.status == "closed",
        )
    )).scalar()
    avg_cycle = float(cycle) if cycle is not None else None

    return MOCStatsSummary(
        total=total,
        by_status=by_status,
        by_site=by_site,
        by_type=by_type,
        by_priority=by_priority,
        avg_cycle_time_days=round(avg_cycle, 1) if avg_cycle is not None else None,
    )


# ─── FSM description (for the frontend) ───────────────────────────────────────


@router.get("/fsm", dependencies=[require_permission("moc.read")])
async def fsm_description() -> dict:
    """Return the full FSM (read-only) so the frontend can render buttons."""
    return {
        "statuses": list(MOC_STATUSES),
        "transitions": {
            src: [{"to": dst, "permission": perm} for dst, perm in targets.items()]
            for src, targets in FSM.items()
        },
    }


# ─── Detail ───────────────────────────────────────────────────────────────────


@router.get(
    "/{moc_id}",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.read")],
)
async def get_moc(
    moc_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    moc = await _get_or_404(db, moc_id, entity_id, with_details=True)

    # Collect user display names
    uids: set[UUID] = {moc.initiator_id}
    for fk in (moc.site_chief_id, moc.director_id, moc.responsible_id,
               moc.lead_process_id, moc.hierarchy_reviewer_id,
               moc.execution_supervisor_id):
        if fk:
            uids.add(fk)
    for h in moc.status_history:
        uids.add(h.changed_by)
    for v in moc.validations:
        if v.validator_id:
            uids.add(v.validator_id)
    names = await _user_display(db, uids)

    d = _enrich(moc, names)
    d["status_history"] = [
        {
            **MOCStatusHistoryRead.model_validate(h).model_dump(),
            "changed_by_name": names.get(h.changed_by),
        }
        for h in moc.status_history
    ]
    d["validations"] = [
        MOCValidationRead.model_validate(v).model_dump()
        for v in moc.validations
    ]
    return d


# ─── Update ──────────────────────────────────────────────────────────────────


@router.patch(
    "/{moc_id}",
    response_model=MOCRead,
    dependencies=[require_permission("moc.update")],
)
async def update_moc(
    moc_id: UUID,
    body: MOCUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc = await _get_or_404(db, moc_id, entity_id)
    # Only the initiator can edit while status=created. After that, only
    # `moc.update` holders can touch non-protected fields.
    if moc.status == "created" and moc.initiator_id != current_user.id:
        # still allow privileged updates — the route-level permission is already
        # enforced; we add a soft guard so regular users don't modify others' drafts.
        from app.api.deps import has_user_permission
        if not await has_user_permission(current_user, entity_id, "moc.manage", db):
            raise StructuredHTTPException(
                403, code="MOC_EDIT_FORBIDDEN",
                message="Vous ne pouvez modifier que vos propres MOC en statut 'Créé'.",
            )

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(moc, k):
            setattr(moc, k, v)
    # Record hierarchy review if that block changed
    if "hierarchy_review_comment" in data or "is_real_change" in data:
        moc.hierarchy_reviewer_id = current_user.id
        from datetime import UTC, datetime
        moc.hierarchy_review_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(moc)
    names = await _user_display(db, {moc.initiator_id, moc.site_chief_id or moc.initiator_id})
    return _enrich(moc, names)


# ─── Delete (soft) ────────────────────────────────────────────────────────────


@router.delete(
    "/{moc_id}",
    status_code=204,
    dependencies=[require_permission("moc.delete")],
)
async def delete_moc(
    moc_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc = await _get_or_404(db, moc_id, entity_id)
    moc.archived = True
    from datetime import UTC, datetime
    moc.archived_at = datetime.now(UTC)
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.deleted",
        resource_type="moc", resource_id=str(moc.id),
        details={"reference": moc.reference},
    )
    await db.commit()


# ─── Transition ───────────────────────────────────────────────────────────────


@router.post(
    "/{moc_id}/transition",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.transition")],
)
async def transition_moc(
    moc_id: UUID,
    body: MOCTransition,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc = await _get_or_404(db, moc_id, entity_id, with_details=True)
    await transition(
        db, moc=moc, to_status=body.to_status,
        actor=current_user, comment=body.comment, payload=body.payload,
    )
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action=f"moc.transition.{body.to_status}",
        resource_type="moc", resource_id=str(moc.id),
        details={"reference": moc.reference, "to": body.to_status},
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, db=db)


# ─── Validation matrix upsert ─────────────────────────────────────────────────


@router.post(
    "/{moc_id}/validations",
    response_model=MOCValidationRead,
    dependencies=[require_permission("moc.validate")],
)
async def upsert_moc_validation(
    moc_id: UUID,
    body: MOCValidationUpsert,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc = await _get_or_404(db, moc_id, entity_id)
    row = await upsert_validation(
        db,
        moc=moc,
        role=body.role,
        metier_code=body.metier_code,
        validator=current_user,
        required=body.required,
        completed=body.completed,
        approved=body.approved,
        level=body.level,
        comments=body.comments,
    )
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.validation.upserted",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "role": body.role,
            "approved": body.approved,
        },
    )
    await db.commit()
    await db.refresh(row)
    return row
