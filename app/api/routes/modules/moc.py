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

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
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
from app.models.moc import (
    MOC,
    MOCSiteAssignment,
    MOCStatusHistory,
    MOCType,
    MOCTypeValidationRule,
    MOC_STATUSES,
)
from app.schemas.moc import (
    MOCCreate,
    MOCExecutionAccord,
    MOCProductionValidation,
    MOCRead,
    MOCReadWithDetails,
    MOCReturnRequest,
    MOCSignatureUpdate,
    MOCSiteAssignmentCreate,
    MOCSiteAssignmentRead,
    MOCStatsByStatus,
    MOCStatsBySite,
    MOCStatsByType,
    MOCStatsSummary,
    MOCStatusHistoryRead,
    MOCTransition,
    MOCTypeCreate,
    MOCTypeReadWithRules,
    MOCTypeUpdate,
    MOCTypeValidationRuleCreate,
    MOCTypeValidationRuleRead,
    MOCTypeValidationRuleUpdate,
    MOCUpdate,
    MOCValidationInvite,
    MOCValidationRead,
    MOCValidationUpsert,
)
from app.services.modules.moc_service import (
    FSM,
    generate_reference,
    invite_validator,
    seed_matrix_from_type,
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


# Fixed signature slots stored inline on the MOC row (base64 PNG data URLs).
# Kept as a tuple so the redaction helper hits every one.
_MOC_SIGNATURE_FIELDS: tuple[str, ...] = (
    "initiator_signature",
    "hierarchy_reviewer_signature",
    "site_chief_signature",
    "director_signature",
    "process_engineer_signature",
    "production_signature",
    "do_signature",
    "dg_signature",
    "close_signature",
)
_MOC_SIGNATURE_SIGNER_FK: dict[str, str] = {
    "initiator_signature": "initiator_id",
    "hierarchy_reviewer_signature": "hierarchy_reviewer_id",
    "site_chief_signature": "site_chief_id",
    "director_signature": "director_id",
    "process_engineer_signature": "responsible_id",
    "production_signature": "production_validated_by",
    "do_signature": "do_execution_accord_by",
    "dg_signature": "dg_execution_accord_by",
    "close_signature": "close_by",
}


async def _redact_signatures(
    d: dict[str, Any],
    *,
    moc: MOC,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Replace signature PNG data URLs with a sentinel when the current
    user is not authorised to view them.

    A user is authorised when any of these is true:
      • they hold `moc.signature.view` (granular opt-in permission)
      • they hold `moc.manage` (admin override)
      • they are the signer themselves (FK check against the slot owner)
      • for a given per-validator row, they are the validator_id

    The sentinel `__REDACTED__` is recognised by the frontend
    ProtectedSignature component, which shows "— protégée —" instead.

    Dict is mutated in-place and returned for convenience.
    """
    from app.api.deps import has_user_permission

    # Fast path — admins/signature-viewers see everything.
    if await has_user_permission(user, entity_id, "moc.manage", db):
        return d
    can_view_all = await has_user_permission(
        user, entity_id, "moc.signature.view", db,
    )
    if can_view_all:
        return d

    # Per-slot check: own signature always visible to its signer.
    for field in _MOC_SIGNATURE_FIELDS:
        if d.get(field) is None:
            continue
        fk = _MOC_SIGNATURE_SIGNER_FK[field]
        owner_id = getattr(moc, fk, None)
        if owner_id and owner_id == user.id:
            continue
        d[field] = "__REDACTED__"

    # Per-validator signatures on the validations matrix (when present).
    for v in d.get("validations") or []:
        sig = v.get("signature")
        if not sig:
            continue
        if v.get("validator_id") and str(v["validator_id"]) == str(user.id):
            continue
        v["signature"] = "__REDACTED__"

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
    enriched: list[dict[str, Any]] = []
    for m in mocs:
        d = _enrich(m, names)
        await _redact_signatures(
            d, moc=m, user=current_user, entity_id=entity_id, db=db,
        )
        enriched.append(d)
    page["items"] = enriched
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
    # Validate moc_type_id scoping if provided
    if body.moc_type_id:
        valid_type = (await db.execute(
            select(MOCType).where(
                MOCType.id == body.moc_type_id,
                MOCType.entity_id == entity_id,
                MOCType.active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if not valid_type:
            raise StructuredHTTPException(
                400, code="MOC_TYPE_INVALID",
                message="Type de MOC invalide ou désactivé.",
            )

    moc = MOC(
        entity_id=entity_id,
        reference=ref,
        initiator_id=current_user.id,
        initiator_name=body.initiator_name or current_user.full_name,
        initiator_function=body.initiator_function,
        initiator_email=body.initiator_email or current_user.email,
        initiator_external_name=body.initiator_external_name,
        initiator_external_function=body.initiator_external_function,
        initiator_signature=body.initiator_signature,
        manager_id=body.manager_id,
        title=(body.title.strip() if body.title else None),
        nature=body.nature,
        metiers=body.metiers,
        site_label=site_label,
        site_id=site_id,
        platform_code=platform_code.upper(),
        installation_id=body.installation_id,
        moc_type_id=body.moc_type_id,
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
    # Seed the validation matrix from the chosen MOC type (if any)
    if body.moc_type_id:
        await seed_matrix_from_type(db, moc=moc, moc_type_id=body.moc_type_id)
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


# ─── MOC Types (catalogue + validation matrix template) ─────────────────────
#
# Declared before "/{moc_id}" to prevent the UUID matcher from swallowing
# the literal "types" segment. All mutating endpoints gate on `moc.manage`.


async def _get_type_or_404(
    db: AsyncSession, type_id: UUID, entity_id: UUID, *, with_rules: bool = False,
) -> MOCType:
    stmt = select(MOCType).where(
        MOCType.id == type_id,
        MOCType.entity_id == entity_id,
        MOCType.archived == False,  # noqa: E712
    )
    if with_rules:
        stmt = stmt.options(selectinload(MOCType.rules))
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise StructuredHTTPException(
            404, code="MOC_TYPE_NOT_FOUND", message="Type de MOC introuvable",
        )
    return row


@router.get(
    "/types",
    response_model=list[MOCTypeReadWithRules],
    dependencies=[require_permission("moc.read")],
)
async def list_moc_types(
    include_inactive: bool = Query(False),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(MOCType)
        .where(
            MOCType.entity_id == entity_id,
            MOCType.archived == False,  # noqa: E712
        )
        .options(selectinload(MOCType.rules))
        .order_by(MOCType.label)
    )
    if not include_inactive:
        q = q.where(MOCType.active == True)  # noqa: E712
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post(
    "/types",
    response_model=MOCTypeReadWithRules,
    status_code=201,
    dependencies=[require_permission("moc.manage")],
)
async def create_moc_type(
    body: MOCTypeCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = MOCType(
        entity_id=entity_id,
        code=body.code.strip(),
        label=body.label.strip(),
        description=body.description,
        active=body.active,
    )
    db.add(row)
    try:
        await db.flush()
    except Exception as exc:
        await db.rollback()
        raise StructuredHTTPException(
            409, code="MOC_TYPE_DUPLICATE",
            message="Un type avec ce code existe déjà.",
        ) from exc
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.type.created", resource_type="moc_type",
        resource_id=str(row.id),
        details={"code": row.code, "label": row.label},
    )
    await db.commit()
    # Re-load with rules relation populated for the response
    return await _get_type_or_404(db, row.id, entity_id, with_rules=True)


@router.get(
    "/types/{type_id}",
    response_model=MOCTypeReadWithRules,
    dependencies=[require_permission("moc.read")],
)
async def get_moc_type(
    type_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    return await _get_type_or_404(db, type_id, entity_id, with_rules=True)


@router.patch(
    "/types/{type_id}",
    response_model=MOCTypeReadWithRules,
    dependencies=[require_permission("moc.manage")],
)
async def update_moc_type(
    type_id: UUID,
    body: MOCTypeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_type_or_404(db, type_id, entity_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.type.updated", resource_type="moc_type",
        resource_id=str(row.id), details=data,
    )
    return await _get_type_or_404(db, type_id, entity_id, with_rules=True)


@router.delete(
    "/types/{type_id}",
    status_code=204,
    dependencies=[require_permission("moc.manage")],
)
async def delete_moc_type(
    type_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_type_or_404(db, type_id, entity_id)
    row.archived = True
    from datetime import UTC as _UTC, datetime as _dt
    row.deleted_at = _dt.now(_UTC)
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.type.deleted", resource_type="moc_type",
        resource_id=str(row.id), details={"code": row.code},
    )
    await db.commit()


# ── Rules (validation matrix template) ──


@router.post(
    "/types/{type_id}/rules",
    response_model=MOCTypeValidationRuleRead,
    status_code=201,
    dependencies=[require_permission("moc.manage")],
)
async def add_moc_type_rule(
    type_id: UUID,
    body: MOCTypeValidationRuleCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    moc_type = await _get_type_or_404(db, type_id, entity_id)
    rule = MOCTypeValidationRule(
        moc_type_id=moc_type.id,
        role=body.role,
        metier_code=body.metier_code,
        metier_name=body.metier_name,
        required=body.required,
        level=body.level,
        position=body.position,
        active=body.active,
    )
    db.add(rule)
    try:
        await db.flush()
    except Exception as exc:
        await db.rollback()
        raise StructuredHTTPException(
            409, code="MOC_TYPE_RULE_DUPLICATE",
            message="Une règle identique existe déjà pour ce rôle/métier.",
        ) from exc
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.type_rule.created", resource_type="moc_type_rule",
        resource_id=str(rule.id),
        details={"moc_type_id": str(type_id), "role": body.role},
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch(
    "/types/{type_id}/rules/{rule_id}",
    response_model=MOCTypeValidationRuleRead,
    dependencies=[require_permission("moc.manage")],
)
async def update_moc_type_rule(
    type_id: UUID,
    rule_id: UUID,
    body: MOCTypeValidationRuleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_type_or_404(db, type_id, entity_id)
    rule = (await db.execute(
        select(MOCTypeValidationRule).where(
            MOCTypeValidationRule.id == rule_id,
            MOCTypeValidationRule.moc_type_id == type_id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise StructuredHTTPException(
            404, code="MOC_TYPE_RULE_NOT_FOUND", message="Règle introuvable",
        )
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete(
    "/types/{type_id}/rules/{rule_id}",
    status_code=204,
    dependencies=[require_permission("moc.manage")],
)
async def delete_moc_type_rule(
    type_id: UUID,
    rule_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_type_or_404(db, type_id, entity_id)
    rule = (await db.execute(
        select(MOCTypeValidationRule).where(
            MOCTypeValidationRule.id == rule_id,
            MOCTypeValidationRule.moc_type_id == type_id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise StructuredHTTPException(
            404, code="MOC_TYPE_RULE_NOT_FOUND", message="Règle introuvable",
        )
    await db.delete(rule)
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.type_rule.deleted", resource_type="moc_type_rule",
        resource_id=str(rule_id),
        details={"moc_type_id": str(type_id)},
    )
    await db.commit()


# ─── Detail ───────────────────────────────────────────────────────────────────


@router.get(
    "/{moc_id}",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.read")],
)
async def get_moc(
    moc_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
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
    # ── Linked project summary (set when the MOC has been promoted) ──
    # Exposed as a compact object the UI can render in the Exécution
    # tab without a second fetch. Keeps the contract lightweight:
    # code / name / status / progress + start/end dates.
    if moc.project_id:
        from app.models.common import Project as _Project
        proj = (await db.execute(
            select(_Project).where(_Project.id == moc.project_id)
        )).scalar_one_or_none()
        if proj:
            d["linked_project"] = {
                "id": str(proj.id),
                "code": proj.code,
                "name": proj.name,
                "status": proj.status,
                "progress": proj.progress,
                "start_date": proj.start_date.isoformat() if proj.start_date else None,
                "end_date": proj.end_date.isoformat() if proj.end_date else None,
                "actual_end_date": (
                    proj.actual_end_date.isoformat()
                    if proj.actual_end_date else None
                ),
                "manager_id": str(proj.manager_id) if proj.manager_id else None,
            }
    # Redact signature data URLs for users without moc.signature.view
    # (own signature + moc.manage stay visible).
    await _redact_signatures(
        d, moc=moc, user=current_user, entity_id=entity_id, db=db,
    )
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
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


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
        signature=body.signature,
        return_requested=body.return_requested,
        return_reason=body.return_reason,
        target_validator_id=body.target_validator_id,
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


# ─── PDF report (Formulaire MOC — Perenco rev. 06) ──────────────────────────


@router.get(
    "/{moc_id}/pdf",
    responses={200: {"content": {"application/pdf": {}}}},
    dependencies=[require_permission("moc.read")],
)
async def export_moc_pdf(
    moc_id: UUID,
    language: str = Query("fr", pattern="^(fr|en)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Render the MOC as a PDF matching the Perenco paper form template.

    Admin can override the HTML/CSS via Settings → PDF Templates (slug
    `moc.report`) without touching the code. Body variables are documented
    in `DEFAULT_PDF_TEMPLATES` for the slug.
    """
    from datetime import UTC, datetime as _dt
    from html import escape as _html_escape
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity

    def render_markdown(txt: str | None) -> str | None:
        """Pass-through + migration helper.

        Since the frontend moved to Tiptap, every new record ships HTML
        already. Legacy records may still contain a plain-text or very
        simple Markdown string (lists with `- `, paragraphs separated by
        blank lines). We detect HTML by a quick "<" sniff and:
          * return HTML as-is → WeasyPrint renders it
          * otherwise, convert line-by-line (bullets → ul/li, else <p>)
            to keep the PDF readable for old rows.
        Templates always feed the output through Jinja's `| safe` filter,
        so WeasyPrint receives consumable HTML in both cases.
        """
        if not txt:
            return None
        stripped = txt.strip()
        # Tiptap output always starts with a block tag; treat as HTML.
        if stripped.startswith("<"):
            return stripped
        # Legacy plain-text / markdown fallback.
        lines = txt.splitlines()
        out: list[str] = []
        in_list = False
        for line in lines:
            s = line.lstrip()
            if s.startswith(("- ", "* ")):
                if not in_list:
                    out.append("<ul>")
                    in_list = True
                out.append(f"<li>{_html_escape(s[2:])}</li>")
            else:
                if in_list:
                    out.append("</ul>")
                    in_list = False
                if s:
                    out.append(f"<p>{_html_escape(line)}</p>")
        if in_list:
            out.append("</ul>")
        return "".join(out)

    moc = await _get_or_404(db, moc_id, entity_id, with_details=True)

    # Resolve display names (initiator, site_chief, director, responsible,
    # plus every validator).
    uids: set[UUID] = {moc.initiator_id}
    for fk in (moc.site_chief_id, moc.director_id, moc.responsible_id):
        if fk:
            uids.add(fk)
    for v in moc.validations or []:
        if v.validator_id:
            uids.add(v.validator_id)
    names = await _user_display(db, uids)

    entity = (await db.execute(
        select(Entity).where(Entity.id == entity_id)
    )).scalar_one_or_none()

    # Service-side labels — dictionary lookups would be heavier; keep the
    # canonical FR labels here and let the template admin tweak the HTML
    # for language-specific wording.
    ROLE_LABELS = {
        "hse": "HSE / Safety",
        "lead_process": "Lead Process",
        "production_manager": "Production Manager",
        "gas_manager": "Gas Manager",
        "maintenance_manager": "Maintenance Manager",
        "process_engineer": "Process Engineer",
        "metier": "Métier",
    }
    COST_BUCKET_LABELS = {
        "lt_20": "< 20 MXAF",
        "20_to_50": "20 – 50 MXAF",
        "50_to_100": "50 – 100 MXAF",
        "gt_100": "> 100 MXAF",
    }
    STATUS_LABELS = {
        "created": "Créé",
        "approved": "Approuvé",
        "submitted_to_confirm": "Soumis à confirmer",
        "cancelled": "Annulé",
        "stand_by": "Stand-by",
        "approved_to_study": "Confirmé à étudier",
        "under_study": "En étude Process",
        "study_in_validation": "Étudié en validation",
        "validated": "Validé à exécuter",
        "execution": "Exécution",
        "executed_docs_pending": "Exécuté — docs en attente",
        "closed": "Clôturé",
    }

    def _fmt_date(d) -> str | None:
        if d is None:
            return None
        return d.strftime("%d/%m/%Y") if hasattr(d, "strftime") else str(d)

    # Signature redaction context computed up-front so both the fixed
    # slots (_sig below) and per-validator signatures share the same rule.
    from app.api.deps import has_user_permission as _has_perm
    _can_sigs = (
        await _has_perm(current_user, entity_id, "moc.signature.view", db)
        or await _has_perm(current_user, entity_id, "moc.manage", db)
    )

    def _vsig(v: "MOCValidation") -> str | None:
        if not v.signature:
            return None
        if _can_sigs:
            return v.signature
        if v.validator_id and v.validator_id == current_user.id:
            return v.signature
        return None  # redacted in the PDF

    validations_payload = []
    for v in moc.validations or []:
        validations_payload.append({
            "role_label": ROLE_LABELS.get(v.role, v.role),
            "metier_name": v.metier_name,
            "validator_name": v.validator_name or names.get(v.validator_id) if v.validator_id else None,
            "comments": render_markdown(v.comments) if v.comments else None,
            "validated_at": _fmt_date(v.validated_at),
            "approved": v.approved,
            "level": v.level,
            "signature": _vsig(v),
            "return_requested": v.return_requested,
            "return_reason": v.return_reason,
        })

    # Fetch MOC type label lazily (avoid a join when not needed)
    moc_type_label = None
    if moc.moc_type_id:
        row = (await db.execute(
            select(MOCType.label).where(MOCType.id == moc.moc_type_id)
        )).scalar_one_or_none()
        moc_type_label = row

    # Signature redaction in the PDF — same rule as the UI. `_can_sigs` was
    # already computed up-front for the validations_payload; we reuse it.
    def _sig(field_name: str, signer_fk: str | None = None) -> str | None:
        raw = getattr(moc, field_name, None)
        if not raw:
            return None
        if _can_sigs:
            return raw
        # Always allow the signer to see their own signature in the PDF
        if signer_fk:
            owner = getattr(moc, signer_fk, None)
            if owner and owner == current_user.id:
                return raw
        return None  # redacted — template renders an empty visa box

    variables = {
        "reference": moc.reference,
        "title": moc.title,
        "nature": moc.nature,
        "metiers": moc.metiers or [],
        "status_label": STATUS_LABELS.get(moc.status, moc.status),
        "moc_type_label": moc_type_label,
        "site_label": moc.site_label,
        "platform_code": moc.platform_code,
        "initiator_display": (
            moc.initiator_external_name
            or names.get(moc.initiator_id)
            or moc.initiator_name
        ),
        "initiator_function": moc.initiator_external_function or moc.initiator_function,
        "initiator_email": moc.initiator_email,
        "initiator_signature": _sig("initiator_signature", "initiator_id"),
        "created_at": _fmt_date(moc.created_at),
        "objectives": moc.objectives,
        "description": render_markdown(moc.description) if moc.description else None,
        "current_situation": render_markdown(moc.current_situation) if moc.current_situation else None,
        "proposed_changes": render_markdown(moc.proposed_changes) if moc.proposed_changes else None,
        "impact_analysis": render_markdown(moc.impact_analysis) if moc.impact_analysis else None,
        "modification_type_label": (
            "Permanent" if moc.modification_type == "permanent"
            else "Temporaire" if moc.modification_type == "temporary"
            else None
        ),
        "temporary_start_date": _fmt_date(moc.temporary_start_date),
        "temporary_end_date": _fmt_date(moc.temporary_end_date),
        "is_real_change": moc.is_real_change,
        "hierarchy_review_comment": moc.hierarchy_review_comment,
        "site_chief_approved": moc.site_chief_approved,
        "site_chief_display": names.get(moc.site_chief_id) if moc.site_chief_id else None,
        "site_chief_approved_at": _fmt_date(moc.site_chief_approved_at),
        "site_chief_comment": moc.site_chief_comment,
        "hierarchy_reviewer_signature": _sig("hierarchy_reviewer_signature", "hierarchy_reviewer_id"),
        "site_chief_signature": _sig("site_chief_signature", "site_chief_id"),
        "close_signature": _sig("close_signature", "close_by"),
        "site_chief_return_requested": moc.site_chief_return_requested,
        "site_chief_return_reason": moc.site_chief_return_reason,
        # Production mise-en-étude (Daxium tab 3)
        "production_validated": moc.production_validated,
        "production_validated_at": _fmt_date(moc.production_validated_at),
        "production_comment": moc.production_comment,
        "production_signature": _sig("production_signature", "production_validated_by"),
        "production_return_requested": moc.production_return_requested,
        "production_return_reason": moc.production_return_reason,
        "director_display": names.get(moc.director_id) if moc.director_id else None,
        "director_confirmed_at": _fmt_date(moc.director_confirmed_at),
        "director_comment": moc.director_comment,
        "director_signature": _sig("director_signature", "director_id"),
        "priority": moc.priority,
        "estimated_cost_mxaf": float(moc.estimated_cost_mxaf) if moc.estimated_cost_mxaf is not None else None,
        "cost_bucket_label": COST_BUCKET_LABELS.get(moc.cost_bucket) if moc.cost_bucket else None,
        "hazop_required": moc.hazop_required,
        "hazop_completed": moc.hazop_completed,
        "hazid_required": moc.hazid_required,
        "hazid_completed": moc.hazid_completed,
        "environmental_required": moc.environmental_required,
        "environmental_completed": moc.environmental_completed,
        "pid_update_required": moc.pid_update_required,
        "pid_update_completed": moc.pid_update_completed,
        "esd_update_required": moc.esd_update_required,
        "esd_update_completed": moc.esd_update_completed,
        "study_conclusion": render_markdown(moc.study_conclusion) if moc.study_conclusion else None,
        "responsible_display": names.get(moc.responsible_id) if moc.responsible_id else None,
        "process_engineer_signature": _sig("process_engineer_signature", "responsible_id"),
        "study_completed_at": _fmt_date(moc.study_completed_at),
        "validations": validations_payload,
        "do_execution_accord": moc.do_execution_accord,
        "do_execution_accord_at": _fmt_date(moc.do_execution_accord_at),
        "do_execution_comment": moc.do_execution_comment,
        "do_signature": _sig("do_signature", "do_execution_accord_by"),
        "do_return_requested": moc.do_return_requested,
        "do_return_reason": moc.do_return_reason,
        "dg_execution_accord": moc.dg_execution_accord,
        "dg_execution_accord_at": _fmt_date(moc.dg_execution_accord_at),
        "dg_execution_comment": moc.dg_execution_comment,
        "dg_signature": _sig("dg_signature", "dg_execution_accord_by"),
        "dg_return_requested": moc.dg_return_requested,
        "dg_return_reason": moc.dg_return_reason,
        "entity": {
            "name": entity.name if entity else None,
            "code": entity.code if entity else None,
        },
        "generated_at": _dt.now(UTC).strftime("%d/%m/%Y %H:%M UTC"),
    }

    pdf_bytes = await render_pdf(
        db, slug="moc.report", entity_id=entity_id,
        language=language, variables=variables,
    )
    if pdf_bytes is None:
        raise StructuredHTTPException(
            404, code="MOC_PDF_TEMPLATE_MISSING",
            message=(
                "Le modèle PDF 'moc.report' n'est pas configuré pour cette "
                "entité. L'admin doit le seed via Config → PDF Templates."
            ),
        )

    filename = f"{moc.reference}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Return for rework (Daxium "renvoi pour modification") ──────────────────


@router.post(
    "/{moc_id}/return",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.update")],
)
async def request_moc_return(
    moc_id: UUID,
    body: MOCReturnRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a 'return for rework' request at a given stage.

    Unlike `/transition` which advances the FSM, this endpoint captures the
    fact that the actor (CDS / Production / DO / DG / validator) wants
    modifications. The MOC is pushed back to `created` (for site_chief /
    production returns) or `under_study` (for DO / DG / validator returns
    made after the study). The motive is stored in the matching field +
    added to the status history for audit.
    """
    from datetime import UTC, datetime as _dt

    moc = await _get_or_404(db, moc_id, entity_id, with_details=True)
    now = _dt.now(UTC)
    old_status = moc.status
    target_status: str

    if body.stage == "site_chief":
        moc.site_chief_return_requested = True
        moc.site_chief_return_reason = body.reason
        moc.site_chief_id = moc.site_chief_id or current_user.id
        target_status = "created"
    elif body.stage == "production":
        moc.production_return_requested = True
        moc.production_return_reason = body.reason
        moc.production_validated = False
        moc.production_validated_by = current_user.id
        moc.production_validated_at = now
        target_status = "created"
    elif body.stage == "do":
        moc.do_return_requested = True
        moc.do_return_reason = body.reason
        moc.do_execution_accord = False
        moc.do_execution_accord_at = now
        moc.do_execution_accord_by = current_user.id
        target_status = "under_study"
    elif body.stage == "dg":
        moc.dg_return_requested = True
        moc.dg_return_reason = body.reason
        moc.dg_execution_accord = False
        moc.dg_execution_accord_at = now
        moc.dg_execution_accord_by = current_user.id
        target_status = "under_study"
    elif body.stage == "validator":
        if not body.validation_id:
            raise StructuredHTTPException(
                400, code="MOC_RETURN_MISSING_VALIDATION",
                message="validation_id requis pour un renvoi par validateur",
            )
        from app.models.moc import MOCValidation
        row = (await db.execute(
            select(MOCValidation).where(
                MOCValidation.id == body.validation_id,
                MOCValidation.moc_id == moc.id,
            )
        )).scalar_one_or_none()
        if not row:
            raise StructuredHTTPException(
                404, code="MOC_VALIDATION_NOT_FOUND",
                message="Ligne de validation introuvable",
            )
        row.return_requested = True
        row.return_reason = body.reason
        row.validator_id = row.validator_id or current_user.id
        row.validator_name = row.validator_name or current_user.full_name
        target_status = "under_study"
    else:
        raise StructuredHTTPException(
            400, code="MOC_RETURN_INVALID_STAGE", message="Étape inconnue",
        )

    # Push the MOC back to the rework status (skip if already there).
    if moc.status != target_status:
        moc.status = target_status
        moc.status_changed_at = now
        db.add(MOCStatusHistory(
            moc_id=moc.id,
            old_status=old_status,
            new_status=target_status,
            changed_by=current_user.id,
            note=f"[Renvoi {body.stage}] {body.reason}",
        ))

    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action=f"moc.return.{body.stage}",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "stage": body.stage,
            "from_status": old_status,
            "to_status": target_status,
        },
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


# ─── Production mise-en-étude (Daxium tab 3 "Validation pour mise en étude") ─


@router.post(
    "/{moc_id}/production-validation",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.production.validate")],
)
async def set_production_validation(
    moc_id: UUID,
    body: MOCProductionValidation,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record the Production service's approval to proceed with the study.

    Captures: validated flag, comment, optional signature + priority
    override + optional return-for-rework request.
    """
    from datetime import UTC, datetime as _dt

    moc = await _get_or_404(db, moc_id, entity_id)
    now = _dt.now(UTC)
    moc.production_validated = body.validated
    moc.production_validated_by = current_user.id
    moc.production_validated_at = now
    if body.comment is not None:
        moc.production_comment = body.comment
    if body.signature is not None:
        moc.production_signature = body.signature
    if body.priority is not None:
        moc.priority = body.priority
    if body.return_requested:
        moc.production_return_requested = True
        moc.production_return_reason = body.return_reason

    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.production_validation",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "validated": body.validated,
            "priority": body.priority,
            "return": body.return_requested,
        },
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


# ─── Signature capture at a named slot ─────────────────────────────────────


@router.post(
    "/{moc_id}/signature",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.update")],
)
async def set_moc_signature(
    moc_id: UUID,
    body: MOCSignatureUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store a base64 PNG signature at a named MOC slot.

    Slots: initiator, site_chief, production, director, process_engineer,
    do, dg. For per-validator signatures use the /validations upsert
    endpoint instead.
    """
    moc = await _get_or_404(db, moc_id, entity_id)
    slot_map = {
        "initiator": "initiator_signature",
        "hierarchy_reviewer": "hierarchy_reviewer_signature",
        "site_chief": "site_chief_signature",
        "production": "production_signature",
        "director": "director_signature",
        "process_engineer": "process_engineer_signature",
        "do": "do_signature",
        "dg": "dg_signature",
        "close": "close_signature",
    }
    column = slot_map.get(body.slot)
    if not column:
        raise StructuredHTTPException(
            400, code="MOC_SIGNATURE_INVALID_SLOT", message="Slot inconnu",
        )
    setattr(moc, column, body.signature)
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action=f"moc.signature.{body.slot}",
        resource_type="moc", resource_id=str(moc.id),
        details={"slot": body.slot},
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


# ─── Promote a validated MOC to a Project ────────────────────────────────────


@router.post(
    "/{moc_id}/promote-to-project",
    response_model=MOCReadWithDetails,
    dependencies=[require_permission("moc.promote")],
)
async def promote_moc_to_project(
    moc_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Spawn a Project entity from a MOC once it has been validated.

    The project inherits:
      • code  = MOC reference  (e.g. `MOC_001_BRF1`)
      • name  = MOC title or objectives
      • description = MOC description
      • manager_id = MOC manager_id (fallback to current user)
      • asset_id = MOC installation_id (when set)
      • start_date = planned_implementation_date
    Subsequent project progress updates will be mirrored onto the MOC
    through the usual project progress roll-up (see `_sync_moc_progress`).

    Allowed only when the MOC is in one of the following statuses:
      validated · execution · executed_docs_pending
    — earlier states can't be promoted, closed ones are already done.
    """
    from datetime import UTC, datetime as _dt
    from app.models.common import Project

    moc = await _get_or_404(db, moc_id, entity_id)
    if moc.status not in ("validated", "execution", "executed_docs_pending"):
        raise StructuredHTTPException(
            400, code="MOC_NOT_PROMOTABLE",
            message=(
                "Promotion en projet possible uniquement quand le MOC est "
                "validé, en exécution, ou en mise à jour documentaire."
            ),
        )
    if moc.project_id:
        raise StructuredHTTPException(
            409, code="MOC_ALREADY_PROMOTED",
            message="Ce MOC est déjà lié à un projet.",
            params={"project_id": str(moc.project_id)},
        )

    project = Project(
        entity_id=entity_id,
        code=moc.reference,
        name=(moc.title or moc.objectives or moc.reference)[:300],
        description=moc.description,
        project_type="project",
        status="active",
        priority=(
            "high" if moc.priority == "1"
            else "medium" if moc.priority == "2"
            else "low" if moc.priority == "3"
            else "medium"
        ),
        manager_id=moc.manager_id or current_user.id,
        asset_id=moc.installation_id,
        start_date=(
            _dt.combine(moc.planned_implementation_date, _dt.min.time()).replace(tzinfo=UTC)
            if moc.planned_implementation_date
            else _dt.now(UTC)
        ),
        external_ref=f"moc:{moc.id}",
    )
    db.add(project)
    await db.flush()
    moc.project_id = project.id
    if not moc.manager_id:
        moc.manager_id = current_user.id

    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.promoted_to_project",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "project_id": str(project.id),
            "project_code": project.code,
        },
    )
    await db.commit()
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


# ─── Invite validator (ad-hoc, on top of the matrix) ─────────────────────────


@router.post(
    "/{moc_id}/validations/invite",
    response_model=MOCValidationRead,
    status_code=201,
    dependencies=[require_permission("moc.validator.invite")],
)
async def invite_moc_validator(
    moc_id: UUID,
    body: MOCValidationInvite,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a specific user to validate an MOC.

    The invited user must exist on the current entity. The resulting
    `MOCValidation` row has source='invite' and carries `invited_by`/
    `invited_at` metadata. Multiple users can be invited for the same
    role (e.g. cross-review), which is why uniqueness now includes
    `validator_id`.
    """
    moc = await _get_or_404(db, moc_id, entity_id)

    invited_user = (await db.execute(
        select(User).where(User.id == body.user_id, User.active == True)  # noqa: E712
    )).scalar_one_or_none()
    if not invited_user:
        raise StructuredHTTPException(
            400, code="MOC_INVITE_USER_NOT_FOUND",
            message="Utilisateur à inviter introuvable ou inactif.",
        )

    row = await invite_validator(
        db,
        moc=moc,
        user=invited_user,
        invited_by=current_user,
        role=body.role,
        metier_code=body.metier_code,
        metier_name=body.metier_name,
        level=body.level,
        required=body.required,
        comments=body.comments,
    )
    await record_audit(
        db, user_id=current_user.id, entity_id=entity_id,
        action="moc.validator.invited",
        resource_type="moc", resource_id=str(moc.id),
        details={
            "reference": moc.reference,
            "invitee": str(invited_user.id),
            "role": body.role,
        },
    )
    await db.commit()
    await db.refresh(row)

    # Best-effort in-app notification to the invitee so they find the MOC.
    try:
        from app.core.notifications import send_in_app_bulk
        await send_in_app_bulk(
            db,
            user_ids=[invited_user.id],
            entity_id=entity_id,
            title=f"MOC {moc.reference} — invitation à valider",
            body=(
                f"{current_user.full_name or current_user.email} vous a invité "
                f"à valider le MOC « {moc.reference} » (rôle : {body.role})."
            ),
            category="info",
            link=f"/moc?id={moc.id}",
            event_type="moc.validator_invited",
        )
    except Exception:
        logger.exception("Invite notification failed for MOC %s", moc.reference)

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
        if body.signature is not None:
            moc.do_signature = body.signature
        if body.return_requested:
            moc.do_return_requested = True
            moc.do_return_reason = body.return_reason
    else:  # "dg"
        moc.dg_execution_accord = body.accord
        moc.dg_execution_accord_at = now
        moc.dg_execution_accord_by = current_user.id
        if body.comment is not None:
            moc.dg_execution_comment = body.comment
        if body.signature is not None:
            moc.dg_signature = body.signature
        if body.return_requested:
            moc.dg_return_requested = True
            moc.dg_return_reason = body.return_reason

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
    return await get_moc(moc_id=moc.id, entity_id=entity_id, current_user=current_user, db=db)


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
