"""Planner module routes — activities, conflicts, capacity scheduling.

Integrates with:
- Asset Registry: reads max_pax / permanent_ops_quota for capacity
- Projets: accepts push-to-planner from project tasks
- PaxLog: emits events on activity validation/cancellation
- Workflow Engine: FSM service manages status transitions with row-level
  locking, role guards, and audit trail (D-014)
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sqla_func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.events import OpsFluxEvent, event_bus
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import Installation
from app.models.common import Project, User
from app.models.planner import (
    PlannerActivity,
    PlannerConflict,
    PlannerConflictActivity,
    PlannerConflictAudit,
    PlannerActivityDependency,
)
from app.schemas.planner import (
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    ConflictRead,
    ConflictResolve,
    BulkConflictResolveRequest,
    BulkConflictResolveResult,
    ConflictAuditRead,
    CapacityRead,
    DependencyCreate,
    DependencyRead,
)
from app.schemas.common import PaginatedResponse
from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError

router = APIRouter(prefix="/api/v1/planner", tags=["planner"])
logger = logging.getLogger(__name__)

PLANNER_WORKFLOW_SLUG = "planner-activity"
PLANNER_ENTITY_TYPE = "planner_activity"


async def _try_workflow_transition(
    db: AsyncSession,
    *,
    entity_id_str: str,
    to_state: str,
    actor_id: UUID,
    entity_id_scope: UUID,
    comment: str | None = None,
) -> tuple[str | None, object | None]:
    """Attempt FSM transition for a planner activity.

    Returns (from_state, instance) if workflow definition exists.
    Returns (None, None) if no definition found (graceful fallback).
    Raises HTTPException on permission errors.
    """
    try:
        instance = await fsm_service.transition(
            db,
            workflow_slug=PLANNER_WORKFLOW_SLUG,
            entity_type=PLANNER_ENTITY_TYPE,
            entity_id=entity_id_str,
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
            entity_id_scope=entity_id_scope,
        )
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        if "not found" in str(e).lower():
            logger.debug(
                "No workflow definition '%s' found — direct status update",
                PLANNER_WORKFLOW_SLUG,
            )
            return None, None
        raise HTTPException(400, str(e))


# ── Helpers ───────────────────────────────────────────────────────────────


async def _get_activity_or_404(
    db: AsyncSession, activity_id: UUID, entity_id: UUID
) -> PlannerActivity:
    result = await db.execute(
        select(PlannerActivity).where(
            PlannerActivity.id == activity_id,
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,
        )
    )
    activity = result.scalars().first()
    if not activity:
        raise HTTPException(404, "Activity not found")
    return activity


async def _enrich_activity(db: AsyncSession, activity: PlannerActivity) -> dict:
    """Build a dict from an activity with enriched names."""
    d = {c.key: getattr(activity, c.key) for c in activity.__table__.columns}
    # Installation name
    asset = await db.get(Installation, activity.asset_id)
    d["asset_name"] = asset.name if asset else None
    # Project name
    if activity.project_id:
        project = await db.get(Project, activity.project_id)
        d["project_name"] = project.name if project else None
    else:
        d["project_name"] = None
    # Created by name
    creator = await db.get(User, activity.created_by)
    d["created_by_name"] = f"{creator.first_name} {creator.last_name}" if creator else None
    # Submitted by name
    if activity.submitted_by:
        submitter = await db.get(User, activity.submitted_by)
        d["submitted_by_name"] = f"{submitter.first_name} {submitter.last_name}" if submitter else None
    else:
        d["submitted_by_name"] = None
    # Validated by name
    if activity.validated_by:
        validator = await db.get(User, activity.validated_by)
        d["validated_by_name"] = f"{validator.first_name} {validator.last_name}" if validator else None
    else:
        d["validated_by_name"] = None
    return d


async def _compute_daily_capacity(
    db: AsyncSession, asset: Installation, entity_id: UUID, target_date: date
) -> dict:
    """Compute capacity for a specific asset on a specific date."""
    total = asset.max_pax or 0
    perm_ops = asset.permanent_ops_quota or 0

    # Sum pax_quota from all validated/in_progress activities overlapping target_date
    result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(PlannerActivity.pax_quota), 0)).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id == asset.id,
            PlannerActivity.active == True,
            PlannerActivity.status.in_(["validated", "in_progress"]),
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(target_date, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(target_date, datetime.min.time()),
        )
    )
    used_by_activities = result.scalar() or 0
    used = perm_ops + used_by_activities
    residual = total - used
    saturation = (used / total * 100) if total > 0 else 0.0

    return {
        "total": total,
        "perm_ops": perm_ops,
        "used_by_activities": used_by_activities,
        "used": used,
        "residual": residual,
        "saturation": round(saturation, 2),
    }


async def _detect_and_create_conflicts(
    db: AsyncSession,
    activity: PlannerActivity,
    entity_id: UUID,
) -> list[PlannerConflict]:
    """Check if validating this activity would cause capacity conflicts.

    Called after submit or validate. Creates PlannerConflict records for
    each day where capacity is exceeded.
    """
    asset = await db.get(Installation, activity.asset_id)
    if not asset or not asset.max_pax:
        return []

    if not activity.start_date or not activity.end_date:
        return []

    start = activity.start_date.date() if hasattr(activity.start_date, 'date') else activity.start_date
    end = activity.end_date.date() if hasattr(activity.end_date, 'date') else activity.end_date

    conflicts_created = []
    current = start
    while current <= end:
        cap = await _compute_daily_capacity(db, asset, entity_id, current)

        # Include this activity's pax_quota in the check (if not yet validated)
        total_with_this = cap["used"]
        if activity.status not in ("validated", "in_progress"):
            total_with_this += activity.pax_quota

        if total_with_this > cap["total"] and cap["total"] > 0:
            overflow = total_with_this - cap["total"]
            # Check if conflict already exists for this date/asset
            existing = await db.execute(
                select(PlannerConflict).where(
                    PlannerConflict.entity_id == entity_id,
                    PlannerConflict.asset_id == activity.asset_id,
                    PlannerConflict.conflict_date == current,
                    PlannerConflict.status == "open",
                    PlannerConflict.active == True,
                )
            )
            if not existing.scalars().first():
                conflict = PlannerConflict(
                    entity_id=entity_id,
                    asset_id=activity.asset_id,
                    conflict_date=current,
                    conflict_type="pax_overflow",
                    overflow_amount=overflow,
                    status="open",
                )
                db.add(conflict)
                await db.flush()

                # Link the submitted activity to the conflict
                link = PlannerConflictActivity(
                    conflict_id=conflict.id,
                    activity_id=activity.id,
                )
                db.add(link)

                # Also link all other overlapping validated activities
                overlap_result = await db.execute(
                    select(PlannerActivity.id).where(
                        PlannerActivity.entity_id == entity_id,
                        PlannerActivity.asset_id == activity.asset_id,
                        PlannerActivity.active == True,
                        PlannerActivity.id != activity.id,
                        PlannerActivity.status.in_(["validated", "in_progress", "submitted"]),
                        PlannerActivity.start_date <= datetime.combine(current, datetime.max.time()),
                        PlannerActivity.end_date >= datetime.combine(current, datetime.min.time()),
                    )
                )
                for row in overlap_result.all():
                    db.add(PlannerConflictActivity(
                        conflict_id=conflict.id,
                        activity_id=row[0],
                    ))

                conflicts_created.append(conflict)

        # ── priority_clash detection ──────────────────────────────────
        # If the submitted activity is critical, check for other critical
        # activities on the same asset overlapping the same day.
        if activity.priority == "critical":
            critical_overlap_result = await db.execute(
                select(PlannerActivity).where(
                    PlannerActivity.entity_id == entity_id,
                    PlannerActivity.asset_id == activity.asset_id,
                    PlannerActivity.active == True,
                    PlannerActivity.id != activity.id,
                    PlannerActivity.priority == "critical",
                    PlannerActivity.status.in_(["submitted", "validated", "in_progress"]),
                    PlannerActivity.start_date <= datetime.combine(current, datetime.max.time()),
                    PlannerActivity.end_date >= datetime.combine(current, datetime.min.time()),
                )
            )
            critical_overlaps = critical_overlap_result.scalars().all()
            for other_act in critical_overlaps:
                # Check no existing priority_clash conflict for this pair on this date
                existing_clash = await db.execute(
                    select(PlannerConflict).where(
                        PlannerConflict.entity_id == entity_id,
                        PlannerConflict.asset_id == activity.asset_id,
                        PlannerConflict.conflict_date == current,
                        PlannerConflict.conflict_type == "priority_clash",
                        PlannerConflict.status == "open",
                        PlannerConflict.active == True,
                    )
                )
                if not existing_clash.scalars().first():
                    clash_conflict = PlannerConflict(
                        entity_id=entity_id,
                        asset_id=activity.asset_id,
                        conflict_date=current,
                        conflict_type="priority_clash",
                        status="open",
                    )
                    db.add(clash_conflict)
                    await db.flush()

                    db.add(PlannerConflictActivity(
                        conflict_id=clash_conflict.id,
                        activity_id=activity.id,
                    ))
                    db.add(PlannerConflictActivity(
                        conflict_id=clash_conflict.id,
                        activity_id=other_act.id,
                    ))
                    conflicts_created.append(clash_conflict)
                    break  # One priority_clash conflict per date is enough

        current += timedelta(days=1)

    return conflicts_created


# ── Activities CRUD ──────────────────────────────────────────────────────


@router.get("/activities", response_model=PaginatedResponse[ActivityRead])
async def list_activities(
    asset_id: UUID | None = None,
    type: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    project_id: UUID | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            PlannerActivity,
            Installation.name.label("asset_name"),
            Project.name.label("project_name"),
        )
        .outerjoin(Installation, PlannerActivity.asset_id == Installation.id)
        .outerjoin(Project, PlannerActivity.project_id == Project.id)
        .where(PlannerActivity.entity_id == entity_id, PlannerActivity.active == True)
    )

    # ── User-scoped data visibility ──
    if scope == "my":
        query = query.where(PlannerActivity.created_by == current_user.id)
    elif scope != "all":
        can_read_all = await has_user_permission(
            current_user, entity_id, "planner.activity.read_all", db
        )
        if not can_read_all:
            query = query.where(PlannerActivity.created_by == current_user.id)

    if asset_id:
        query = query.where(PlannerActivity.asset_id == asset_id)
    if type:
        query = query.where(PlannerActivity.type == type)
    if status:
        query = query.where(PlannerActivity.status == status)
    if priority:
        query = query.where(PlannerActivity.priority == priority)
    if project_id:
        query = query.where(PlannerActivity.project_id == project_id)
    if start_date:
        query = query.where(PlannerActivity.start_date >= start_date)
    if end_date:
        query = query.where(PlannerActivity.end_date <= end_date)
    if search:
        like = f"%{search}%"
        query = query.where(PlannerActivity.title.ilike(like))

    query = query.order_by(PlannerActivity.start_date.asc().nullslast(), PlannerActivity.created_at.desc())

    def _transform(row):
        activity = row[0]
        d = {c.key: getattr(activity, c.key) for c in activity.__table__.columns}
        d["asset_name"] = row[1]
        d["project_name"] = row[2]
        d["created_by_name"] = None
        d["submitted_by_name"] = None
        d["validated_by_name"] = None
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/activities", response_model=ActivityRead, status_code=201)
async def create_activity(
    body: ActivityCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    activity = PlannerActivity(
        entity_id=entity_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return await _enrich_activity(db, activity)


@router.get("/activities/{activity_id}", response_model=ActivityRead)
async def get_activity(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    activity = await _get_activity_or_404(db, activity_id, entity_id)
    return await _enrich_activity(db, activity)


@router.patch("/activities/{activity_id}", response_model=ActivityRead)
async def update_activity(
    activity_id: UUID,
    body: ActivityUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.update"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text as sa_text

    activity = await _get_activity_or_404(db, activity_id, entity_id)

    # Track whether this is an approved activity being modified
    was_approved = activity.status in ("validated", "in_progress")
    changes = body.model_dump(exclude_unset=True)
    old_values = {}
    if was_approved:
        for field in changes:
            old_values[field] = getattr(activity, field)

    for field, value in changes.items():
        setattr(activity, field, value)

    # ── Planner → PaxLog cascade: count linked AdS for handler-driven review ──
    ads_updated_count = 0
    if was_approved and changes:
        date_or_quota_changed = any(
            k in changes for k in ("start_date", "end_date", "pax_quota")
        )
        if date_or_quota_changed:
            result = await db.execute(
                sa_text(
                    "SELECT COUNT(*) "
                    "FROM ads "
                    "WHERE planner_activity_id = :aid "
                    "AND entity_id = :eid "
                    "AND status IN ('approved', 'in_progress') "
                ),
                {"aid": str(activity_id), "eid": str(entity_id)},
            )
            ads_updated_count = int(result.scalar() or 0)

    await db.commit()
    await db.refresh(activity)

    # ── Emit activity.modified event for approved activities ──
    if was_approved and changes:
        await event_bus.publish(OpsFluxEvent(
            event_type="planner.activity.modified",
            payload={
                "activity_id": str(activity.id),
                "entity_id": str(entity_id),
                "asset_id": str(activity.asset_id),
                "title": activity.title,
                "type": activity.type,
                "modified_by": str(current_user.id),
                "changes": {k: {"old": str(old_values.get(k)), "new": str(v)} for k, v in changes.items()},
                "ads_flagged_for_review": ads_updated_count,
            },
        ))

    return await _enrich_activity(db, activity)


@router.delete("/activities/{activity_id}")
async def delete_activity(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.delete"),
    db: AsyncSession = Depends(get_db),
):
    activity = await _get_activity_or_404(db, activity_id, entity_id)
    await delete_entity(activity, db, "planner_activity", entity_id=activity.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Activity deleted"}


# ── Activity Workflow (submit / validate / reject / cancel) ──────────────


@router.post("/activities/{activity_id}/submit", response_model=ActivityRead)
async def submit_activity(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.submit"),
    db: AsyncSession = Depends(get_db),
):
    activity = await _get_activity_or_404(db, activity_id, entity_id)
    if activity.status != "draft":
        raise HTTPException(400, f"Cannot submit activity in status '{activity.status}'")

    # Validate required fields
    if not activity.start_date or not activity.end_date:
        raise HTTPException(400, "Start date and end date are required to submit")
    if activity.pax_quota <= 0:
        raise HTTPException(400, "PAX quota must be greater than 0")

    # ── Dependency-chain validation ────────────────────────────────────
    # Enforce FS / SS / FF predecessors with their lag_days:
    #   FS (Finish-to-Start)   predecessor.end_date + lag  <= activity.start_date
    #   SS (Start-to-Start)    predecessor.start_date + lag <= activity.start_date
    #   FF (Finish-to-Finish)  predecessor.end_date + lag  <= activity.end_date
    # A predecessor must also not be in a terminal rejected/cancelled state.
    from datetime import timedelta
    deps_rows = await db.execute(
        select(PlannerActivityDependency, PlannerActivity).join(
            PlannerActivity,
            PlannerActivity.id == PlannerActivityDependency.predecessor_id,
        ).where(PlannerActivityDependency.successor_id == activity.id)
    )
    violations: list[str] = []
    for dep, predecessor in deps_rows.all():
        if predecessor is None:
            continue
        if predecessor.status in ("rejected", "cancelled"):
            violations.append(
                f"Prédécesseur « {predecessor.title} » est en statut "
                f"'{predecessor.status}' — dépendance {dep.dependency_type} invalide."
            )
            continue
        lag = timedelta(days=dep.lag_days or 0)
        dtype = (dep.dependency_type or "FS").upper()
        if dtype == "FS":
            if not predecessor.end_date:
                violations.append(
                    f"Prédécesseur « {predecessor.title} » n'a pas de date de fin — "
                    f"dépendance FS impossible à valider."
                )
            elif predecessor.end_date + lag > activity.start_date:
                violations.append(
                    f"FS: doit démarrer après {(predecessor.end_date + lag).date()} "
                    f"(fin de « {predecessor.title} »"
                    + (f" + {dep.lag_days}j" if dep.lag_days else "")
                    + ")."
                )
        elif dtype == "SS":
            if not predecessor.start_date:
                violations.append(
                    f"Prédécesseur « {predecessor.title} » n'a pas de date de début."
                )
            elif predecessor.start_date + lag > activity.start_date:
                violations.append(
                    f"SS: doit démarrer après {(predecessor.start_date + lag).date()} "
                    f"(début de « {predecessor.title} »)."
                )
        elif dtype == "FF":
            if not predecessor.end_date:
                violations.append(
                    f"Prédécesseur « {predecessor.title} » n'a pas de date de fin."
                )
            elif predecessor.end_date + lag > activity.end_date:
                violations.append(
                    f"FF: doit se terminer après {(predecessor.end_date + lag).date()} "
                    f"(fin de « {predecessor.title} »)."
                )
    if violations:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "dependency_violation",
                "message": "Contraintes de dépendance non respectées.",
                "violations": violations,
            },
        )

    # FSM transition: draft → submitted (validates, locks, records history)
    from_state = activity.status
    await _try_workflow_transition(
        db,
        entity_id_str=str(activity.id),
        to_state="submitted",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    activity.status = "submitted"
    activity.submitted_by = current_user.id
    activity.submitted_at = datetime.now(timezone.utc)

    # Detect capacity conflicts
    conflicts = await _detect_and_create_conflicts(db, activity, entity_id)

    await db.commit()
    await db.refresh(activity)

    # Emit events AFTER commit (FSM + module-level)
    await fsm_service.emit_transition_event(
        entity_type=PLANNER_ENTITY_TYPE,
        entity_id=str(activity.id),
        from_state=from_state,
        to_state="submitted",
        actor_id=current_user.id,
        workflow_slug=PLANNER_WORKFLOW_SLUG,
        extra_payload={
            "asset_id": str(activity.asset_id),
            "title": activity.title,
            "type": activity.type,
            "pax_quota": activity.pax_quota,
        },
    )
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.activity.submitted",
        payload={
            "activity_id": str(activity.id),
            "entity_id": str(entity_id),
            "asset_id": str(activity.asset_id),
            "title": activity.title,
            "type": activity.type,
            "pax_quota": activity.pax_quota,
            "submitted_by": str(current_user.id),
            "created_by": str(activity.created_by),
        },
    ))

    # Emit conflict events (conflict.created for each new conflict)
    for conflict in conflicts:
        asset = await db.get(Installation, activity.asset_id)
        await event_bus.publish(OpsFluxEvent(
            event_type="planner.conflict.created",
            payload={
                "conflict_id": str(conflict.id),
                "entity_id": str(entity_id),
                "asset_id": str(activity.asset_id),
                "asset_name": asset.name if asset else "",
                "conflict_date": str(conflict.conflict_date),
                "conflict_type": conflict.conflict_type,
                "overflow_amount": conflict.overflow_amount,
                "total_pax_requested": activity.pax_quota,
                "max_capacity": asset.max_pax if asset else 0,
            },
        ))

    return await _enrich_activity(db, activity)


@router.post("/activities/{activity_id}/validate", response_model=ActivityRead)
async def validate_activity(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    activity = await _get_activity_or_404(db, activity_id, entity_id)
    if activity.status != "submitted":
        raise HTTPException(400, f"Cannot validate activity in status '{activity.status}'")

    from_state = activity.status
    await _try_workflow_transition(
        db,
        entity_id_str=str(activity.id),
        to_state="validated",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    activity.status = "validated"
    activity.validated_by = current_user.id
    activity.validated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(activity)

    # Emit events AFTER commit (FSM + module-level)
    await fsm_service.emit_transition_event(
        entity_type=PLANNER_ENTITY_TYPE,
        entity_id=str(activity.id),
        from_state=from_state,
        to_state="validated",
        actor_id=current_user.id,
        workflow_slug=PLANNER_WORKFLOW_SLUG,
        extra_payload={
            "asset_id": str(activity.asset_id),
            "title": activity.title,
        },
    )
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.activity.validated",
        payload={
            "activity_id": str(activity.id),
            "entity_id": str(entity_id),
            "asset_id": str(activity.asset_id),
            "project_id": str(activity.project_id) if activity.project_id else None,
            "title": activity.title,
            "type": activity.type,
            "pax_quota": activity.pax_quota,
            "start_date": str(activity.start_date),
            "end_date": str(activity.end_date),
            "validated_by": str(current_user.id),
            "created_by": str(activity.created_by),
        },
    ))

    return await _enrich_activity(db, activity)


@router.post("/activities/{activity_id}/reject", response_model=ActivityRead)
async def reject_activity(
    activity_id: UUID,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    activity = await _get_activity_or_404(db, activity_id, entity_id)
    if activity.status != "submitted":
        raise HTTPException(400, f"Cannot reject activity in status '{activity.status}'")

    from_state = activity.status
    await _try_workflow_transition(
        db,
        entity_id_str=str(activity.id),
        to_state="rejected",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        comment=reason,
    )

    activity.status = "rejected"
    activity.rejected_by = current_user.id
    activity.rejected_at = datetime.now(timezone.utc)
    activity.rejection_reason = reason
    await db.commit()
    await db.refresh(activity)

    # Emit events AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=PLANNER_ENTITY_TYPE,
        entity_id=str(activity.id),
        from_state=from_state,
        to_state="rejected",
        actor_id=current_user.id,
        workflow_slug=PLANNER_WORKFLOW_SLUG,
        extra_payload={"rejection_reason": reason},
    )
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.activity.rejected",
        payload={
            "activity_id": str(activity.id),
            "entity_id": str(entity_id),
            "title": activity.title,
            "rejected_by": str(current_user.id),
            "rejection_reason": reason,
            "created_by": str(activity.created_by),
        },
    ))

    return await _enrich_activity(db, activity)


@router.post("/activities/{activity_id}/cancel", response_model=ActivityRead)
async def cancel_activity(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.cancel"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text as sa_text

    activity = await _get_activity_or_404(db, activity_id, entity_id)
    if activity.status in ("completed", "cancelled"):
        raise HTTPException(400, f"Cannot cancel activity in status '{activity.status}'")

    was_approved = activity.status in ("validated", "in_progress")
    from_state = activity.status
    await _try_workflow_transition(
        db,
        entity_id_str=str(activity.id),
        to_state="cancelled",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    activity.status = "cancelled"

    # ── Planner → PaxLog cascade: count linked AdS for handler-driven review ──
    ads_updated_count = 0
    if was_approved:
        result = await db.execute(
            sa_text(
                "SELECT COUNT(*) "
                "FROM ads "
                "WHERE planner_activity_id = :aid "
                "AND entity_id = :eid "
                "AND status IN ('approved', 'in_progress') "
            ),
            {"aid": str(activity_id), "eid": str(entity_id)},
        )
        ads_updated_count = int(result.scalar() or 0)

    await db.commit()
    await db.refresh(activity)

    # Emit events AFTER commit — triggers AdS requires_review
    await fsm_service.emit_transition_event(
        entity_type=PLANNER_ENTITY_TYPE,
        entity_id=str(activity.id),
        from_state=from_state,
        to_state="cancelled",
        actor_id=current_user.id,
        workflow_slug=PLANNER_WORKFLOW_SLUG,
        extra_payload={"asset_id": str(activity.asset_id)},
    )
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.activity.cancelled",
        payload={
            "activity_id": str(activity.id),
            "entity_id": str(entity_id),
            "asset_id": str(activity.asset_id),
            "title": activity.title,
            "cancelled_by": str(current_user.id),
            "ads_flagged_for_review": ads_updated_count,
        },
    ))

    return await _enrich_activity(db, activity)


# ── Push from Projets (create activity from project task) ────────────────


@router.post("/activities/from-project-task", response_model=ActivityRead, status_code=201)
async def create_activity_from_project_task(
    project_id: UUID,
    task_id: UUID,
    pax_quota: int,
    priority: str = "medium",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a planner activity from a project task (Projets → Planner link)."""
    from app.models.common import ProjectTask

    # Load the project
    project = await db.get(Project, project_id)
    if not project or project.entity_id != entity_id:
        raise HTTPException(404, "Project not found")

    # Load the task
    task_result = await db.execute(
        select(ProjectTask).where(
            ProjectTask.id == task_id,
            ProjectTask.project_id == project_id,
            ProjectTask.active == True,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    # Determine asset from project
    if not project.asset_id:
        raise HTTPException(400, "Project must have an asset assigned to push to planner")

    activity = PlannerActivity(
        entity_id=entity_id,
        asset_id=project.asset_id,
        project_id=project_id,
        type="project",
        title=f"{project.code} — {task.title}",
        description=task.description,
        status="draft",
        priority=priority,
        pax_quota=pax_quota,
        start_date=task.start_date,
        end_date=task.due_date,
        created_by=current_user.id,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)

    return await _enrich_activity(db, activity)


# ── Conflicts ────────────────────────────────────────────────────────────


@router.get("/conflicts", response_model=PaginatedResponse[ConflictRead])
async def list_conflicts(
    asset_id: UUID | None = None,
    status: str | None = None,
    conflict_date_from: date | None = None,
    conflict_date_to: date | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.read"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(PlannerConflict, Installation.name.label("asset_name"))
        .outerjoin(Installation, PlannerConflict.asset_id == Installation.id)
        .where(PlannerConflict.entity_id == entity_id, PlannerConflict.active == True)
    )

    if asset_id:
        query = query.where(PlannerConflict.asset_id == asset_id)
    if status:
        query = query.where(PlannerConflict.status == status)
    if conflict_date_from:
        query = query.where(PlannerConflict.conflict_date >= conflict_date_from)
    if conflict_date_to:
        query = query.where(PlannerConflict.conflict_date <= conflict_date_to)

    query = query.order_by(PlannerConflict.conflict_date.desc(), PlannerConflict.created_at.desc())

    async def _build_conflict_dict(db: AsyncSession, conflict: PlannerConflict, asset_name: str | None) -> dict:
        d = {c.key: getattr(conflict, c.key) for c in conflict.__table__.columns}
        d["asset_name"] = asset_name
        if conflict.resolved_by:
            resolver = await db.get(User, conflict.resolved_by)
            d["resolved_by_name"] = f"{resolver.first_name} {resolver.last_name}" if resolver else None
        else:
            d["resolved_by_name"] = None
        junction_result = await db.execute(
            select(PlannerConflictActivity.activity_id)
            .where(PlannerConflictActivity.conflict_id == conflict.id)
        )
        activity_ids = [row[0] for row in junction_result.all()]
        d["activity_ids"] = activity_ids
        activity_titles = []
        for aid in activity_ids:
            act = await db.get(PlannerActivity, aid)
            if act:
                activity_titles.append(act.title)
        d["activity_titles"] = activity_titles
        return d

    from sqlalchemy import func as sql_func
    count_query = select(sql_func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    paginated_query = query.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(paginated_query)
    rows = result.all()

    items = []
    for row in rows:
        conflict = row[0]
        asset_name = row[1]
        items.append(await _build_conflict_dict(db, conflict, asset_name))

    pages = (total + pagination.page_size - 1) // pagination.page_size if total > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictRead)
async def resolve_conflict(
    conflict_id: UUID,
    body: ConflictResolve,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.resolve"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlannerConflict).where(
            PlannerConflict.id == conflict_id,
            PlannerConflict.entity_id == entity_id,
            PlannerConflict.active == True,
        )
    )
    conflict = result.scalars().first()
    if not conflict:
        raise HTTPException(404, "Conflict not found")
    if conflict.status != "open":
        raise HTTPException(400, f"Conflict already in status '{conflict.status}'")

    old_status = conflict.status
    old_resolution = conflict.resolution
    conflict.status = "deferred" if body.resolution == "deferred" else "resolved"
    conflict.resolution = body.resolution
    conflict.resolution_note = body.resolution_note
    conflict.resolved_by = current_user.id
    conflict.resolved_at = datetime.now(timezone.utc)

    # Append an audit row (append-only history of who resolved what)
    db.add(PlannerConflictAudit(
        conflict_id=conflict.id,
        actor_id=current_user.id,
        action="resolve" if old_resolution is None else "re_resolve",
        old_status=old_status,
        new_status=conflict.status,
        old_resolution=old_resolution,
        new_resolution=body.resolution,
        resolution_note=body.resolution_note,
        context="single",
    ))

    await db.commit()
    await db.refresh(conflict)

    d = {c.key: getattr(conflict, c.key) for c in conflict.__table__.columns}
    asset = await db.get(Installation, conflict.asset_id)
    d["asset_name"] = asset.name if asset else None
    d["resolved_by_name"] = f"{current_user.first_name} {current_user.last_name}"
    junction_result = await db.execute(
        select(PlannerConflictActivity.activity_id)
        .where(PlannerConflictActivity.conflict_id == conflict.id)
    )
    activity_ids = [row[0] for row in junction_result.all()]
    d["activity_ids"] = activity_ids
    activity_titles = []
    for aid in activity_ids:
        act = await db.get(PlannerActivity, aid)
        if act:
            activity_titles.append(act.title)
    d["activity_titles"] = activity_titles

    # Emit conflict.resolved event AFTER commit
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.conflict.resolved",
        payload={
            "conflict_id": str(conflict.id),
            "entity_id": str(entity_id),
            "asset_id": str(conflict.asset_id),
            "asset_name": asset.name if asset else "",
            "conflict_date": str(conflict.conflict_date),
            "resolution": body.resolution,
            "resolution_note": body.resolution_note,
            "resolved_by": str(current_user.id),
            "activity_ids": [str(aid) for aid in activity_ids],
            "activity_titles": activity_titles,
        },
    ))

    return d


