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
from app.models.moc import MOC, MOCSiteAssignment, MOCStatusHistory, MOC_STATUSES
from app.schemas.common import PaginatedResponse
from app.schemas.moc import (
    MOCCreate,
    MOCExecutionAccord,
    MOCRead,
    MOCReadWithDetails,
    MOCSiteAssignmentCreate,
    MOCSiteAssignmentRead,
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
) -> dict:
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
    """Create a new MOC. Status is always `created` at this point.

    When `installation_id` is provided, `platform_code` and `site_label`
    are auto-derived from the asset registry hierarchy (Installation ←
    Site ← Field). The user doesn't need to retype them — picking the
    installation is enough. Free-text values are still accepted for
    tenants not using asset_registry.
    """
    # ── Auto-derive site/platform from installation_id when available ──
    platform_code = (body.platform_code or "").strip()
    site_label = (body.site_label or "").strip()
    site_id = body.site_id

    if body.installation_id:
        from app.models.asset_registry import Installation, OilSite, OilField
        inst = (await db.execute(
            select(Installation).where(
                Installation.id == body.installation_id,
                Installation.entity_id == entity_id,
            )
        )).scalar_one_or_none()
        if inst:
            platform_code = platform_code or (inst.code or inst.name or "")
            # Walk up the hierarchy: installation → site → field
            site = None
            if inst.site_id:
                site = (await db.execute(
                    select(OilSite).where(OilSite.id == inst.site_id)
                )).scalar_one_or_none()
            if site:
                site_id = site_id or site.id
                if not site_label:
                    # Prefer the field name (RDR EAST / RDR WEST / SOUTH) as the
                    # MOC "site_label" per CDC wording; fall back to site.name.
                    if site.field_id:
                        field = (await db.execute(
                            select(OilField).where(OilField.id == site.field_id)
                        )).scalar_one_or_none()
                        if field:
                            site_label = field.name or field.code or ""
                    site_label = site_label or site.name or site.code or ""

    if not platform_code:
        raise StructuredHTTPException(
            400, code="MOC_MISSING_PLATFORM",
            message="Plateforme requise (choisir une installation ou saisir en texte libre).",
        )
    if not site_label:
        raise StructuredHTTPException(
            400, code="MOC_MISSING_SITE",
            message="Site requis (se déduit automatiquement de l'installation choisie).",
        )

    ref = await generate_reference(
        db, entity_id=entity_id, platform_code=platform_code,
    )
    moc = MOC(
        entity_id=entity_id,
        reference=ref,
        initiator_id=current_user.id,
        initiator_name=body.initiator_name or current_user.full_name,
        initiator_function=body.initiator_function,
        site_label=site_label,
        site_id=site_id,
        platform_code=platform_code.upper(),
        installation_id=body.installation_id,
        objectives=body.objectives,
        description=body.description,
        current_situation=body.current_situation,
        proposed_changes=body.proposed_changes,
        impact_analysis=body.impact_analysis,
        modification_type=body.modification_type,
        temporary_duration_days=body.temporary_duration_days,
        temporary_start_date=body.temporary_start_date,
        temporary_end_date=body.temporary_end_date,
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
    moc.deleted_at = datetime.now(UTC)
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
    # ValidationRow relationship metier_name is optional — pass through
    return row


# ─── Execution accord (DO / DG — paper form p.5 "Réalisation du MOC") ────────


@router.post(
    "/{moc_id}/execution-accord",
    response_model=MOCReadWithDetails,
)
async def set_execution_accord(
    moc_id: UUID,
    body: MOCExecutionAccord,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record the Accord/Refus given by the DO or DG for MOC execution.

    Required permissions:
      * `moc.director.validate_study` for actor="do"
      * `moc.director.validate_study` for actor="dg" (DG uses the same
        permission today; split when the tenant needs distinct gating).

    Both accords (DO + DG = True) are required before transitioning
    validated → execution.
    """
    from datetime import UTC, datetime as _dt
    from app.api.deps import has_user_permission

    # Permission check — DO/DG level mapping
    if not await has_user_permission(
        current_user, entity_id, "moc.director.validate_study", db,
    ) and not await has_user_permission(current_user, entity_id, "moc.manage", db):
        raise StructuredHTTPException(
            403, code="MOC_EXECUTION_ACCORD_FORBIDDEN",
            message="Seul un directeur peut donner l'accord d'exécution.",
        )

    moc = await _get_or_404(db, moc_id, entity_id)
    if moc.status not in ("validated", "execution"):
        # Accord can be revisited during validated state; no-op after execution
        # already started, but don't forbid in case of correction.
        if moc.status != "execution":
            raise StructuredHTTPException(
                400, code="MOC_WRONG_STATE",
                message=(
                    f"Accord exécution possible uniquement en statut 'validated'. "
                    f"Statut actuel : {moc.status}"
                ),
            )

    now = _dt.now(UTC)
    if body.actor == "do":
        moc.do_execution_accord = body.accord
        moc.do_execution_accord_at = now
        moc.do_execution_accord_by = current_user.id
        if body.comment is not None:
            moc.do_execution_comment = body.comment
    else:  # "dg"
        moc.dg_execution_accord = body.accord
        moc.dg_execution_accord_at = now
        moc.dg_execution_accord_by = current_user.id
        if body.comment is not None:
            moc.dg_execution_comment = body.comment

    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action=f"moc.execution_accord.{body.actor}",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "actor": body.actor,
            "accord": body.accord,
        },
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, db=db)


# ─── Site assignments (CDC §4.4 "contacts des valideurs") ───────────────────


@router.get(
    "/site-assignments",
    response_model=list[MOCSiteAssignmentRead],
    dependencies=[require_permission("moc.read")],
)
async def list_site_assignments(
    site_label: str | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    q = select(MOCSiteAssignment).where(MOCSiteAssignment.entity_id == entity_id)
    if site_label:
        q = q.where(MOCSiteAssignment.site_label == site_label)
    q = q.order_by(MOCSiteAssignment.site_label, MOCSiteAssignment.role)
    rows = (await db.execute(q)).scalars().all()

    uids = {r.user_id for r in rows}
    names = await _user_display(db, uids)
    return [
        {
            "id": r.id,
            "site_label": r.site_label,
            "role": r.role,
            "user_id": r.user_id,
            "user_display": names.get(r.user_id),
            "active": r.active,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post(
    "/site-assignments",
    response_model=MOCSiteAssignmentRead,
    status_code=201,
    dependencies=[require_permission("moc.manage")],
)
async def create_site_assignment(
    body: MOCSiteAssignmentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = MOCSiteAssignment(
        entity_id=entity_id,
        site_label=body.site_label,
        role=body.role,
        user_id=body.user_id,
        active=body.active,
    )
    db.add(row)
    try:
        await db.flush()
    except Exception as exc:
        await db.rollback()
        raise StructuredHTTPException(
            409, code="MOC_SITE_ASSIGNMENT_DUPLICATE",
            message="Cet utilisateur est déjà assigné à ce rôle pour ce site.",
        ) from exc

    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.site_assignment.created",
        resource_type="moc_site_assignment", resource_id=str(row.id),
        details={"site": body.site_label, "role": body.role, "user": str(body.user_id)},
    )
    await db.commit()
    await db.refresh(row)
    names = await _user_display(db, {row.user_id})
    return {
        "id": row.id,
        "site_label": row.site_label,
        "role": row.role,
        "user_id": row.user_id,
        "user_display": names.get(row.user_id),
        "active": row.active,
        "created_at": row.created_at,
    }


@router.delete(
    "/site-assignments/{assignment_id}",
    status_code=204,
    dependencies=[require_permission("moc.manage")],
)
async def delete_site_assignment(
    assignment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(MOCSiteAssignment).where(
            MOCSiteAssignment.id == assignment_id,
            MOCSiteAssignment.entity_id == entity_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise StructuredHTTPException(
            404, code="MOC_SITE_ASSIGNMENT_NOT_FOUND",
            message="Assignation non trouvée",
        )
    await db.delete(row)
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.site_assignment.deleted",
        resource_type="moc_site_assignment", resource_id=str(row.id),
        details={"site": row.site_label, "role": row.role},
    )
    await db.commit()