@router.post("/conflicts/bulk-resolve", response_model=BulkConflictResolveResult)
async def bulk_resolve_conflicts(
    body: BulkConflictResolveRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve many conflicts in one request.

    Iterates the items list and applies each resolution independently.
    Items pointing at unknown or already-resolved conflicts are skipped
    (not rejected), so a manager clearing a conflict dashboard doesn't
    lose progress on later items just because one was stale. Each
    resolution logs one row in planner_conflict_audit.
    """
    resolved = 0
    skipped = 0
    errors: list[str] = []
    resolved_ids: list[UUID] = []

    for item in body.items:
        result = await db.execute(
            select(PlannerConflict).where(
                PlannerConflict.id == item.conflict_id,
                PlannerConflict.entity_id == entity_id,
                PlannerConflict.active == True,  # noqa: E712
            )
        )
        conflict = result.scalars().first()
        if not conflict:
            skipped += 1
            errors.append(f"{item.conflict_id}: introuvable")
            continue
        if conflict.status != "open":
            skipped += 1
            errors.append(f"{item.conflict_id}: déjà '{conflict.status}'")
            continue

        old_status = conflict.status
        old_resolution = conflict.resolution
        conflict.status = "deferred" if item.resolution == "deferred" else "resolved"
        conflict.resolution = item.resolution
        conflict.resolution_note = item.resolution_note
        conflict.resolved_by = current_user.id
        conflict.resolved_at = datetime.now(timezone.utc)

        db.add(PlannerConflictAudit(
            conflict_id=conflict.id,
            actor_id=current_user.id,
            action="resolve" if old_resolution is None else "re_resolve",
            old_status=old_status,
            new_status=conflict.status,
            old_resolution=old_resolution,
            new_resolution=item.resolution,
            resolution_note=item.resolution_note,
            context="bulk",
        ))
        resolved += 1
        resolved_ids.append(conflict.id)

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(500, f"Erreur sauvegarde bulk resolve: {str(exc)[:300]}")

    # Emit one resolved event per successfully resolved conflict
    for cid in resolved_ids:
        conflict = await db.get(PlannerConflict, cid)
        if conflict is None:
            continue
        asset = await db.get(Installation, conflict.asset_id)
        await event_bus.publish(OpsFluxEvent(
            event_type="planner.conflict.resolved",
            payload={
                "conflict_id": str(conflict.id),
                "entity_id": str(entity_id),
                "asset_id": str(conflict.asset_id),
                "asset_name": asset.name if asset else "",
                "conflict_date": str(conflict.conflict_date),
                "resolution": conflict.resolution,
                "resolution_note": conflict.resolution_note,
                "resolved_by": str(current_user.id),
                "context": "bulk",
            },
        ))

    return BulkConflictResolveResult(
        resolved=resolved,
        skipped=skipped,
        errors=errors,
        conflict_ids=resolved_ids,
    )


@router.get("/conflicts/{conflict_id}/audit", response_model=list[ConflictAuditRead])
async def list_conflict_audit(
    conflict_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return the append-only audit history of a conflict."""
    conflict = await db.get(PlannerConflict, conflict_id)
    if not conflict or conflict.entity_id != entity_id:
        raise HTTPException(404, "Conflict not found")

    rows = (await db.execute(
        select(PlannerConflictAudit)
        .where(PlannerConflictAudit.conflict_id == conflict_id)
        .order_by(PlannerConflictAudit.created_at.desc())
    )).scalars().all()

    # Resolve actor display name once
    actor_names: dict[UUID, str] = {}
    for row in rows:
        if row.actor_id and row.actor_id not in actor_names:
            u = await db.get(User, row.actor_id)
            if u:
                actor_names[row.actor_id] = f"{u.first_name} {u.last_name}".strip() or u.email

    def _to_dict(row):
        return {
            "id": row.id,
            "conflict_id": row.conflict_id,
            "actor_id": row.actor_id,
            "actor_name": actor_names.get(row.actor_id) if row.actor_id else None,
            "action": row.action,
            "old_status": row.old_status,
            "new_status": row.new_status,
            "old_resolution": row.old_resolution,
            "new_resolution": row.new_resolution,
            "resolution_note": row.resolution_note,
            "context": row.context,
            "created_at": row.created_at,
        }
    return [_to_dict(r) for r in rows]


# ── Capacity ─────────────────────────────────────────────────────────────


@router.get("/capacity", response_model=list[CapacityRead])
async def get_capacity(
    asset_id: UUID = Query(..., description="Site asset ID"),
    date_from: date = Query(..., description="Start date (inclusive)"),
    date_to: date = Query(..., description="End date (inclusive)"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Compute daily capacity usage for an asset over a date range.

    Formula: residual = max_pax - permanent_ops_quota - sum(validated activities pax_quota)
    """
    asset = await db.get(Installation, asset_id)
    if not asset:
        raise HTTPException(404, "Installation not found")

    total = asset.max_pax or 0
    perm_ops = asset.permanent_ops_quota or 0

    # Query all validated/in_progress activities for this asset in the date range
    activities_result = await db.execute(
        select(PlannerActivity).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id == asset_id,
            PlannerActivity.active == True,
            PlannerActivity.status.in_(["validated", "in_progress"]),
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(date_to, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(date_from, datetime.min.time()),
        )
    )
    activities = activities_result.scalars().all()

    results = []
    current_date = date_from
    while current_date <= date_to:
        used_by_activities = 0
        for act in activities:
            act_start = act.start_date.date() if hasattr(act.start_date, 'date') else act.start_date
            act_end = act.end_date.date() if hasattr(act.end_date, 'date') else act.end_date
            if act_start <= current_date <= act_end:
                used_by_activities += act.pax_quota

        used = perm_ops + used_by_activities
        residual = total - used
        saturation = (used / total * 100) if total > 0 else 0.0

        results.append({
            "asset_id": asset_id,
            "asset_name": asset.name,
            "date": current_date,
            "total_capacity": total,
            "used_capacity": used,
            "residual_capacity": residual,
            "saturation_pct": round(saturation, 2),
        })
        current_date += timedelta(days=1)

    return results


# ── Activity Dependencies ────────────────────────────────────────────────


@router.get("/activities/{activity_id}/dependencies", response_model=list[DependencyRead])
async def list_dependencies(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_activity_or_404(db, activity_id, entity_id)
    result = await db.execute(
        select(PlannerActivityDependency).where(
            (PlannerActivityDependency.predecessor_id == activity_id)
            | (PlannerActivityDependency.successor_id == activity_id)
        )
    )
    return result.scalars().all()


@router.post("/activities/{activity_id}/dependencies", response_model=DependencyRead, status_code=201)
async def create_dependency(
    activity_id: UUID,
    body: DependencyCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("planner.activity.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_activity_or_404(db, activity_id, entity_id)
    if body.predecessor_id != activity_id and body.successor_id != activity_id:
        raise HTTPException(400, "Activity must be either predecessor or successor")
    # Prevent self-dependency
    if body.predecessor_id == body.successor_id:
        raise HTTPException(400, "Activity cannot depend on itself")
    dep = PlannerActivityDependency(**body.model_dump())
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return dep


@router.delete("/activities/{activity_id}/dependencies/{dependency_id}")
async def delete_dependency(
    activity_id: UUID,
    dependency_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_activity_or_404(db, activity_id, entity_id)
    result = await db.execute(
        select(PlannerActivityDependency).where(
            PlannerActivityDependency.id == dependency_id,
            (PlannerActivityDependency.predecessor_id == activity_id)
            | (PlannerActivityDependency.successor_id == activity_id),
        )
    )
    dep = result.scalars().first()
    if not dep:
        raise HTTPException(404, "Dependency not found")
    await delete_entity(dep, db, "planner_dependency", entity_id=dependency_id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Dependency deleted"}


# ── Availability (used by PaxLog when creating AdS) ───────────────────────


@router.get("/availability/{asset_id}")
async def get_availability(
    asset_id: UUID,
    start: date = Query(...),
    end: date = Query(...),
    exclude_activity_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Check PAX capacity availability for an asset over a date range.

    Used by PaxLog to display capacity info in AdS creation form.
    Returns daily breakdown + worst-case residual.
    """
    from app.services.modules.planner_service import check_availability

    asset = await db.get(Installation, asset_id)
    if not asset:
        raise HTTPException(404, "Installation not found")

    result = await check_availability(
        db, entity_id, asset_id, start, end, exclude_activity_id
    )
    result["asset_name"] = asset.name
    return result


# ── Impact Preview (before modifying approved activity) ───────────────────


@router.post("/activities/{activity_id}/impact-preview")
async def impact_preview(
    activity_id: UUID,
    new_start: date | None = None,
    new_end: date | None = None,
    new_pax_quota: int | None = None,
    new_status: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview impact of modifying an approved activity.

    Shows number of affected AdS, manifests, and potential new conflicts.
    The frontend displays this in a confirmation modal.
    """
    from app.services.modules.planner_service import get_impact_preview

    activity = await _get_activity_or_404(db, activity_id, entity_id)
    return await get_impact_preview(
        db, activity_id, entity_id,
        new_start=new_start,
        new_end=new_end,
        new_pax_quota=new_pax_quota,
        new_status=new_status,
    )


# ── Installation Capacities (historized — never UPDATE, always INSERT) ───────────


@router.get("/asset-capacities/{asset_id}")
async def list_asset_capacities(
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get the full capacity history for an asset (most recent first)."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "SELECT id, max_pax_total, permanent_ops_quota, max_pax_per_company, "
            "effective_date, reason, changed_by, created_at "
            "FROM asset_capacities "
            "WHERE asset_id = :aid AND entity_id = :eid "
            "ORDER BY effective_date DESC"
        ),
        {"aid": str(asset_id), "eid": str(entity_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "max_pax_total": r[1],
            "permanent_ops_quota": r[2],
            "max_pax_per_company": r[3] or {},
            "effective_date": str(r[4]),
            "reason": r[5],
            "changed_by": str(r[6]) if r[6] else None,
            "created_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


@router.post("/asset-capacities/{asset_id}", status_code=201)
async def create_asset_capacity(
    asset_id: UUID,
    max_pax_total: int = Query(..., ge=0),
    permanent_ops_quota: int = Query(0, ge=0),
    reason: str = Query(..., min_length=1),
    effective_date: date | None = None,
    max_pax_per_company: dict | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.update"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new capacity record (INSERT only — never UPDATE existing).

    If reducing capacity below current approved load, a conflict is created.
    """
    from sqlalchemy import text as sa_text
    import json

    asset = await db.get(Installation, asset_id)
    if not asset:
        raise HTTPException(404, "Installation not found")

    eff_date = effective_date or date.today()
    pax_company = json.dumps(max_pax_per_company or {})

    await db.execute(
        sa_text(
            "INSERT INTO asset_capacities "
            "(entity_id, asset_id, max_pax_total, permanent_ops_quota, "
            "max_pax_per_company, effective_date, reason, changed_by) "
            "VALUES (:eid, :aid, :mpt, :poq, :mpc::jsonb, :ed, :reason, :cb)"
        ),
        {
            "eid": str(entity_id),
            "aid": str(asset_id),
            "mpt": max_pax_total,
            "poq": permanent_ops_quota,
            "mpc": pax_company,
            "ed": eff_date,
            "reason": reason,
            "cb": str(current_user.id),
        },
    )

    # Also update the asset itself for backward compatibility
    asset.max_pax = max_pax_total
    asset.permanent_ops_quota = permanent_ops_quota
    await db.commit()

    # Emit capacity changed event
    await event_bus.publish(OpsFluxEvent(
        event_type="planner.capacity.changed",
        payload={
            "entity_id": str(entity_id),
            "asset_id": str(asset_id),
            "asset_name": asset.name,
            "max_pax_total": max_pax_total,
            "permanent_ops_quota": permanent_ops_quota,
            "effective_date": str(eff_date),
            "reason": reason,
            "changed_by": str(current_user.id),
        },
    ))

    return {
        "detail": "Capacity record created",
        "max_pax_total": max_pax_total,
        "permanent_ops_quota": permanent_ops_quota,
        "effective_date": str(eff_date),
    }


# ── Priority Override (DO only) ───────────────────────────────────────────


@router.post("/activities/{activity_id}/priority-override", response_model=ActivityRead)
async def override_priority(
    activity_id: UUID,
    priority: str = Query(..., pattern=r"^(low|medium|high|critical)$"),
    reason: str = Query(..., min_length=1),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.priority.override"),
    db: AsyncSession = Depends(get_db),
):
    """Override an activity's priority (DO privilege).

    Enforces priority floor per activity type.
    """
    from app.services.modules.planner_service import validate_priority_floor

    activity = await _get_activity_or_404(db, activity_id, entity_id)

    # Enforce priority floor
    corrected = validate_priority_floor(activity.type, activity.subtype, priority)
    if corrected != priority:
        raise HTTPException(
            400,
            f"La priorité minimale pour ce type d'activité est '{corrected}'. "
            f"Impossible de réduire en dessous.",
        )

    activity.priority = priority
    # Track override (columns added by migration 026)
    if hasattr(activity, "priority_override_by"):
        activity.priority_override_by = current_user.id
    if hasattr(activity, "priority_override_reason"):
        activity.priority_override_reason = reason
    await db.commit()
    await db.refresh(activity)
    return await _enrich_activity(db, activity)


# ── Gantt Data ────────────────────────────────────────────────────────────


@router.get("/gantt")
async def get_gantt(
    start_date: date = Query(...),
    end_date: date = Query(...),
    asset_id: UUID | None = None,
    types: str | None = Query(None, description="Comma-separated activity types"),
    statuses: str | None = Query(None, description="Comma-separated statuses"),
    show_permanent_ops: bool = True,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get Gantt chart data — activities grouped by asset with capacity info."""
    from app.services.modules.planner_service import get_gantt_data

    asset_ids = [asset_id] if asset_id else None
    type_list = types.split(",") if types else None
    status_list = statuses.split(",") if statuses else None

    return await get_gantt_data(
        db, entity_id, start_date, end_date,
        asset_ids=asset_ids,
        types=type_list,
        statuses=status_list,
        show_permanent_ops=show_permanent_ops,
    )


# ── Capacity Heatmap ─────────────────────────────────────────────────────


@router.get("/capacity-heatmap")
async def get_heatmap(
    start_date: date = Query(...),
    end_date: date = Query(...),
    asset_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get capacity heatmap data — daily saturation percentage per asset."""
    from app.services.modules.planner_service import get_capacity_heatmap

    asset_ids = [asset_id] if asset_id else None
    return await get_capacity_heatmap(db, entity_id, start_date, end_date, asset_ids=asset_ids)


# ── Calendar View ────────────────────────────────────────────────────────


@router.get("/calendar")
async def get_calendar(
    asset_id: UUID | None = None,
    start: date = Query(..., description="Start date (inclusive)"),
    end: date = Query(..., description="End date (inclusive)"),
    view: str = Query("month", pattern=r"^(month|week)$", description="Calendar view mode"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return activities grouped by day for a calendar UI.

    Response format:
    {
        "days": [
            {"date": "2026-03-19", "activities": [...], "pax_total": 45, "capacity": 80}
        ]
    }
    """
    # Build activity query for the date range
    query = (
        select(PlannerActivity)
        .where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(end, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(start, datetime.min.time()),
            PlannerActivity.status.in_(["draft", "submitted", "validated", "in_progress"]),
        )
    )
    if asset_id:
        query = query.where(PlannerActivity.asset_id == asset_id)

    result = await db.execute(query.order_by(PlannerActivity.start_date))
    activities = result.scalars().all()

    # Fetch asset info for capacity (if asset_id specified)
    asset = None
    if asset_id:
        asset = await db.get(Installation, asset_id)

    # Group activities by day
    days_map: dict[date, dict] = {}
    current_day = start
    while current_day <= end:
        days_map[current_day] = {
            "date": current_day.isoformat(),
            "activities": [],
            "pax_total": 0,
            "capacity": 0,
        }
        current_day += timedelta(days=1)

    for act in activities:
        act_start = act.start_date.date() if hasattr(act.start_date, "date") else act.start_date
        act_end = act.end_date.date() if hasattr(act.end_date, "date") else act.end_date

        act_dict = {
            "id": str(act.id),
            "title": act.title,
            "type": act.type,
            "subtype": act.subtype,
            "status": act.status,
            "priority": act.priority,
            "pax_quota": act.pax_quota,
            "start_date": act.start_date.isoformat() if act.start_date else None,
            "end_date": act.end_date.isoformat() if act.end_date else None,
            "asset_id": str(act.asset_id),
            "project_id": str(act.project_id) if act.project_id else None,
        }

        # Add activity to each day it spans
        span_day = max(act_start, start)
        span_end = min(act_end, end)
        while span_day <= span_end:
            if span_day in days_map:
                days_map[span_day]["activities"].append(act_dict)
                if act.status in ("validated", "in_progress"):
                    days_map[span_day]["pax_total"] += act.pax_quota
            span_day += timedelta(days=1)

    # Fill in capacity for each day
    if asset_id and asset:
        for day_date, day_data in days_map.items():
            cap = await _compute_daily_capacity(db, asset, entity_id, day_date)
            day_data["capacity"] = cap["total"]
    elif not asset_id:
        # Without a specific asset, capacity is not meaningful — leave as 0
        pass

    return {"days": list(days_map.values())}


# ── Recurrence Rules ─────────────────────────────────────────────────────


@router.post("/activities/{activity_id}/recurrence", status_code=201)
async def set_recurrence(
    activity_id: UUID,
    frequency: str = Query(..., pattern=r"^(daily|weekly|monthly|quarterly|annually)$"),
    interval_value: int = Query(1, ge=1, le=365),
    day_of_week: int | None = Query(None, ge=0, le=6),
    day_of_month: int | None = Query(None, ge=1, le=28),
    end_date: date | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    """Set a recurrence rule on an activity (maintenance, inspection).

    The system generates future occurrences via a daily APScheduler job.
    """
    from sqlalchemy import text as sa_text

    activity = await _get_activity_or_404(db, activity_id, entity_id)

    # Only maintenance and inspection can recur
    if activity.type not in ("maintenance", "inspection", "integrity"):
        raise HTTPException(400, "Only maintenance/inspection/integrity activities can have recurrence")

    # Check if recurrence already exists
    existing = await db.execute(
        sa_text(
            "SELECT id FROM activity_recurrence_rules WHERE activity_id = :aid AND active = TRUE"
        ),
        {"aid": str(activity_id)},
    )
    if existing.first():
        # Deactivate existing
        await db.execute(
            sa_text(
                "UPDATE activity_recurrence_rules SET active = FALSE WHERE activity_id = :aid"
            ),
            {"aid": str(activity_id)},
        )

    await db.execute(
        sa_text(
            "INSERT INTO activity_recurrence_rules "
            "(activity_id, frequency, interval_value, day_of_week, day_of_month, end_date) "
            "VALUES (:aid, :freq, :iv, :dow, :dom, :ed)"
        ),
        {
            "aid": str(activity_id),
            "freq": frequency,
            "iv": interval_value,
            "dow": day_of_week,
            "dom": day_of_month,
            "ed": end_date,
        },
    )
    await db.commit()

    return {
        "detail": "Recurrence rule created",
        "activity_id": str(activity_id),
        "frequency": frequency,
        "interval_value": interval_value,
    }


@router.delete("/activities/{activity_id}/recurrence")
async def delete_recurrence(
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove recurrence rule from an activity."""
    from sqlalchemy import text as sa_text

    await _get_activity_or_404(db, activity_id, entity_id)
    await db.execute(
        sa_text(
            "UPDATE activity_recurrence_rules SET active = FALSE WHERE activity_id = :aid"
        ),
        {"aid": str(activity_id)},
    )
    await db.commit()
    return {"detail": "Recurrence rule removed"}
