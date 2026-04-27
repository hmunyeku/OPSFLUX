"""Planner module routes — activities, conflicts, capacity scheduling.

Integrates with:
- Asset Registry: reads pob_capacity for capacity fallback
- Projets: accepts push-to-planner from project tasks
- PaxLog: emits events on activity validation/cancellation
- Workflow Engine: FSM service manages status transitions with row-level
  locking, role guards, and audit trail (D-014)
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sqla_func, and_, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.deps import get_current_entity, get_current_user, has_user_permission, require_module_enabled, require_permission
from app.core.audit import record_audit
from app.core.acting_context import get_effective_actor_user_id
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.events import OpsFluxEvent, event_bus
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import Installation
from app.models.common import AuditLog, Project, ProjectTask, Setting, User
from app.models.planner import (
    PlannerActivity,
    PlannerConflict,
    PlannerConflictActivity,
    PlannerConflictAudit,
    PlannerActivityDependency,
    PlannerScenario,
    PlannerScenarioActivity,
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
    CapacityHeatmapResponse,
    RevisionSignalRead,
    RevisionSignalAcknowledgeRead,
    RevisionSignalImpactRead,
    RevisionDecisionRequestCreate,
    RevisionDecisionRequestRead,
    RevisionDecisionRespond,
    RevisionDecisionForce,
    DependencyCreate,
    DependencyRead,
    ScenarioRequest,
    ForecastRequest,
    ForecastResponse,
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioRead,
    ScenarioDetailRead,
    ScenarioActivityCreate,
    ScenarioActivityUpdate,
    ScenarioActivityRead,
    ScenarioPromoteResult,
)
from app.schemas.common import PaginatedResponse
from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/planner", tags=["planner"], dependencies=[require_module_enabled("planner")])
logger = logging.getLogger(__name__)

PLANNER_WORKFLOW_SLUG = "planner-activity"
PLANNER_ENTITY_TYPE = "planner_activity"

_DEFAULT_HEATMAP_CONFIG = {
    "threshold_low": 40.0,
    "threshold_medium": 70.0,
    "threshold_high": 90.0,
    "threshold_critical": 100.0,
    "color_low": "#86efac",
    "color_medium": "#4ade80",
    "color_high": "#fbbf24",
    "color_critical": "#ef4444",
    "color_overflow": "#991b1b",
}


async def _get_capacity_heatmap_config(db: AsyncSession, entity_id: UUID) -> dict[str, float | str]:
    keys = tuple(f"planner.capacity_heatmap_{suffix}" for suffix in (
        "threshold_low",
        "threshold_medium",
        "threshold_high",
        "threshold_critical",
        "color_low",
        "color_medium",
        "color_high",
        "color_critical",
        "color_overflow",
    ))
    result = await db.execute(
        select(Setting).where(
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
            Setting.key.in_(keys),
        )
    )
    config = dict(_DEFAULT_HEATMAP_CONFIG)
    for setting in result.scalars().all():
        key = setting.key.removeprefix("planner.capacity_heatmap_")
        raw_value = setting.value.get("v") if isinstance(setting.value, dict) else setting.value
        if key.startswith("threshold_"):
            try:
                config[key] = float(raw_value)
            except (TypeError, ValueError):
                continue
        elif isinstance(raw_value, str) and raw_value.strip():
            config[key] = raw_value.strip()
    return config


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
        raise StructuredHTTPException(
            404,
            code="ACTIVITY_NOT_FOUND",
            message="Activity not found",
        )
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
    # §2.5 — Children POB summation: parent POB = sum of children POB
    d.update(await _compute_children_pob(db, activity.id, activity.entity_id))
    return d


async def _compute_children_pob(
    db: AsyncSession, activity_id, entity_id
) -> dict:
    """Compute children_pob_total, children_pob_daily, has_children for a
    parent activity.  Sums pax_quota (constant mode) and merges
    pax_quota_daily (variable mode) across all direct children."""
    children_result = await db.execute(
        select(
            PlannerActivity.pax_quota,
            PlannerActivity.pax_quota_mode,
            PlannerActivity.pax_quota_daily,
        ).where(
            PlannerActivity.parent_id == activity_id,
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.deleted_at.is_(None),
        )
    )
    children = children_result.all()
    if not children:
        return {"children_pob_total": None, "children_pob_daily": None, "has_children": False}

    total_constant = 0
    merged_daily: dict[str, int] = {}
    has_any_variable = False

    for child in children:
        c_mode = child.pax_quota_mode or "constant"
        c_quota = child.pax_quota or 0
        c_daily = child.pax_quota_daily

        if c_mode == "variable" and isinstance(c_daily, dict) and c_daily:
            has_any_variable = True
            for day_key, day_val in c_daily.items():
                merged_daily[day_key] = merged_daily.get(day_key, 0) + int(day_val or 0)
        else:
            total_constant += c_quota

    return {
        "children_pob_total": total_constant if not has_any_variable else sum(merged_daily.values()),
        "children_pob_daily": merged_daily if has_any_variable else None,
        "has_children": True,
    }


async def _compute_daily_capacity(
    db: AsyncSession, asset: Installation, entity_id: UUID, target_date: date
) -> dict:
    """Compute capacity for a specific asset on a specific date."""
    from app.services.modules.planner_service import get_current_capacity

    cap = await get_current_capacity(db, asset.id, target_date)
    total = int(cap["max_pax_total"]) if cap else 0
    perm_ops = int(cap["permanent_ops_quota"]) if cap else 0

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
    if not asset:
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


async def _auto_clear_stale_conflicts(
    db: AsyncSession,
    asset_id: UUID,
    entity_id: UUID,
    triggered_by_resolution: str,
    triggered_by_note: str | None,
    actor_id: UUID,
) -> int:
    """Mark stale open conflicts as resolved when capacity is no longer
    in overflow on their day.

    Called after the resolve endpoint applies a concrete action (shift,
    set_window, set_quota, cancel) on one of the involved activities.
    The action may move/shrink the activity out of the overlap, leaving
    the old-window conflicts as zombies — `_detect_and_create_conflicts`
    only ADDS conflicts, never CLOSES them. This helper performs the
    closing pass for the same asset, propagating the user's chosen
    resolution to every sibling that's no longer a real overflow.
    Returns the count of auto-resolved conflicts.
    """
    open_result = await db.execute(
        select(PlannerConflict).where(
            PlannerConflict.entity_id == entity_id,
            PlannerConflict.asset_id == asset_id,
            PlannerConflict.status == "open",
            PlannerConflict.active == True,  # noqa: E712
            PlannerConflict.conflict_type == "pax_overflow",
        )
    )
    open_conflicts = open_result.scalars().all()
    if not open_conflicts:
        return 0
    asset = await db.get(Installation, asset_id)
    if not asset:
        return 0
    cleared = 0
    for c in open_conflicts:
        # Only reconsider pax_overflow — priority_clash is a binary
        # property of the activities and is handled by re-detection
        # on the activity itself.
        cap = await _compute_daily_capacity(db, asset, entity_id, c.conflict_date)
        if cap["used"] <= cap["total"] or cap["total"] <= 0:
            c.status = "resolved"
            c.resolution = triggered_by_resolution
            c.resolution_note = (
                (triggered_by_note + " · " if triggered_by_note else "")
                + f"Auto-clearé suite à un arbitrage (re-détection sur {c.conflict_date.isoformat()})"
            )
            c.resolved_by = actor_id
            c.resolved_at = datetime.now(timezone.utc)
            db.add(PlannerConflictAudit(
                conflict_id=c.id,
                actor_id=actor_id,
                action="auto_resolve",
                old_status="open",
                new_status="resolved",
                old_resolution=None,
                new_resolution=triggered_by_resolution,
                resolution_note=c.resolution_note,
                context="auto_cleared",
            ))
            cleared += 1
        else:
            # Conflict still in overflow → refresh its activity-set so
            # the UI no longer lists activities that have moved out of
            # the day. The historical junction was set at detection
            # time and would otherwise mislead the user (e.g. shows
            # POB#2 on 21 mai even after POB#2 was shifted to 26 mai).
            await _refresh_conflict_junction(db, c, entity_id)
            # Also refresh the overflow_amount so the cluster's
            # max_overflow / sum_overflow reflect the *current* peak.
            c.overflow_amount = max(0, cap["used"] - cap["total"])
    return cleared


async def _refresh_conflict_junction(
    db: AsyncSession,
    conflict: PlannerConflict,
    entity_id: UUID,
) -> None:
    """Sync the conflict↔activity junction with the activities that
    actually overlap the conflict_date right now. Called from the
    auto-clear sweep so a conflict that's still open after an
    arbitration only lists its current contributors.
    """
    day = conflict.conflict_date
    overlap_q = await db.execute(
        select(PlannerActivity.id).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id == conflict.asset_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.status.in_(["submitted", "validated", "in_progress"]),
            PlannerActivity.start_date <= datetime.combine(day, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(day, datetime.min.time()),
        )
    )
    actual_ids = {row[0] for row in overlap_q.all()}
    junction_q = await db.execute(
        select(PlannerConflictActivity).where(
            PlannerConflictActivity.conflict_id == conflict.id,
        )
    )
    existing = {row.activity_id: row for row in junction_q.scalars().all()}
    # Drop rows for activities that no longer overlap.
    for aid, row in existing.items():
        if aid not in actual_ids:
            await db.delete(row)
    # Add rows for activities that newly overlap (rare for an open
    # conflict but possible if a same-day patch added a new activity).
    for aid in actual_ids:
        if aid not in existing:
            db.add(PlannerConflictActivity(conflict_id=conflict.id, activity_id=aid))


# ── Activities CRUD ──────────────────────────────────────────────────────


@router.get("/activities", response_model=PaginatedResponse[ActivityRead])
async def list_activities(
    request: Request,
    asset_id: UUID | None = None,
    type: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    project_id: UUID | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = None,
    scope: str | None = None,
    scenario_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
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
    # Three explicit branches:
    #   scope == "my"    → always filter to acting user (forced personal view)
    #   scope == "all"   → no scope filter, but require `read_all` permission
    #                      otherwise we silently fall back to "my".
    #   scope is missing → default behaviour: "all" if user has read_all,
    #                      otherwise "my".
    can_read_all = await has_user_permission(
        current_user, entity_id, "planner.activity.read_all", db
    )
    if scope == "my":
        query = query.where(PlannerActivity.created_by == acting_user_id)
    elif scope == "all":
        if not can_read_all:
            # User explicitly asked "all" but lacks the permission —
            # downgrade silently to "my" rather than 403, so the table
            # keeps rendering with their own data.
            query = query.where(PlannerActivity.created_by == acting_user_id)
    else:
        # Default — implicit scope. Behaves like "all" for privileged
        # users, "my" for everyone else.
        if not can_read_all:
            query = query.where(PlannerActivity.created_by == acting_user_id)

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

    # ── Scenario overlay ────────────────────────────────────────────────────
    # When scenario_id is supplied, load the scenario's overlay and merge it
    # with the live activities:
    #   - Activities marked is_removed=True in the overlay are excluded
    #   - Activities with field overrides use the scenario's values
    #   - New activities (source_activity_id IS NULL) are appended
    scenario_overlay: dict[str, "PlannerScenarioActivity"] = {}
    scenario_new_acts: list["PlannerScenarioActivity"] = []
    if scenario_id:
        sc_check = await db.execute(
            select(PlannerScenario).where(
                PlannerScenario.id == scenario_id,
                PlannerScenario.entity_id == entity_id,
                PlannerScenario.active == True,  # noqa: E712
            )
        )
        if sc_check.scalar_one_or_none():
            ov_result = await db.execute(
                select(PlannerScenarioActivity).where(
                    PlannerScenarioActivity.scenario_id == scenario_id
                )
            )
            for ov in ov_result.scalars().all():
                if ov.source_activity_id:
                    scenario_overlay[str(ov.source_activity_id)] = ov
                else:
                    scenario_new_acts.append(ov)

    async def _transform(row):
        activity = row[0]
        d = {c.key: getattr(activity, c.key) for c in activity.__table__.columns}
        # Apply scenario overlay if applicable
        if scenario_id and str(activity.id) in scenario_overlay:
            ov = scenario_overlay[str(activity.id)]
            if ov.is_removed:
                return None  # Signal to exclude
            # Apply non-null override fields
            for f in ("title", "type", "priority", "pax_quota", "start_date", "end_date", "notes"):
                if getattr(ov, f) is not None:
                    d[f] = getattr(ov, f)
            d["_scenario_modified"] = True
        d["asset_name"] = row[1]
        d["project_name"] = row[2]
        d["created_by_name"] = None
        d["submitted_by_name"] = None
        d["validated_by_name"] = None
        # §2.5 — Children POB summation
        d.update(await _compute_children_pob(db, activity.id, activity.entity_id))
        return d

    async def _transform_filtered(row):
        result = await _transform(row)
        return result  # None rows are filtered by paginate or post-processed

    if not scenario_id:
        return await paginate(db, query, pagination, transform=_transform)

    # With scenario overlay: we need to filter removed activities and append new ones.
    # Fetch all (no pagination limit on raw query for now — apply manually).
    count_q = select(sqla_func.count()).select_from(query.subquery())
    count_result = await db.execute(count_q)
    total = count_result.scalar() or 0

    offset = (pagination.page - 1) * pagination.page_size if hasattr(pagination, 'page') else 0
    page_size = pagination.page_size if hasattr(pagination, 'page_size') else 50

    rows_result = await db.execute(query.offset(offset).limit(page_size + len(scenario_overlay) + 10))
    items = []
    for row in rows_result.all():
        d = await _transform(row)
        if d is not None:  # skip removed
            items.append(d)

    # Append new scenario activities (not based on live activities)
    for new_act in scenario_new_acts:
        d = {c.key: getattr(new_act, c.key) for c in new_act.__table__.columns if hasattr(PlannerActivity.__table__.c, c.key)}
        inst = await db.get(Installation, new_act.asset_id) if new_act.asset_id else None
        d["asset_name"] = inst.name if inst else None
        d["project_name"] = None
        d["created_by_name"] = None
        d["submitted_by_name"] = None
        d["validated_by_name"] = None
        d["_scenario_new"] = True
        d["entity_id"] = entity_id
        d.setdefault("status", "draft")
        d.setdefault("active", True)
        items.append(d)

    return {"items": items[:page_size], "total": total + len(scenario_new_acts), "page": getattr(pagination, 'page', 1), "page_size": page_size}


@router.post("/activities", response_model=ActivityRead, status_code=201)
async def create_activity(
    body: ActivityCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    staging_ref = payload.pop("staging_ref", None)
    # Strip pax_quota_daily entries outside the [start, end] window so
    # the JSONB blob never carries orphan keys from a draft state.
    daily = payload.get("pax_quota_daily")
    if daily and payload.get("start_date") and payload.get("end_date"):
        start_iso = payload["start_date"].date().isoformat() if hasattr(payload["start_date"], "date") else str(payload["start_date"])[:10]
        end_iso = payload["end_date"].date().isoformat() if hasattr(payload["end_date"], "date") else str(payload["end_date"])[:10]
        payload["pax_quota_daily"] = {k: v for k, v in daily.items() if start_iso <= k <= end_iso}
    activity = PlannerActivity(
        entity_id=entity_id,
        created_by=current_user.id,
        **payload,
    )
    db.add(activity)
    await db.flush()

    if staging_ref:
        from app.services.core.staging_service import commit_staging_children
        await commit_staging_children(
            db,
            staging_owner_type="planner_activity_staging",
            final_owner_type="planner_activity",
            staging_ref=staging_ref,
            final_owner_id=activity.id,
            uploader_id=current_user.id,
            entity_id=entity_id,
        )

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

    # ── Prune pax_quota_daily orphan keys ──
    # When start_date / end_date / pax_quota_daily change, drop any
    # entries whose ISO date key falls outside the new [start, end]
    # window. Without this, shrinking the activity leaves stale 0s
    # that pollute min/max/avg computations on the frontend.
    if any(k in changes for k in ("start_date", "end_date", "pax_quota_daily")):
        if activity.pax_quota_daily and activity.start_date and activity.end_date:
            start_iso = activity.start_date.date().isoformat()
            end_iso = activity.end_date.date().isoformat()
            cleaned = {
                k: v for k, v in activity.pax_quota_daily.items()
                if start_iso <= k <= end_iso
            }
            if len(cleaned) != len(activity.pax_quota_daily):
                # Reassign so SQLAlchemy detects the JSONB change.
                activity.pax_quota_daily = cleaned

    # ── Re-detect capacity conflicts when window/quota/asset changes ──
    # Without this, raising pax_quota or moving the activity onto a
    # smaller-capacity asset wouldn't surface the new pax_overflow until
    # the activity was re-submitted from scratch.
    capacity_relevant_changed = any(
        k in changes for k in ("start_date", "end_date", "pax_quota", "asset_id")
    )
    if capacity_relevant_changed and activity.status in ("submitted", "validated", "in_progress"):
        await _detect_and_create_conflicts(db, activity, entity_id)

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
        raise StructuredHTTPException(
            400,
            code="CANNOT_SUBMIT_ACTIVITY_STATUS",
            message="Cannot submit activity in status '{status}'",
            params={
                "status": activity.status,
            },
        )

    # Validate required fields
    if not activity.start_date or not activity.end_date:
        raise StructuredHTTPException(
            400,
            code="START_DATE_END_DATE_REQUIRED_SUBMIT",
            message="Start date and end date are required to submit",
        )
    # For parent activities (has_children), PAX is aggregated from children — skip quota check
    child_count_result = await db.execute(
        select(sqla_func.count()).where(
            PlannerActivity.parent_id == activity.id,
            PlannerActivity.entity_id == entity_id,
        )
    )
    is_parent = (child_count_result.scalar() or 0) > 0
    if not is_parent and (activity.pax_quota or 0) <= 0:
        raise StructuredHTTPException(
            400,
            code="PAX_QUOTA_MUST_GREATER_THAN_0",
            message="PAX quota must be greater than 0",
        )

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
                "max_capacity": asset.pob_capacity if asset and asset.pob_capacity is not None else 0,
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
        raise StructuredHTTPException(
            400,
            code="CANNOT_VALIDATE_ACTIVITY_STATUS",
            message="Cannot validate activity in status '{status}'",
            params={
                "status": activity.status,
            },
        )

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

    # Re-run capacity detection at validate time too. The submit-time
    # check can miss real conflicts when the asset's pob_capacity was
    # later raised/lowered, or when overlapping activities were
    # validated in different orders. Cheap to do — same helper that
    # submit already uses.
    await _detect_and_create_conflicts(db, activity, entity_id)

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
        raise StructuredHTTPException(
            400,
            code="CANNOT_REJECT_ACTIVITY_STATUS",
            message="Cannot reject activity in status '{status}'",
            params={
                "status": activity.status,
            },
        )

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


# ── Bulk activity transitions ──


class BulkActivityTransitionRequest(BaseModel):
    activity_ids: list[UUID] = Field(..., min_length=1, max_length=100)
    reason: str | None = None  # for reject


class BulkActivityTransitionResult(BaseModel):
    success: int
    skipped: int
    errors: list[str]


@router.post("/activities/bulk-validate", response_model=BulkActivityTransitionResult)
async def bulk_validate_activities(
    body: BulkActivityTransitionRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Validate multiple submitted activities at once."""
    success = 0
    skipped = 0
    errors: list[str] = []

    for aid in body.activity_ids:
        try:
            activity = await _get_activity_or_404(db, aid, entity_id)
            if activity.status != "submitted":
                skipped += 1
                continue
            activity.status = "validated"
            activity.validated_by = current_user.id
            activity.validated_at = datetime.now(timezone.utc)
            success += 1
        except HTTPException:
            errors.append(f"Activity {aid} not found")

    await db.commit()
    return BulkActivityTransitionResult(success=success, skipped=skipped, errors=errors)


@router.post("/activities/bulk-reject", response_model=BulkActivityTransitionResult)
async def bulk_reject_activities(
    body: BulkActivityTransitionRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Reject multiple submitted activities at once."""
    success = 0
    skipped = 0
    errors: list[str] = []

    for aid in body.activity_ids:
        try:
            activity = await _get_activity_or_404(db, aid, entity_id)
            if activity.status != "submitted":
                skipped += 1
                continue
            activity.status = "rejected"
            activity.rejected_by = current_user.id
            activity.rejected_at = datetime.now(timezone.utc)
            activity.rejection_reason = body.reason
            success += 1
        except HTTPException:
            errors.append(f"Activity {aid} not found")

    await db.commit()
    return BulkActivityTransitionResult(success=success, skipped=skipped, errors=errors)


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
        raise StructuredHTTPException(
            400,
            code="CANNOT_CANCEL_ACTIVITY_STATUS",
            message="Cannot cancel activity in status '{status}'",
            params={
                "status": activity.status,
            },
        )

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
        raise StructuredHTTPException(
            404,
            code="PROJECT_NOT_FOUND",
            message="Project not found",
        )

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
        raise StructuredHTTPException(
            404,
            code="TASK_NOT_FOUND",
            message="Task not found",
        )

    # Determine asset from project
    if not project.asset_id:
        raise StructuredHTTPException(
            400,
            code="PROJECT_MUST_HAVE_ASSET_ASSIGNED_PUSH",
            message="Project must have an asset assigned to push to planner",
        )

    activity = PlannerActivity(
        entity_id=entity_id,
        asset_id=project.asset_id,
        project_id=project_id,
        source_task_id=task.id,
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
    conflict_type: str | None = None,
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
    if conflict_type:
        query = query.where(PlannerConflict.conflict_type == conflict_type)

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

    count_query = select(sqla_func.count()).select_from(query.subquery())
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
        raise StructuredHTTPException(
            404,
            code="CONFLICT_NOT_FOUND",
            message="Conflict not found",
        )
    if conflict.status != "open":
        raise StructuredHTTPException(
            400,
            code="CONFLICT_ALREADY_STATUS",
            message="Conflict already in status '{status}'",
            params={
                "status": conflict.status,
            },
        )

    # ── Optional concrete action on the underlying activity ──
    # Apply BEFORE flipping the conflict status so re-detection on the
    # mutated activity has a chance to clear sibling conflicts in the
    # same cluster (and we still mark this one resolved at the end).
    applied_action_summary: dict | None = None
    if body.apply is not None:
        # Permission to mutate the activity itself. We're inside a route
        # that already enforces 'planner.conflict.resolve' but the apply
        # action edits an activity record so it needs the activity
        # permission as well — defence-in-depth, no privilege escalation.
        from app.core.rbac import get_user_permissions
        user_perms = await get_user_permissions(current_user.id, entity_id, db)
        if "planner.activity.update" not in user_perms and "*" not in user_perms:
            raise StructuredHTTPException(
                403,
                code="PERMISSION_DENIED_ACTIVITY_UPDATE",
                message="Permission 'planner.activity.update' is required to apply an action while resolving a conflict.",
            )
        target = await db.get(PlannerActivity, body.apply.activity_id)
        if not target or target.entity_id != entity_id or not target.active:
            raise StructuredHTTPException(
                404,
                code="ACTIVITY_NOT_FOUND_FOR_APPLY",
                message="Activity referenced by the apply action does not exist or is out of scope.",
            )
        # Sanity: the activity must be one of the conflict's involved activities.
        link_check = await db.execute(
            select(PlannerConflictActivity.activity_id).where(
                PlannerConflictActivity.conflict_id == conflict.id,
                PlannerConflictActivity.activity_id == target.id,
            )
        )
        if link_check.scalars().first() is None:
            raise StructuredHTTPException(
                400,
                code="APPLY_ACTIVITY_NOT_IN_CONFLICT",
                message="The activity selected for the apply action is not part of this conflict.",
            )

        action = body.apply.action
        before = {
            "start_date": target.start_date,
            "end_date": target.end_date,
            "pax_quota": target.pax_quota,
            "status": target.status,
        }
        if action == "shift":
            if body.apply.days is None or body.apply.days == 0:
                raise StructuredHTTPException(
                    400,
                    code="APPLY_SHIFT_DAYS_REQUIRED",
                    message="A non-zero 'days' value is required for action 'shift'.",
                )
            if not target.start_date or not target.end_date:
                raise StructuredHTTPException(
                    400,
                    code="APPLY_SHIFT_NEEDS_WINDOW",
                    message="Cannot shift an activity that has no start_date or end_date.",
                )
            delta = timedelta(days=int(body.apply.days))
            target.start_date = target.start_date + delta
            target.end_date = target.end_date + delta
        elif action == "set_window":
            if not body.apply.start_date and not body.apply.end_date:
                raise StructuredHTTPException(
                    400,
                    code="APPLY_SET_WINDOW_REQUIRED",
                    message="At least one of 'start_date' / 'end_date' is required for action 'set_window'.",
                )
            if body.apply.start_date:
                target.start_date = datetime.fromisoformat(body.apply.start_date.replace("Z", "+00:00"))
            if body.apply.end_date:
                target.end_date = datetime.fromisoformat(body.apply.end_date.replace("Z", "+00:00"))
            if target.start_date and target.end_date and target.end_date < target.start_date:
                raise StructuredHTTPException(
                    400,
                    code="APPLY_END_BEFORE_START",
                    message="end_date must be after start_date",
                )
        elif action == "set_quota":
            if body.apply.pax_quota is None or body.apply.pax_quota < 0:
                raise StructuredHTTPException(
                    400,
                    code="APPLY_QUOTA_REQUIRED",
                    message="A non-negative 'pax_quota' value is required for action 'set_quota'.",
                )
            target.pax_quota = int(body.apply.pax_quota)
        elif action == "cancel":
            target.status = "cancelled"
        applied_action_summary = {
            "activity_id": str(target.id),
            "activity_title": target.title,
            "action": action,
            "before": {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in before.items()},
            "after": {
                "start_date": target.start_date.isoformat() if target.start_date else None,
                "end_date": target.end_date.isoformat() if target.end_date else None,
                "pax_quota": target.pax_quota,
                "status": target.status,
            },
        }
        # Re-detect on this activity so NEW conflicts on the new window
        # are surfaced. Then sweep stale OPEN conflicts whose day no
        # longer overflows — this is what makes the cluster collapse
        # into a single arbitration in the user's eyes.
        if target.status in ("submitted", "validated", "in_progress"):
            await _detect_and_create_conflicts(db, target, entity_id)
        cleared = await _auto_clear_stale_conflicts(
            db,
            asset_id=conflict.asset_id,
            entity_id=entity_id,
            triggered_by_resolution=body.resolution,
            triggered_by_note=body.resolution_note,
            actor_id=current_user.id,
        )
        if applied_action_summary is not None:
            applied_action_summary["auto_cleared_count"] = cleared

    old_status = conflict.status
    old_resolution = conflict.resolution
    conflict.status = "deferred" if body.resolution == "deferred" else "resolved"
    conflict.resolution = body.resolution
    conflict.resolution_note = body.resolution_note
    conflict.resolved_by = current_user.id
    conflict.resolved_at = datetime.now(timezone.utc)

    # Append an audit row (append-only history of who resolved what).
    # When a concrete action was applied (shift/set_window/set_quota/
    # cancel), capture the target activity + full before/after payload
    # so downstream readers can render an explicit decision instead of
    # just the resolution label.
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
        target_activity_id=(
            UUID(applied_action_summary["activity_id"])
            if applied_action_summary else None
        ),
        action_payload=applied_action_summary,
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
            "applied_action": applied_action_summary,
        },
    ))

    if applied_action_summary:
        d["applied_action"] = applied_action_summary
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
        raise StructuredHTTPException(
            404,
            code="CONFLICT_NOT_FOUND",
            message="Conflict not found",
        )

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
            "target_activity_id": row.target_activity_id,
            "action_payload": row.action_payload,
        }
    return [_to_dict(r) for r in rows]


async def _get_planner_revision_response_delay_hours(db: AsyncSession, entity_id: UUID) -> int:
    result = await db.execute(
        select(Setting).where(
            Setting.key == "planner.revision_response_delay_hours",
            Setting.scope.in_(["entity", "tenant"]),
        )
    )
    settings_rows = result.scalars().all()

    entity_setting = next(
        (row for row in settings_rows if row.scope == "entity" and row.scope_id == str(entity_id)),
        None,
    )
    tenant_setting = next(
        (row for row in settings_rows if row.scope == "tenant" and row.scope_id in (None, "")),
        None,
    )
    setting = entity_setting or tenant_setting
    if not setting or not isinstance(setting.value, dict):
        return 72

    payload = setting.value.get("v", setting.value)
    try:
        hours = int(payload)
    except (TypeError, ValueError):
        return 72
    return max(1, hours)


async def _resolve_revision_signal_target(
    db: AsyncSession,
    *,
    signal: AuditLog,
    entity_id: UUID,
) -> tuple[UUID, str | None]:
    details = signal.details or {}
    project_id = details.get("project_id")
    task_id = details.get("task_id")

    if project_id:
        project = await db.get(Project, UUID(str(project_id)))
        if project and project.entity_id == entity_id and project.manager_id:
            manager = await db.get(User, project.manager_id)
            manager_name = None
            if manager:
                manager_name = f"{manager.first_name} {manager.last_name}".strip() or manager.email
            return project.manager_id, manager_name

    if task_id:
        task = await db.get(ProjectTask, UUID(str(task_id)))
        if task and task.assignee_id:
            assignee = await db.get(User, task.assignee_id)
            assignee_name = None
            if assignee:
                assignee_name = f"{assignee.first_name} {assignee.last_name}".strip() or assignee.email
            return task.assignee_id, assignee_name

    raise StructuredHTTPException(
        400,
        code="NO_ELIGIBLE_PROJECT_MANAGER_ASSIGNEE_FOUND",
        message="No eligible project manager or assignee found for this revision signal",
    )


async def _get_latest_revision_request_resolution(
    db: AsyncSession,
    *,
    entity_id: UUID,
    request_id: UUID,
) -> AuditLog | None:
    result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.resource_type == "planner_revision_request",
            AuditLog.resource_id == str(request_id),
            AuditLog.action.in_(["planner.revision.responded", "planner.revision.forced"]),
        )
        .order_by(AuditLog.created_at.desc())
    )
    return result.scalars().first()


def _build_revision_request_read(request_row: AuditLog, resolution_row: AuditLog | None) -> dict:
    request_details = request_row.details or {}
    resolution_details = resolution_row.details or {} if resolution_row else {}
    status = "pending"
    if resolution_row:
        status = "forced" if resolution_row.action == "planner.revision.forced" else "responded"

    return {
        "id": request_row.id,
        "signal_id": UUID(str(request_row.resource_id)),
        "created_at": request_row.created_at,
        "due_at": request_details.get("due_at"),
        "status": status,
        "project_id": request_details.get("project_id"),
        "project_code": request_details.get("project_code"),
        "project_name": request_details.get("project_name"),
        "task_id": request_details.get("task_id"),
        "task_title": request_details.get("task_title"),
        "planner_activity_ids": request_details.get("planner_activity_ids") or [],
        "requester_user_id": request_details.get("requester_user_id"),
        "requester_user_name": request_details.get("requester_user_name"),
        "target_user_id": request_details.get("target_user_id"),
        "target_user_name": request_details.get("target_user_name"),
        "note": request_details.get("note"),
        "proposed_start_date": request_details.get("proposed_start_date"),
        "proposed_end_date": request_details.get("proposed_end_date"),
        "proposed_pax_quota": request_details.get("proposed_pax_quota"),
        "proposed_status": request_details.get("proposed_status"),
        "response": resolution_details.get("response"),
        "response_note": resolution_details.get("response_note"),
        "counter_start_date": resolution_details.get("counter_start_date"),
        "counter_end_date": resolution_details.get("counter_end_date"),
        "counter_pax_quota": resolution_details.get("counter_pax_quota"),
        "counter_status": resolution_details.get("counter_status"),
        "responded_at": resolution_details.get("responded_at"),
        "forced_at": resolution_details.get("forced_at"),
        "forced_reason": resolution_details.get("reason"),
        "application_result": resolution_details.get("application_result"),
    }


async def _apply_accepted_revision_request(
    db: AsyncSession,
    *,
    entity_id: UUID,
    request_details: dict,
) -> dict:
    result = {
        "applied_to_task": False,
        "task_requires_manual_breakdown": False,
        "applied_activity_count": 0,
        "applied_fields": [],
        # Spec §2.8: when the modified task is a parent, OpsFlux must
        # highlight the child tasks so the chef-de-projet knows which
        # ones to update. We return the list of child IDs here so the
        # frontend can highlight them immediately, and we ALSO persist
        # one audit entry per child (resource_type='project_task_
        # breakdown_pending') so the highlight survives page reloads
        # until the chef-de-projet explicitly dismisses or the child's
        # dates get updated.
        "child_task_ids": [],
    }

    proposed_start_date = request_details.get("proposed_start_date")
    proposed_end_date = request_details.get("proposed_end_date")
    proposed_pax_quota = request_details.get("proposed_pax_quota")
    proposed_status = request_details.get("proposed_status")
    activity_ids = [UUID(str(v)) for v in (request_details.get("planner_activity_ids") or [])]

    task_id_raw = request_details.get("task_id")
    if task_id_raw:
        task = await db.get(ProjectTask, UUID(str(task_id_raw)))
        if task and task.project_id and task.active:
            # Fetch child task ids (needed whether we flag breakdown
            # or not — we use the count as a branching signal).
            child_rows = (
                await db.execute(
                    select(ProjectTask.id).where(
                        ProjectTask.parent_id == task.id,
                        ProjectTask.active == True,  # noqa: E712
                    )
                )
            ).all()
            child_ids = [row[0] for row in child_rows]

            if child_ids:
                result["task_requires_manual_breakdown"] = True
                result["child_task_ids"] = [str(cid) for cid in child_ids]
                # Persist one breakdown-pending marker per child so the
                # UI can highlight them across reloads and so the user
                # can dismiss them individually after updating each one.
                for child_id in child_ids:
                    await record_audit(
                        db,
                        action="project.task.breakdown_pending",
                        resource_type="project_task",
                        resource_id=str(child_id),
                        user_id=None,
                        entity_id=entity_id,
                        details={
                            "project_id": str(task.project_id),
                            "parent_task_id": str(task.id),
                            "parent_task_title": task.title,
                            "proposed_start_date": str(proposed_start_date) if proposed_start_date else None,
                            "proposed_end_date": str(proposed_end_date) if proposed_end_date else None,
                            "proposed_status": str(proposed_status) if proposed_status else None,
                            "resolved": False,
                        },
                    )
            else:
                if proposed_start_date:
                    task.start_date = datetime.fromisoformat(str(proposed_start_date))
                    result["applied_fields"].append("task.start_date")
                if proposed_end_date:
                    task.due_date = datetime.fromisoformat(str(proposed_end_date))
                    result["applied_fields"].append("task.due_date")
                if proposed_status:
                    task.status = str(proposed_status)
                    result["applied_fields"].append("task.status")
                if result["applied_fields"]:
                    result["applied_to_task"] = True

    for activity_id in activity_ids:
        activity = await db.get(PlannerActivity, activity_id)
        if not activity or activity.entity_id != entity_id or not activity.active:
            continue
        changed = False
        if proposed_start_date:
            activity.start_date = datetime.fromisoformat(str(proposed_start_date))
            changed = True
        if proposed_end_date:
            activity.end_date = datetime.fromisoformat(str(proposed_end_date))
            changed = True
        if proposed_pax_quota is not None:
            activity.pax_quota = int(proposed_pax_quota)
            changed = True
        if proposed_status:
            activity.status = str(proposed_status)
            changed = True
        if changed:
            result["applied_activity_count"] += 1

    return result


@router.get("/revision-signals", response_model=PaginatedResponse[RevisionSignalRead])
async def list_revision_signals(
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """List project-driven Planner revision signals captured in audit_log."""
    query = (
        select(AuditLog, User.first_name, User.last_name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "project.task.planner_sync_required",
            AuditLog.resource_type == "planner_activity",
            ~sqla_func.cast(AuditLog.id, String).in_(
                select(AuditLog.resource_id).where(
                    AuditLog.entity_id == entity_id,
                    AuditLog.action == "project.task.planner_sync_reviewed",
                    AuditLog.resource_type == "planner_revision_signal",
                    AuditLog.resource_id.is_not(None),
                )
            ),
        )
        .order_by(AuditLog.created_at.desc())
    )

    def _transform(row):
        audit = row[0]
        details = audit.details or {}
        planner_activity_ids = details.get("planner_activity_ids") or []
        return {
            "id": audit.id,
            "created_at": audit.created_at,
            "task_id": details.get("task_id"),
            "task_title": details.get("task_title"),
            "task_status": details.get("task_status"),
            "project_id": details.get("project_id"),
            "project_code": details.get("project_code"),
            "project_name": details.get("project_name"),
            "changed_fields": details.get("changed_fields") or [],
            "planner_activity_ids": planner_activity_ids,
            "planner_activity_count": details.get("planner_activity_count") or len(planner_activity_ids),
            "actor_id": audit.user_id,
            "actor_name": f"{row[1]} {row[2]}".strip() if row[1] else None,
        }

    return await paginate(db, query, pagination, transform=_transform)


@router.post(
    "/revision-signals/{signal_id}/acknowledge",
    response_model=RevisionSignalAcknowledgeRead,
)
async def acknowledge_revision_signal(
    signal_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Mark a project-driven revision signal as reviewed by a Planner arbiter."""
    signal = await db.get(AuditLog, signal_id)
    if not signal or signal.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_SIGNAL_NOT_FOUND",
            message="Revision signal not found",
        )
    if signal.action != "project.task.planner_sync_required" or signal.resource_type != "planner_activity":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_SIGNAL",
            message="Invalid revision signal",
        )

    existing = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "project.task.planner_sync_reviewed",
            AuditLog.resource_type == "planner_revision_signal",
            AuditLog.resource_id == str(signal_id),
        )
    )
    if not existing.scalars().first():
        await record_audit(
            db,
            action="project.task.planner_sync_reviewed",
            resource_type="planner_revision_signal",
            resource_id=str(signal_id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "source_action": signal.action,
                "source_resource_type": signal.resource_type,
                "source_resource_id": signal.resource_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            },
            ip_address=getattr(request.client, "host", None) if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()

    return RevisionSignalAcknowledgeRead(acknowledged=True, signal_id=signal_id)


@router.get(
    "/revision-signals/{signal_id}/impact-summary",
    response_model=RevisionSignalImpactRead,
)
async def get_revision_signal_impact_summary(
    signal_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return current downstream impact summary for a project-driven revision signal."""
    signal = await db.get(AuditLog, signal_id)
    if not signal or signal.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_SIGNAL_NOT_FOUND",
            message="Revision signal not found",
        )
    if signal.action != "project.task.planner_sync_required" or signal.resource_type != "planner_activity":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_SIGNAL",
            message="Invalid revision signal",
        )

    details = signal.details or {}
    activity_ids = [UUID(str(v)) for v in (details.get("planner_activity_ids") or [])]
    activities_summary = []
    total_ads_affected = 0
    total_manifests_affected = 0
    total_open_conflict_days = 0

    for activity_id in activity_ids:
        activity = await db.get(PlannerActivity, activity_id)
        if not activity or activity.entity_id != entity_id or not activity.active:
            continue

        ads_count_result = await db.execute(
            text(
                "SELECT COUNT(*) FROM ads "
                "WHERE planner_activity_id = :aid "
                "AND status IN ('approved', 'in_progress')"
            ),
            {"aid": str(activity_id)},
        )
        ads_affected = ads_count_result.scalar() or 0

        manifests_result = await db.execute(
            text(
                "SELECT COUNT(DISTINCT pm.id) "
                "FROM pax_manifests pm "
                "JOIN pax_manifest_entries pme ON pme.manifest_id = pm.id "
                "JOIN ads_pax ap ON ap.id = pme.ads_pax_id "
                "JOIN ads a ON a.id = ap.ads_id "
                "WHERE a.planner_activity_id = :aid "
                "AND pm.status IN ('draft', 'pending_validation', 'validated')"
            ),
            {"aid": str(activity_id)},
        )
        manifests_affected = manifests_result.scalar() or 0

        conflict_days_result = await db.execute(
            select(sqla_func.count(sqla_func.distinct(PlannerConflict.conflict_date)))
            .select_from(PlannerConflict)
            .join(
                PlannerConflictActivity,
                PlannerConflictActivity.conflict_id == PlannerConflict.id,
            )
            .where(
                PlannerConflict.entity_id == entity_id,
                PlannerConflictActivity.activity_id == activity_id,
                PlannerConflict.status == "open",
                PlannerConflict.active == True,  # noqa: E712
            )
        )
        open_conflict_days = conflict_days_result.scalar() or 0

        total_ads_affected += ads_affected
        total_manifests_affected += manifests_affected
        total_open_conflict_days += open_conflict_days
        activities_summary.append(
            {
                "activity_id": activity.id,
                "activity_title": activity.title,
                "activity_status": activity.status,
                "ads_affected": ads_affected,
                "manifests_affected": manifests_affected,
                "open_conflict_days": open_conflict_days,
            }
        )

    return RevisionSignalImpactRead(
        signal_id=signal_id,
        activity_count=len(activities_summary),
        total_ads_affected=total_ads_affected,
        total_manifests_affected=total_manifests_affected,
        total_open_conflict_days=total_open_conflict_days,
        activities=activities_summary,
    )


@router.get(
    "/revision-decision-requests",
    response_model=PaginatedResponse[RevisionDecisionRequestRead],
)
async def list_revision_decision_requests(
    direction: str = Query("incoming", pattern=r"^(incoming|outgoing)$"),
    status: str = Query("pending", pattern=r"^(pending|responded|forced|all)$"),
    project_id: UUID | None = None,
    task_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(AuditLog)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "planner.revision.requested",
            AuditLog.resource_type == "planner_revision_signal",
        )
        .order_by(AuditLog.created_at.desc())
    )

    if direction == "incoming":
        query = query.where(text("details->>'target_user_id' = :uid")).params(uid=str(current_user.id))
    else:
        query = query.where(AuditLog.user_id == current_user.id)
    if project_id:
        query = query.where(text("details->>'project_id' = :project_id")).params(project_id=str(project_id))
    if task_id:
        query = query.where(text("details->>'task_id' = :task_id")).params(task_id=str(task_id))

    rows = (await db.execute(query)).scalars().all()

    items = []
    for request_row in rows:
        resolution_row = await _get_latest_revision_request_resolution(
            db,
            entity_id=entity_id,
            request_id=request_row.id,
        )
        item = _build_revision_request_read(request_row, resolution_row)
        if status != "all" and item["status"] != status:
            continue
        items.append(item)

    total = len(items)
    items = items[pagination.offset: pagination.offset + pagination.page_size]
    pages = (total + pagination.page_size - 1) // pagination.page_size if total > 0 else 0
    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }


@router.post(
    "/revision-signals/{signal_id}/request-decision",
    response_model=RevisionDecisionRequestRead,
)
async def request_revision_decision(
    signal_id: UUID,
    body: RevisionDecisionRequestCreate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    signal = await db.get(AuditLog, signal_id)
    if not signal or signal.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_SIGNAL_NOT_FOUND",
            message="Revision signal not found",
        )
    if signal.action != "project.task.planner_sync_required" or signal.resource_type != "planner_activity":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_SIGNAL",
            message="Invalid revision signal",
        )

    target_user_id, target_user_name = await _resolve_revision_signal_target(db, signal=signal, entity_id=entity_id)
    requester_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email
    due_at = body.due_at or (
        datetime.now(timezone.utc) + timedelta(hours=await _get_planner_revision_response_delay_hours(db, entity_id))
    )
    details = signal.details or {}

    await record_audit(
        db,
        action="planner.revision.requested",
        resource_type="planner_revision_signal",
        resource_id=str(signal_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "signal_id": str(signal_id),
            "project_id": details.get("project_id"),
            "project_code": details.get("project_code"),
            "project_name": details.get("project_name"),
            "task_id": details.get("task_id"),
            "task_title": details.get("task_title"),
            "planner_activity_ids": details.get("planner_activity_ids") or [],
            "requester_user_id": str(current_user.id),
            "requester_user_name": requester_name,
            "target_user_id": str(target_user_id),
            "target_user_name": target_user_name,
            "note": body.note,
            "due_at": due_at.isoformat(),
            "proposed_start_date": body.proposed_start_date.isoformat() if body.proposed_start_date else None,
            "proposed_end_date": body.proposed_end_date.isoformat() if body.proposed_end_date else None,
            "proposed_pax_quota": body.proposed_pax_quota,
            "proposed_status": body.proposed_status,
        },
        ip_address=getattr(request.client, "host", None) if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    latest_request = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "planner.revision.requested",
            AuditLog.resource_type == "planner_revision_signal",
            AuditLog.resource_id == str(signal_id),
            AuditLog.user_id == current_user.id,
        )
        .order_by(AuditLog.created_at.desc())
    )
    request_row = latest_request.scalars().first()

    await event_bus.publish(OpsFluxEvent(
        event_type="planner.revision.requested",
        payload={
            "entity_id": str(entity_id),
            "signal_id": str(signal_id),
            "request_id": str(request_row.id) if request_row else "",
            "target_user_id": str(target_user_id),
            "target_user_name": target_user_name,
            "requester_user_id": str(current_user.id),
            "requester_user_name": requester_name,
            "project_id": details.get("project_id"),
            "project_code": details.get("project_code"),
            "task_id": details.get("task_id"),
            "task_title": details.get("task_title"),
            "due_at": due_at.isoformat(),
            "note": body.note,
        },
    ))
    return _build_revision_request_read(request_row, None)


@router.post(
    "/revision-decision-requests/{request_id}/respond",
    response_model=RevisionDecisionRequestRead,
)
async def respond_revision_decision_request(
    request_id: UUID,
    body: RevisionDecisionRespond,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    request_row = await db.get(AuditLog, request_id)
    if not request_row or request_row.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_DECISION_REQUEST_NOT_FOUND",
            message="Revision decision request not found",
        )
    if request_row.action != "planner.revision.requested" or request_row.resource_type != "planner_revision_signal":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_DECISION_REQUEST",
            message="Invalid revision decision request",
        )

    request_details = request_row.details or {}
    target_user_id = request_details.get("target_user_id")
    if str(current_user.id) != str(target_user_id):
        raise StructuredHTTPException(
            403,
            code="ONLY_TARGETED_REVIEWER_CAN_ANSWER_REVISION",
            message="Only the targeted reviewer can answer this revision request",
        )

    existing_resolution = await _get_latest_revision_request_resolution(
        db,
        entity_id=entity_id,
        request_id=request_id,
    )
    if existing_resolution:
        raise StructuredHTTPException(
            400,
            code="REVISION_DECISION_REQUEST_ALREADY_RESOLVED",
            message="Revision decision request already resolved",
        )

    if body.response == "counter_proposed" and not any([
        body.response_note,
        body.counter_start_date,
        body.counter_end_date,
        body.counter_pax_quota is not None,
        body.counter_status,
    ]):
        raise StructuredHTTPException(
            400,
            code="COUNTER_PROPOSAL_DETAILS_REQUIRED",
            message="Counter proposal details are required",
        )

    application_result = None
    if body.response == "accepted":
        application_result = await _apply_accepted_revision_request(
            db,
            entity_id=entity_id,
            request_details=request_details,
        )

    await record_audit(
        db,
        action="planner.revision.responded",
        resource_type="planner_revision_request",
        resource_id=str(request_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "response": body.response,
            "response_note": body.response_note,
            "counter_start_date": body.counter_start_date.isoformat() if body.counter_start_date else None,
            "counter_end_date": body.counter_end_date.isoformat() if body.counter_end_date else None,
            "counter_pax_quota": body.counter_pax_quota,
            "counter_status": body.counter_status,
            "responded_at": datetime.now(timezone.utc).isoformat(),
            "application_result": application_result,
        },
        ip_address=getattr(request.client, "host", None) if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    await event_bus.publish(OpsFluxEvent(
        event_type="planner.revision.responded",
        payload={
            "entity_id": str(entity_id),
            "request_id": str(request_id),
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "requester_user_id": request_details.get("requester_user_id"),
            "requester_user_name": request_details.get("requester_user_name"),
            "target_user_id": request_details.get("target_user_id"),
            "target_user_name": request_details.get("target_user_name"),
            "response": body.response,
            "response_note": body.response_note,
            "application_result": application_result,
        },
    ))

    resolution_row = await _get_latest_revision_request_resolution(db, entity_id=entity_id, request_id=request_id)
    return _build_revision_request_read(request_row, resolution_row)


@router.post(
    "/revision-decision-requests/{request_id}/force",
    response_model=RevisionDecisionRequestRead,
)
async def force_revision_decision_request(
    request_id: UUID,
    body: RevisionDecisionForce,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    request_row = await db.get(AuditLog, request_id)
    if not request_row or request_row.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_DECISION_REQUEST_NOT_FOUND",
            message="Revision decision request not found",
        )
    if request_row.action != "planner.revision.requested" or request_row.resource_type != "planner_revision_signal":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_DECISION_REQUEST",
            message="Invalid revision decision request",
        )

    existing_resolution = await _get_latest_revision_request_resolution(
        db,
        entity_id=entity_id,
        request_id=request_id,
    )
    if existing_resolution:
        raise StructuredHTTPException(
            400,
            code="REVISION_DECISION_REQUEST_ALREADY_RESOLVED",
            message="Revision decision request already resolved",
        )

    request_details = request_row.details or {}
    due_at_raw = request_details.get("due_at")
    due_at = datetime.fromisoformat(due_at_raw) if isinstance(due_at_raw, str) else None
    now = datetime.now(timezone.utc)
    if due_at and due_at > now:
        raise StructuredHTTPException(
            400,
            code="REVISION_DECISION_REQUEST_NOT_YET_OVERDUE",
            message="Revision decision request is not yet overdue",
        )

    await record_audit(
        db,
        action="planner.revision.forced",
        resource_type="planner_revision_request",
        resource_id=str(request_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "reason": body.reason,
            "forced_at": now.isoformat(),
        },
        ip_address=getattr(request.client, "host", None) if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    await event_bus.publish(OpsFluxEvent(
        event_type="planner.revision.forced",
        payload={
            "entity_id": str(entity_id),
            "request_id": str(request_id),
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "requester_user_id": request_details.get("requester_user_id"),
            "requester_user_name": request_details.get("requester_user_name"),
            "target_user_id": request_details.get("target_user_id"),
            "target_user_name": request_details.get("target_user_name"),
            "reason": body.reason,
            "due_at": due_at_raw,
        },
    ))

    resolution_row = await _get_latest_revision_request_resolution(db, entity_id=entity_id, request_id=request_id)
    return _build_revision_request_read(request_row, resolution_row)


@router.post(
    "/revision-decision-requests/{request_id}/accept-counter",
    response_model=RevisionDecisionRequestRead,
)
async def accept_counter_revision_decision_request(
    request_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Arbiter accepts a counter-proposal from the target reviewer.

    Applies counter_* values (instead of proposed_*) to the task and activities.
    Creates a new resolution AuditLog with action='planner.revision.counter_accepted'.
    """
    request_row = await db.get(AuditLog, request_id)
    if not request_row or request_row.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="REVISION_DECISION_REQUEST_NOT_FOUND",
            message="Revision decision request not found",
        )
    if request_row.action != "planner.revision.requested" or request_row.resource_type != "planner_revision_signal":
        raise StructuredHTTPException(
            400,
            code="INVALID_REVISION_DECISION_REQUEST",
            message="Invalid revision decision request",
        )

    # Only the original requester can accept a counter
    if request_row.user_id != current_user.id:
        raise StructuredHTTPException(
            403,
            code="ONLY_ORIGINAL_REQUESTER_CAN_ACCEPT_COUNTER",
            message="Only the original requester can accept a counter-proposal",
        )

    resolution_row = await _get_latest_revision_request_resolution(
        db, entity_id=entity_id, request_id=request_id,
    )
    if not resolution_row:
        raise StructuredHTTPException(
            400,
            code="NO_RESPONSE_ACCEPT_REVISION_DECISION_REQUEST",
            message="No response to accept — revision decision request is still pending",
        )

    resolution_details = resolution_row.details or {}
    if resolution_details.get("response") != "counter_proposed":
        raise StructuredHTTPException(
            400,
            code="RESPONSE_NOT_COUNTER_PROPOSAL",
            message="The response is not a counter-proposal",
        )

    # Build a synthetic request_details with counter_* values replacing proposed_* values
    request_details = request_row.details or {}
    counter_request_details = {
        **request_details,
        "proposed_start_date": resolution_details.get("counter_start_date"),
        "proposed_end_date": resolution_details.get("counter_end_date"),
        "proposed_pax_quota": resolution_details.get("counter_pax_quota"),
        "proposed_status": resolution_details.get("counter_status"),
    }

    application_result = await _apply_accepted_revision_request(
        db, entity_id=entity_id, request_details=counter_request_details,
    )

    now = datetime.now(timezone.utc)
    await record_audit(
        db,
        action="planner.revision.counter_accepted",
        resource_type="planner_revision_request",
        resource_id=str(request_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "response": "counter_accepted",
            "counter_start_date": resolution_details.get("counter_start_date"),
            "counter_end_date": resolution_details.get("counter_end_date"),
            "counter_pax_quota": resolution_details.get("counter_pax_quota"),
            "counter_status": resolution_details.get("counter_status"),
            "accepted_at": now.isoformat(),
            "application_result": application_result,
        },
        ip_address=getattr(request.client, "host", None) if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    await event_bus.publish(OpsFluxEvent(
        event_type="planner.revision.counter_accepted",
        payload={
            "entity_id": str(entity_id),
            "request_id": str(request_id),
            "signal_id": request_details.get("signal_id") or request_row.resource_id,
            "requester_user_id": str(current_user.id),
            "target_user_id": request_details.get("target_user_id"),
            "target_user_name": request_details.get("target_user_name"),
            "application_result": application_result,
        },
    ))

    updated_resolution = await _get_latest_revision_request_resolution(db, entity_id=entity_id, request_id=request_id)
    return _build_revision_request_read(request_row, updated_resolution)


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

    Formula: residual = capacity - permanent_ops_quota - sum(validated activities pax_quota)
    """
    asset = await db.get(Installation, asset_id)
    if not asset or asset.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="INSTALLATION_NOT_FOUND",
            message="Installation not found",
        )

    from app.services.modules.planner_service import get_current_capacity

    base_cap = await get_current_capacity(db, asset_id, date_from)
    total = int(base_cap["max_pax_total"]) if base_cap else 0
    perm_ops = int(base_cap["permanent_ops_quota"]) if base_cap else 0

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
    deps = result.scalars().all()

    # Resolve activity titles in one batch query so the frontend doesn't have
    # to do N lookups to display the human-readable names.
    activity_ids: set[UUID] = set()
    for dep in deps:
        activity_ids.add(dep.predecessor_id)
        activity_ids.add(dep.successor_id)
    titles_by_id: dict[UUID, str] = {}
    if activity_ids:
        title_rows = await db.execute(
            select(PlannerActivity.id, PlannerActivity.title).where(
                PlannerActivity.id.in_(activity_ids)
            )
        )
        for row in title_rows.all():
            titles_by_id[row[0]] = row[1]

    return [
        {
            "id": dep.id,
            "predecessor_id": dep.predecessor_id,
            "successor_id": dep.successor_id,
            "dependency_type": dep.dependency_type,
            "lag_days": dep.lag_days,
            "predecessor_title": titles_by_id.get(dep.predecessor_id),
            "successor_title": titles_by_id.get(dep.successor_id),
        }
        for dep in deps
    ]


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
        raise StructuredHTTPException(
            400,
            code="ACTIVITY_MUST_EITHER_PREDECESSOR_SUCCESSOR",
            message="Activity must be either predecessor or successor",
        )
    # Prevent self-dependency
    if body.predecessor_id == body.successor_id:
        raise StructuredHTTPException(
            400,
            code="ACTIVITY_CANNOT_DEPEND_ITSELF",
            message="Activity cannot depend on itself",
        )
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
        raise StructuredHTTPException(
            404,
            code="DEPENDENCY_NOT_FOUND",
            message="Dependency not found",
        )
    # Hard delete: dependencies are pure join records between two activities
    # and have no SoftDeleteMixin (no `archived`/`deleted_at` columns), so the
    # generic soft-delete helper would be a no-op and the row would stay in
    # the DB — causing the arrow to "reappear" after deletion in the UI.
    await db.delete(dep)
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
    if not asset or asset.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="INSTALLATION_NOT_FOUND",
            message="Installation not found",
        )

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
    if not asset or asset.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="INSTALLATION_NOT_FOUND",
            message="Installation not found",
        )

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

    # Keep installation fallback aligned with the latest explicit capacity baseline.
    asset.pob_capacity = max_pax_total
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
        raise StructuredHTTPException(
            400,
            code="LA_PRIORIT_MINIMALE_POUR_CE_TYPE",
            message="La priorité minimale pour ce type d'activité est '{corrected}'. Impossible de réduire en dessous.",
            params={
                "corrected": corrected,
            },
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
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    asset_id: UUID | None = Query(None),
    types: str | None = Query(None, description="Comma-separated activity types"),
    statuses: str | None = Query(None, description="Comma-separated statuses"),
    show_permanent_ops: bool = Query(True),
    scenario_id: UUID | None = Query(None, description="When set, applies scenario overlay on top of live activities"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get Gantt chart data — activities grouped by asset with capacity info.

    When scenario_id is provided the live activities are merged with the
    scenario's overlay: removed activities are excluded, field overrides are
    applied, and new scenario activities are appended. This lets every tab
    show the full simulation without touching the live plan.

    Visibility scope: a user without `planner.activity.read_all` only
    sees activities they created — same rule as the activities table.
    Without this the Gantt would leak every activity in the entity.
    """
    from app.services.modules.planner_service import get_gantt_data

    asset_ids = [asset_id] if asset_id else None
    type_list = types.split(",") if types else None
    status_list = statuses.split(",") if statuses else None

    # Apply user-scoped visibility (mirrors list_activities).
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    can_read_all = await has_user_permission(
        current_user, entity_id, "planner.activity.read_all", db
    )
    created_by_filter = None if can_read_all else acting_user_id

    return await get_gantt_data(
        db, entity_id, start_date, end_date,
        asset_ids=asset_ids,
        types=type_list,
        statuses=status_list,
        show_permanent_ops=show_permanent_ops,
        scenario_id=scenario_id,
        created_by_filter=created_by_filter,
    )


# ── Gantt PDF export (A3 landscape) ──────────────────────────────────────


class GanttPdfColumn(BaseModel):
    """A timeline column in the Gantt header (one per visible date cell)."""
    key: str                           # e.g. "2026-04-10" or "w15"
    label: str                         # e.g. "10 avr." or "S15"
    group_label: str | None = None     # e.g. "avril 2026" — for the parent header row
    is_today: bool = False
    is_weekend: bool = False
    is_dim: bool = False               # weekends / out-of-month → fade


class GanttPdfHeatmapCell(BaseModel):
    value: str = ""
    bg: str | None = None
    fg: str | None = None


class GanttPdfBar(BaseModel):
    start_col: int                     # inclusive index into columns[]
    end_col: int                       # inclusive index into columns[]
    color: str
    text_color: str = "#ffffff"
    label: str | None = None           # e.g. activity title
    is_draft: bool = False
    is_critical: bool = False
    progress: int | None = None
    cell_labels: list[str] | None = None  # one label per spanned column (PAX values)


class GanttPdfRow(BaseModel):
    id: str
    label: str
    sublabel: str | None = None
    level: int = 0                     # indent level (0 = field, 1 = site, ...)
    is_heatmap: bool = False           # row uses heatmap cells (parent rows)
    heatmap_cells: list[GanttPdfHeatmapCell] = Field(default_factory=list)
    bar: GanttPdfBar | None = None     # for activity rows


class GanttPdfExportRequest(BaseModel):
    """Server-side rendered Gantt PDF payload.

    The frontend builds the columns + rows + bars from its memoised
    state and POSTs the JSON. The backend renders the
    `planner.gantt_export` PDF template (A3 landscape) via WeasyPrint —
    no html2canvas screenshot, no image. Result is a vector PDF with
    crisp text and proper typography.
    """
    title: str | None = None
    subtitle: str | None = None
    date_range: str | None = None
    scale: str | None = None
    columns: list[GanttPdfColumn] = Field(default_factory=list)
    rows: list[GanttPdfRow] = Field(default_factory=list)
    task_col_label: str = "Tâche"


@router.post("/export/gantt-pdf")
async def export_gantt_pdf(
    payload: GanttPdfExportRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Render the Planner Gantt as an A3 landscape PDF (vector, server-side).

    Uses the system PDF template `planner.gantt_export`. Seeded in
    `DEFAULT_PDF_TEMPLATES` so tenants can override the HTML body from the
    admin Template manager if needed.
    """
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity

    entity = await db.get(Entity, entity_id)
    generated_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    generated_by = getattr(current_user, "full_name", None) or current_user.email

    # Build column groups (e.g. month spans) from the column list so the
    # template can render the parent header row above the day labels.
    column_groups: list[dict] = []
    if payload.columns:
        current_label: str | None = None
        for col in payload.columns:
            if col.group_label and col.group_label != current_label:
                column_groups.append({"label": col.group_label, "span": 1})
                current_label = col.group_label
            elif column_groups:
                column_groups[-1]["span"] += 1

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="planner.gantt_export",
            entity_id=entity_id,
            language="fr",
            variables={
                "title": payload.title or "Planner — Gantt",
                "subtitle": payload.subtitle or "",
                "date_range": payload.date_range or "",
                "scale": payload.scale or "",
                "generated_at": generated_at,
                "generated_by": generated_by,
                "entity": {"name": entity.name if entity else ""},
                "task_col_label": payload.task_col_label,
                "columns": [c.model_dump() for c in payload.columns],
                "column_groups": column_groups,
                "rows": [r.model_dump() for r in payload.rows],
            },
        )
    except Exception as e:
        logger.exception("Failed to render Gantt PDF")
        raise StructuredHTTPException(
            500,
            code="PDF_GENERATION_FAILED",
            message="PDF generation failed: {e}",
            params={
                "e": e,
            },
        )

    if pdf_bytes is None:
        raise StructuredHTTPException(
            404,
            code="PDF_TEMPLATE_PLANNER_GANTT_EXPORT_NOT",
            message="PDF template 'planner.gantt_export' not found. Run the seed_pdf_templates job.",
        )

    filename = f"planner-gantt-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Conflict cluster PDF + Email ─────────────────────────────────────────
#
# Single endpoint family for the "arbitrate then broadcast" workflow we
# observe on real production sites (RDR Q2-2026 etc.). The user picks
# any conflict from a cluster — the backend rebuilds the cluster from
# the DB (every open/resolved conflict on the same asset that shares
# the same activity set, contiguous days), renders the PDF via the
# `planner.conflict_resolution` system template, and either streams
# the file back or sends it as an email attachment.


async def _build_cluster_payload_from_anchor(
    db: AsyncSession,
    anchor_conflict_id: UUID,
    entity_id: UUID,
) -> dict:
    """Re-build the cluster (members + audit + calendar + activities)
    from an anchor conflict id. Mirrors the frontend's clusterConflicts
    helper but works server-side from the canonical DB state, so the
    PDF and email always reflect the truth even if the user had a stale
    table cached."""
    anchor = await db.get(PlannerConflict, anchor_conflict_id)
    if not anchor or anchor.entity_id != entity_id:
        raise StructuredHTTPException(
            404, code="CONFLICT_NOT_FOUND",
            message="Conflict not found or out of scope",
        )

    # Pull every conflict on the same asset, then group like the FE does.
    asset_conflicts_q = await db.execute(
        select(PlannerConflict).where(
            PlannerConflict.entity_id == entity_id,
            PlannerConflict.asset_id == anchor.asset_id,
            PlannerConflict.active == True,  # noqa: E712
        ).order_by(PlannerConflict.conflict_date.asc())
    )
    all_conflicts = asset_conflicts_q.scalars().all()

    # Junction → activity set per conflict.
    junction_q = await db.execute(
        select(PlannerConflictActivity).where(
            PlannerConflictActivity.conflict_id.in_([c.id for c in all_conflicts]),
        )
    )
    by_conflict_actset: dict[UUID, frozenset[UUID]] = {}
    for row in junction_q.scalars().all():
        s = by_conflict_actset.get(row.conflict_id, frozenset())
        by_conflict_actset[row.conflict_id] = s | {row.activity_id}

    anchor_set = by_conflict_actset.get(anchor.id, frozenset())

    # Walk left from anchor while consecutive AND same activity_set.
    by_id = {c.id: c for c in all_conflicts}
    sorted_dates = sorted(
        all_conflicts,
        key=lambda c: c.conflict_date,
    )
    pos = next((i for i, c in enumerate(sorted_dates) if c.id == anchor.id), -1)
    if pos < 0:
        raise StructuredHTTPException(500, code="ANCHOR_LOOKUP_FAILED", message="Anchor not in conflict list")

    members: list[PlannerConflict] = [anchor]
    # extend left
    i = pos - 1
    while i >= 0:
        prev = sorted_dates[i]
        if (sorted_dates[i + 1].conflict_date - prev.conflict_date).days != 1:
            break
        if by_conflict_actset.get(prev.id, frozenset()) != anchor_set:
            break
        members.insert(0, prev)
        i -= 1
    # extend right
    j = pos + 1
    while j < len(sorted_dates):
        nxt = sorted_dates[j]
        if (nxt.conflict_date - sorted_dates[j - 1].conflict_date).days != 1:
            break
        if by_conflict_actset.get(nxt.id, frozenset()) != anchor_set:
            break
        members.append(nxt)
        j += 1

    # Asset
    asset = await db.get(Installation, anchor.asset_id)

    # Activities
    activities_meta: list[dict] = []
    for aid in anchor_set:
        a = await db.get(PlannerActivity, aid)
        if not a:
            continue
        activities_meta.append({
            "id": str(a.id),
            "title": a.title,
            "type": a.type,
            "start_date": a.start_date.isoformat() if a.start_date else None,
            "end_date": a.end_date.isoformat() if a.end_date else None,
            "pax_quota": a.pax_quota,
            "status": a.status,
        })

    # Audit (from anchor's own audit row — frontend uses the primary)
    audit_q = await db.execute(
        select(PlannerConflictAudit).where(
            PlannerConflictAudit.conflict_id.in_([c.id for c in members]),
        ).order_by(PlannerConflictAudit.created_at.desc())
    )
    audit_entries: list[dict] = []
    for row in audit_q.scalars().all():
        actor_name = None
        if row.actor_id:
            actor = await db.get(User, row.actor_id)
            actor_name = (
                getattr(actor, "full_name", None)
                or (actor.email if actor else None)
            )
        # Render an explicit, human-readable decision sentence so the
        # PDF/email don't expose just "Replanifier" — the operator's
        # manager flagged that as ambiguous (rescheduled what? by how
        # much?). target_activity_id + action_payload were added in
        # migration 158 to capture exactly that.
        decision_sentence = _decision_sentence_fr(
            new_resolution=row.new_resolution,
            action_payload=row.action_payload,
        )
        audit_entries.append({
            "actor_name": actor_name,
            "created_at": row.created_at.strftime("%d/%m/%Y %H:%M") if row.created_at else "",
            "resolution_label": (
                _RESOLUTION_LABELS_FR.get(row.new_resolution or "", row.new_resolution or "") if row.new_resolution else None
            ),
            "action": row.action,
            "context": row.context,
            "old_status": row.old_status,
            "new_status": row.new_status,
            "resolution_note": row.resolution_note,
            "target_activity_id": str(row.target_activity_id) if row.target_activity_id else None,
            "action_payload": row.action_payload,
            "decision_sentence": decision_sentence,
        })

    # Members for the day list
    members_payload: list[dict] = []
    sum_overflow = 0
    max_overflow = 0
    for m in members:
        ov = int(m.overflow_amount or 0)
        sum_overflow += ov
        if ov > max_overflow:
            max_overflow = ov
        members_payload.append({
            "conflict_date": m.conflict_date.isoformat(),
            "overflow_amount": m.overflow_amount,
            "resolution_label": (
                _RESOLUTION_LABELS_FR.get(m.resolution or "", m.resolution) if m.resolution else None
            ),
            "status": m.status,
            "resolution_note": m.resolution_note,
        })

    # Calendar (Mon-Sun weeks framing the cluster).
    member_by_date = {m.conflict_date: m for m in members}

    def _start_of_iso_week(d: date) -> date:
        return d - timedelta(days=(d.weekday()))  # Monday=0

    def _iso_week(d: date) -> int:
        return d.isocalendar()[1]

    cal_start = _start_of_iso_week(members[0].conflict_date)
    cal_end_week_monday = _start_of_iso_week(members[-1].conflict_date)
    cal_end = cal_end_week_monday + timedelta(days=6)
    weeks_payload: list[dict] = []
    cur = cal_start
    while cur <= cal_end:
        days = []
        for i in range(7):
            d = cur + timedelta(days=i)
            mem = member_by_date.get(d)
            days.append({
                "date": d.isoformat(),
                "day": d.day,
                "in_cluster": mem is not None,
                "overflow": (mem.overflow_amount if mem else None),
                "status": (mem.status if mem else None),
                "resolution_label": (
                    _RESOLUTION_LABELS_FR.get(mem.resolution or "", mem.resolution)
                    if mem and mem.resolution else None
                ),
            })
        weeks_payload.append({
            "week": _iso_week(cur),
            "year": cur.year,
            "days": days,
        })
        cur += timedelta(days=7)

    # Cluster status rollup (same logic as the frontend).
    open_n = sum(1 for m in members if m.status == "open")
    resolved_n = sum(1 for m in members if m.status == "resolved")
    deferred_n = sum(1 for m in members if m.status == "deferred")
    if open_n == 0 and deferred_n == 0:
        status_label = "Résolu"
    elif open_n == 0 and deferred_n > 0:
        status_label = "Différé"
    elif resolved_n > 0 or deferred_n > 0:
        status_label = "Partiel"
    else:
        status_label = "Ouvert"

    return {
        "asset": asset,
        "asset_name": asset.name if asset else None,
        "asset_code": asset.code if asset else None,
        "asset_pob_capacity": asset.pob_capacity if asset else None,
        "window_start": members[0].conflict_date.isoformat(),
        "window_end": members[-1].conflict_date.isoformat(),
        "days": len(members),
        "max_overflow": max_overflow,
        "sum_overflow": sum_overflow,
        "status_label": status_label,
        "activities": activities_meta,
        "members": members_payload,
        "audit": audit_entries,
        "calendar": weeks_payload,
        "members_raw": members,
    }


_RESOLUTION_LABELS_FR = {
    "approve_both": "Approuver les deux",
    "reschedule": "Replanifier",
    "reduce_pax": "Réduire PAX",
    "cancel": "Annuler une activité",
    "deferred": "Reporter la décision",
}


def _format_iso_date_fr(s: str | None) -> str:
    """ISO date → 'JJ/MM/AAAA'. Tolerant of None and partial strings."""
    if not s:
        return "—"
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d.strftime("%d/%m/%Y")
    except Exception:
        return s[:10]


def _decision_sentence_fr(
    *, new_resolution: str | None, action_payload: dict | None,
) -> str | None:
    """Build a human-readable decision sentence for the audit log.

    Surfaces *what* was actually changed instead of just the resolution
    label. Examples:

        Replanifié l'activité « Workover P-12 » de +5 j
            (15/05/2026 → 20/05/2026 ⇒ 20/05/2026 → 25/05/2026)
        Quota PAX abaissé sur « Inspection turbine » : 38 → 22 PAX
        Activité « Maintenance tubing » annulée
        Nouvelle fenêtre pour « Workover P-12 » : 22/05/2026 → 27/05/2026
        Approuvée sans modification (les deux activités maintenues).
        Décision reportée — pas de modification de planning.

    Returns None when we have neither resolution nor action payload —
    the caller falls back to the resolution label or generic action.
    """
    if not new_resolution and not action_payload:
        return None

    payload = action_payload or {}
    action = payload.get("action")
    activity_title = payload.get("activity_title") or "—"
    before = payload.get("before") or {}
    after = payload.get("after") or {}

    if action == "shift":
        # Compute delta days from before → after for clarity.
        delta = None
        try:
            b = datetime.fromisoformat(str(before.get("start_date")).replace("Z", "+00:00"))
            a = datetime.fromisoformat(str(after.get("start_date")).replace("Z", "+00:00"))
            delta = (a - b).days
        except Exception:
            pass
        sign = "+" if (delta or 0) >= 0 else ""
        delta_part = f" de {sign}{delta} j" if delta is not None else ""
        return (
            f"Replanifié l'activité « {activity_title} »{delta_part} "
            f"({_format_iso_date_fr(before.get('start_date'))} → "
            f"{_format_iso_date_fr(before.get('end_date'))}"
            f" ⇒ {_format_iso_date_fr(after.get('start_date'))} → "
            f"{_format_iso_date_fr(after.get('end_date'))})"
        )

    if action == "set_window":
        return (
            f"Nouvelle fenêtre pour « {activity_title} » : "
            f"{_format_iso_date_fr(after.get('start_date'))} → "
            f"{_format_iso_date_fr(after.get('end_date'))} "
            f"(avant : {_format_iso_date_fr(before.get('start_date'))} → "
            f"{_format_iso_date_fr(before.get('end_date'))})"
        )

    if action == "set_quota":
        return (
            f"Quota PAX abaissé sur « {activity_title} » : "
            f"{before.get('pax_quota', '?')} → {after.get('pax_quota', '?')} PAX"
        )

    if action == "cancel":
        return f"Activité « {activity_title} » annulée"

    # No concrete action — pure decision.
    if new_resolution == "approve_both":
        return "Approuvée sans modification (les deux activités maintenues)."
    if new_resolution == "deferred":
        return "Décision reportée — pas de modification de planning."

    return None


class ConflictPdfExportRequest(BaseModel):
    conflict_id: UUID
    title: str | None = None


@router.post("/export/conflict-pdf")
async def export_conflict_pdf(
    payload: ConflictPdfExportRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.read"),
    db: AsyncSession = Depends(get_db),
):
    """Render a conflict cluster as A4 portrait PDF.

    The cluster is rebuilt server-side from any of its members'
    `conflict_id` (used as anchor). Uses the system PDF template
    `planner.conflict_resolution`.
    """
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity

    cluster_payload = await _build_cluster_payload_from_anchor(db, payload.conflict_id, entity_id)
    entity = await db.get(Entity, entity_id)
    generated_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    generated_by = getattr(current_user, "full_name", None) or current_user.email

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="planner.conflict_resolution",
            entity_id=entity_id,
            language="fr",
            variables={
                "title": payload.title or "Arbitrage de conflit Planner",
                "asset_name": cluster_payload["asset_name"],
                "asset_code": cluster_payload["asset_code"],
                "asset_pob_capacity": cluster_payload["asset_pob_capacity"],
                "window_start": cluster_payload["window_start"],
                "window_end": cluster_payload["window_end"],
                "days": cluster_payload["days"],
                "max_overflow": cluster_payload["max_overflow"],
                "sum_overflow": cluster_payload["sum_overflow"],
                "status_label": cluster_payload["status_label"],
                "activities": cluster_payload["activities"],
                "members": cluster_payload["members"],
                "audit": cluster_payload["audit"],
                "calendar": cluster_payload["calendar"],
                "entity": {"name": entity.name if entity else "", "code": getattr(entity, "code", "")},
                "generated_at": generated_at,
                "generated_by": generated_by,
            },
        )
    except Exception as e:
        logger.exception("Failed to render conflict PDF")
        raise StructuredHTTPException(
            500, code="PDF_GENERATION_FAILED",
            message="PDF generation failed: {e}",
            params={"e": str(e)},
        )

    if pdf_bytes is None:
        raise StructuredHTTPException(
            404, code="PDF_TEMPLATE_PLANNER_CONFLICT_NOT_FOUND",
            message="PDF template 'planner.conflict_resolution' not found. Run the seed_pdf_templates job.",
        )

    asset_part = (cluster_payload["asset_code"] or "asset").lower().replace("/", "-")
    win = cluster_payload["window_start"]
    filename = f"arbitrage-conflit-{asset_part}-{win}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ConflictEmailRequest(BaseModel):
    conflict_id: UUID
    recipients: list[str] = Field(..., min_length=1, max_length=20)
    cc: list[str] = Field(default_factory=list, max_length=20)
    subject: str | None = None
    body: str | None = None


@router.post("/conflicts/{conflict_id}/email")
async def email_conflict_cluster(
    conflict_id: UUID,
    payload: ConflictEmailRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.read"),
    db: AsyncSession = Depends(get_db),
):
    """Email the conflict cluster PDF to a list of recipients.

    Renders the same `planner.conflict_resolution` template used by the
    /export/conflict-pdf endpoint and ships it through the standard
    OpsFlux EmailService — same SMTP config, same logging, same
    audit trail as every other module's email.
    """
    if payload.conflict_id != conflict_id:
        raise StructuredHTTPException(
            400, code="CONFLICT_ID_MISMATCH",
            message="conflict_id in path differs from body",
        )
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity
    from app.core.notifications import send_email

    cluster_payload = await _build_cluster_payload_from_anchor(db, conflict_id, entity_id)
    entity = await db.get(Entity, entity_id)
    generated_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    generated_by = getattr(current_user, "full_name", None) or current_user.email

    pdf_bytes = await render_pdf(
        db, slug="planner.conflict_resolution", entity_id=entity_id, language="fr",
        variables={
            "title": payload.subject or "Arbitrage de conflit Planner",
            "asset_name": cluster_payload["asset_name"],
            "asset_code": cluster_payload["asset_code"],
            "asset_pob_capacity": cluster_payload["asset_pob_capacity"],
            "window_start": cluster_payload["window_start"],
            "window_end": cluster_payload["window_end"],
            "days": cluster_payload["days"],
            "max_overflow": cluster_payload["max_overflow"],
            "sum_overflow": cluster_payload["sum_overflow"],
            "status_label": cluster_payload["status_label"],
            "activities": cluster_payload["activities"],
            "members": cluster_payload["members"],
            "audit": cluster_payload["audit"],
            "calendar": cluster_payload["calendar"],
            "entity": {"name": entity.name if entity else "", "code": getattr(entity, "code", "")},
            "generated_at": generated_at,
            "generated_by": generated_by,
        },
    )
    if pdf_bytes is None:
        raise StructuredHTTPException(
            404, code="PDF_TEMPLATE_PLANNER_CONFLICT_NOT_FOUND",
            message="PDF template 'planner.conflict_resolution' not found.",
        )

    # Resolve the customisable email template — admins can override the
    # subject and body via the Email Templates admin UI for slug
    # `planner.conflict.arbitration`. Falls back to the seed template
    # when no override exists. Only used when the user didn't type their
    # own subject / body in the composer.
    from app.core.email_templates import render_email

    # Last applied resolution (if any) — surfaced in the template so the
    # default body actually carries the decision the operator just made.
    last_resolution_label = next(
        (m.get("resolution_label") for m in cluster_payload["members"]
         if m.get("resolution_label")),
        None,
    )
    last_resolution_note = next(
        (m.get("resolution_note") for m in cluster_payload["members"]
         if m.get("resolution_note")),
        None,
    )
    template_vars = {
        "asset_name": cluster_payload["asset_name"],
        "asset_code": cluster_payload["asset_code"],
        "window_start": cluster_payload["window_start"],
        "window_end": cluster_payload["window_end"],
        "days": cluster_payload["days"],
        "max_overflow": cluster_payload["max_overflow"],
        "status_label": cluster_payload["status_label"],
        "resolution_label": last_resolution_label,
        "resolution_note": last_resolution_note,
        "activities_titles": ", ".join(
            a["title"] for a in cluster_payload["activities"] if a.get("title")
        ),
        "actor_name": generated_by,
        "entity": {"name": entity.name if entity else "", "code": getattr(entity, "code", "")},
    }
    rendered = await render_email(
        db,
        slug="planner.conflict.arbitration",
        entity_id=entity_id,
        language="fr",
        variables=template_vars,
    )

    if rendered:
        default_subject, default_body_html = rendered
    else:
        # Defensive fallback — should never hit in practice because the
        # seed templates ship with the slug.
        default_subject = (
            f"[Planner] Arbitrage conflit {cluster_payload['asset_code'] or ''} "
            f"{cluster_payload['window_start']} → {cluster_payload['window_end']}"
        )
        default_body_html = (
            f"<p>Voici la synthèse de l'arbitrage du conflit POB sur "
            f"{cluster_payload['asset_name']}.</p>"
            f"<p>Le détail complet est joint en PDF.</p>"
        )

    subject = payload.subject or default_subject
    asset_part = (cluster_payload["asset_code"] or "asset").lower().replace("/", "-")
    filename = f"arbitrage-conflit-{asset_part}-{cluster_payload['window_start']}.pdf"

    # When the user typed their own message in the composer, it arrives
    # as HTML (RichTextField output). When they didn't, we use the
    # rendered template HTML. Either way we forward HTML to SMTP — no
    # more <pre>-wrapping plain text.
    body_html = payload.body or default_body_html

    # NOTE: do NOT pass user_id here. The user-id channel-pref gate in
    # send_email() is meant for AUTO notifications fired BY the system
    # AT a user — it checks whether THAT user has opted-in to receive
    # `category=planner / event_type=planner.conflict.email` mails.
    # For a MANUAL broadcast the current_user is the SENDER (the
    # arbitrator), not the recipient — gating on their prefs would
    # cause the broadcast to be silently dropped if the arbitrator
    # happened to disable Planner email notifications for themselves.
    # Bug observed in production: emails reported as "sent" but never
    # actually leaving the SMTP because of this check.
    try:
        await send_email(
            to=payload.recipients,
            cc=payload.cc or None,
            subject=subject,
            body_html=body_html,
            from_name=generated_by,
            attachments=[
                {"filename": filename, "content": pdf_bytes, "mime_type": "application/pdf"},
            ],
            # MANUAL broadcast — surface SMTP failures to the UI instead
            # of pretending success. Without this, send_email swallows
            # exceptions for the benefit of background notifications,
            # but here the user explicitly clicked Send and needs to
            # know if delivery actually happened.
            raise_on_failure=True,
        )
    except Exception as exc:
        logger.exception("Failed to send conflict arbitration email")
        raise StructuredHTTPException(
            500, code="EMAIL_SEND_FAILED",
            message="L'envoi de l'email a échoué : {error}",
            params={"error": str(exc)},
        )

    return {"sent": True, "recipients": payload.recipients, "cc": payload.cc, "subject": subject}


# ── Email recipient suggestions ─────────────────────────────────────────
#
# Pre-fills the email composer's "To" field with the people who actually
# care about the conflict — activity creators, project managers, project
# task assignees — plus the current user (the arbitrator) on Cc. Saves
# the user from typing addresses they already have in the system, while
# still letting them edit the chip list freely before sending.


class EmailRecipientSuggestion(BaseModel):
    email: str
    label: str | None = None
    source: str  # 'activity_creator' | 'project_manager' | 'task_assignee' | 'arbitrator' | 'resolver'
    context: str | None = None  # human-readable origin (e.g. activity title)


class ConflictEmailSuggestionsResponse(BaseModel):
    to: list[EmailRecipientSuggestion]
    cc: list[EmailRecipientSuggestion]


@router.get(
    "/conflicts/{conflict_id}/email-suggestions",
    response_model=ConflictEmailSuggestionsResponse,
)
async def get_conflict_email_suggestions(
    conflict_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.conflict.read"),
    db: AsyncSession = Depends(get_db),
):
    """Suggested recipients for the cluster's email arbitrage broadcast.

    Returns:
        - to:  activity creators + project managers + task assignees of
               every activity involved in the cluster, de-duplicated by
               email. Empty entries (no email on file) are dropped.
        - cc:  the current user (the arbitrator), plus any other actor
               who already touched this cluster's audit log — usually
               nobody on a fresh open conflict, but for already-resolved
               clusters this surfaces the original resolver so they can
               be looped in on the broadcast.

    The frontend treats this as a hint — the user can still edit, remove
    or add recipients freely in the EmailComposer chip input before
    sending.
    """
    # Reuse the cluster builder so we work from the canonical activity
    # set (junction-aware, contiguous days), not just the anchor row.
    cluster_payload = await _build_cluster_payload_from_anchor(
        db, conflict_id, entity_id,
    )

    # Gather every relevant user id by walking the activities in the
    # cluster. The activity meta already comes back from the cluster
    # builder; we additionally need to fetch the activity rows to read
    # `created_by`, `project_id` and `source_task_id` (these aren't on
    # the meta payload by design — keeps the cluster shape lean).
    activity_ids = [UUID(a["id"]) for a in cluster_payload["activities"]]
    activities_q = await db.execute(
        select(PlannerActivity).where(PlannerActivity.id.in_(activity_ids))
    )
    activities = activities_q.scalars().all()

    user_ids: set[UUID] = set()
    user_origin: dict[UUID, list[tuple[str, str]]] = {}
    # ↑ user_id → list of (source, context) — keeps the FIRST source we
    # see per user but accumulates contexts so the chip can show why
    # they were suggested.

    def _track(uid: UUID | None, source: str, context: str) -> None:
        if not uid:
            return
        user_ids.add(uid)
        user_origin.setdefault(uid, []).append((source, context))

    # Project + task lookups — bulk so we don't issue one query per
    # activity. Most clusters touch <5 activities so this is cheap.
    project_ids = {a.project_id for a in activities if a.project_id}
    task_ids = {a.source_task_id for a in activities if a.source_task_id}
    projects: dict[UUID, Project] = {}
    if project_ids:
        pj_q = await db.execute(select(Project).where(Project.id.in_(project_ids)))
        projects = {p.id: p for p in pj_q.scalars().all()}
    tasks: dict[UUID, ProjectTask] = {}
    if task_ids:
        tk_q = await db.execute(select(ProjectTask).where(ProjectTask.id.in_(task_ids)))
        tasks = {t.id: t for t in tk_q.scalars().all()}

    for a in activities:
        _track(a.created_by, "activity_creator", a.title or str(a.id))
        if a.project_id and (proj := projects.get(a.project_id)):
            _track(proj.manager_id, "project_manager", proj.name or proj.code or "Projet")
        if a.source_task_id and (task := tasks.get(a.source_task_id)):
            _track(task.assignee_id, "task_assignee", task.title or "Tâche")

    # Resolve all collected user ids in one go.
    users_by_id: dict[UUID, User] = {}
    if user_ids:
        usr_q = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in usr_q.scalars().all()}

    # Build the "to" list — de-duplicate by email, lowercased.
    seen_emails: set[str] = set()
    to_list: list[EmailRecipientSuggestion] = []
    for uid in user_ids:
        u = users_by_id.get(uid)
        if not u or not u.email:
            continue
        key = u.email.strip().lower()
        if not key or key in seen_emails:
            continue
        seen_emails.add(key)
        sources = user_origin.get(uid, [])
        # Pick the most specific source (priority: project_manager >
        # task_assignee > activity_creator) so the chip badge tells the
        # truth about why this person was added.
        source_priority = {"project_manager": 0, "task_assignee": 1, "activity_creator": 2}
        sources.sort(key=lambda s: source_priority.get(s[0], 99))
        first_source, first_context = sources[0]
        full_name = (
            getattr(u, "full_name", None)
            or f"{getattr(u, 'first_name', '') or ''} {getattr(u, 'last_name', '') or ''}".strip()
            or u.email
        )
        to_list.append(
            EmailRecipientSuggestion(
                email=u.email, label=full_name, source=first_source, context=first_context,
            )
        )

    # Build the "cc" list:
    # 1. Current user (arbitrator) — always, unless they're already in `to`.
    # 2. Any audit actor that isn't us and isn't already in `to` — surfaces
    #    the prior resolver on already-resolved clusters.
    cc_list: list[EmailRecipientSuggestion] = []
    seen_cc: set[str] = set(seen_emails)
    if current_user.email:
        me_key = current_user.email.strip().lower()
        if me_key and me_key not in seen_cc:
            me_name = (
                getattr(current_user, "full_name", None)
                or f"{getattr(current_user, 'first_name', '') or ''} {getattr(current_user, 'last_name', '') or ''}".strip()
                or current_user.email
            )
            cc_list.append(
                EmailRecipientSuggestion(
                    email=current_user.email, label=me_name, source="arbitrator",
                    context="Vous (arbitre)",
                )
            )
            seen_cc.add(me_key)

    # Past resolvers from audit — surfaces the original arbitrator on
    # already-resolved clusters so they're looped in on the broadcast.
    # We pull distinct actor_ids from non-auto audit rows attached to
    # any of the cluster's members.
    audit_q = await db.execute(
        select(PlannerConflictAudit.actor_id).where(
            PlannerConflictAudit.conflict_id.in_([m.id for m in cluster_payload["members_raw"]]),
            PlannerConflictAudit.actor_id.is_not(None),
            PlannerConflictAudit.context != "auto_cleared",
        ).distinct()
    )
    actor_ids = [r for r in audit_q.scalars().all() if r is not None]
    if actor_ids:
        actor_q = await db.execute(select(User).where(User.id.in_(actor_ids)))
        for u in actor_q.scalars().all():
            if not u.email:
                continue
            k = u.email.strip().lower()
            if not k or k in seen_cc:
                continue
            full_name = (
                getattr(u, "full_name", None)
                or f"{getattr(u, 'first_name', '') or ''} {getattr(u, 'last_name', '') or ''}".strip()
                or u.email
            )
            cc_list.append(
                EmailRecipientSuggestion(
                    email=u.email, label=full_name, source="resolver",
                    context="Arbitre précédent",
                )
            )
            seen_cc.add(k)

    return ConflictEmailSuggestionsResponse(to=to_list, cc=cc_list)


# ── Capacity Heatmap ─────────────────────────────────────────────────────


@router.get("/capacity-heatmap", response_model=CapacityHeatmapResponse)
async def get_heatmap(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    asset_id: UUID | None = None,
    scenario_id: UUID | None = Query(None, description="When set, applies scenario overlay to activity loads"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get capacity heatmap data — daily saturation percentage per asset.

    When scenario_id is provided, the capacity load is computed against
    the scenario's merged activity set (removed activities excluded,
    overrides applied, new activities included).

    Visibility scope: a user without `planner.activity.read_all` only
    has their own activities counted in the saturation aggregation.
    """
    from app.services.modules.planner_service import get_capacity_heatmap

    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    can_read_all = await has_user_permission(
        current_user, entity_id, "planner.activity.read_all", db
    )
    created_by_filter = None if can_read_all else acting_user_id

    asset_ids = [asset_id] if asset_id else None
    return {
        "days": await get_capacity_heatmap(
            db, entity_id, start_date, end_date,
            asset_ids=asset_ids,
            scenario_id=scenario_id,
            created_by_filter=created_by_filter,
        ),
        "config": await _get_capacity_heatmap_config(db, entity_id),
    }


# ── Calendar View ────────────────────────────────────────────────────────


@router.get("/calendar")
async def get_calendar(
    request: Request,
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

    Visibility scope: a user without `planner.activity.read_all` only
    sees activities they created — same rule as list_activities.
    """
    # Apply user-scoped visibility (mirrors list_activities).
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    can_read_all = await has_user_permission(
        current_user, entity_id, "planner.activity.read_all", db
    )

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
    if not can_read_all:
        query = query.where(PlannerActivity.created_by == acting_user_id)
    if asset_id:
        query = query.where(PlannerActivity.asset_id == asset_id)

    result = await db.execute(query.order_by(PlannerActivity.start_date))
    activities = result.scalars().all()

    # Fetch asset info for capacity (if asset_id specified) — tenant-scoped
    asset = None
    if asset_id:
        asset = await db.get(Installation, asset_id)
        if asset and asset.entity_id != entity_id:
            asset = None

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
        raise StructuredHTTPException(
            400,
            code="ONLY_MAINTENANCE_INSPECTION_INTEGRITY_ACTIVITIES_CAN",
            message="Only maintenance/inspection/integrity activities can have recurrence",
        )

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


# ── Scenario simulation (what-if) ────────────────────────────────────────


@router.post("/scenarios/simulate")
async def simulate(
    body: ScenarioRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Dry-run: compute projected daily loads and conflicts if the
    proposed activities were added alongside the current plan.

    Nothing is persisted — this is a pure read-only analysis.
    """
    from app.services.modules.planner_service import simulate_scenario

    proposed = [pa.model_dump() for pa in body.proposed_activities]
    return await simulate_scenario(
        db, entity_id, proposed, body.start_date, body.end_date,
    )


# ── Capacity forecast ────────────────────────────────────────────────────


@router.post("/forecast", response_model=ForecastResponse)
async def forecast(
    body: ForecastRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Project future capacity load from historical patterns.

    Uses a trailing 90-day weekday average overlaid with already-
    scheduled activities. Returns day-by-day projections and flags
    days where combined load exceeds 80% as "at risk".
    """
    from app.services.modules.planner_service import forecast_capacity

    return await forecast_capacity(
        db, entity_id, body.asset_id, body.horizon_days,
        activity_type=body.activity_type,
        project_id=body.project_id,
    )


# ==============================================================================
# SCENARIOS — persistent what-if simulation (CRUD + promote)
# ==============================================================================


async def _build_scenario_read(db: AsyncSession, scenario: PlannerScenario) -> dict:
    """Enrich a PlannerScenario row into a ScenarioRead dict."""
    creator = await db.get(User, scenario.created_by)
    promoter = await db.get(User, scenario.promoted_by) if scenario.promoted_by else None

    act_count_result = await db.execute(
        select(sqla_func.count()).select_from(PlannerScenarioActivity)
        .where(PlannerScenarioActivity.scenario_id == scenario.id)
    )
    act_count = act_count_result.scalar() or 0

    sim = scenario.last_simulation_result or {}

    return {
        **{c.key: getattr(scenario, c.key) for c in scenario.__table__.columns
           if c.key not in ("baseline_snapshot", "last_simulation_result", "deleted_at")},
        "created_by_name": f"{creator.first_name} {creator.last_name}" if creator else None,
        "promoted_by_name": f"{promoter.first_name} {promoter.last_name}" if promoter else None,
        "activity_count": act_count,
        "conflict_days": sim.get("conflict_days"),
        "worst_overflow": sim.get("worst_overflow"),
    }


async def _build_scenario_activity_read(db: AsyncSession, act: PlannerScenarioActivity) -> dict:
    """Enrich a PlannerScenarioActivity row."""
    d = {c.key: getattr(act, c.key) for c in act.__table__.columns}
    # Source activity title (for overrides)
    if act.source_activity_id:
        source = await db.get(PlannerActivity, act.source_activity_id)
        d["source_activity_title"] = source.title if source else None
    else:
        d["source_activity_title"] = None
    # Asset name
    if act.asset_id:
        asset = await db.get(Installation, act.asset_id)
        d["asset_name"] = asset.name if asset else None
    else:
        d["asset_name"] = None
    return d


@router.get("/scenarios", response_model=PaginatedResponse[ScenarioRead])
async def list_scenarios(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    search: str | None = None,
):
    """List all scenarios for the entity with pagination."""
    query = (
        select(PlannerScenario)
        .where(PlannerScenario.entity_id == entity_id, PlannerScenario.active == True)  # noqa: E712
    )
    if status:
        query = query.where(PlannerScenario.status == status)
    if search:
        query = query.where(PlannerScenario.title.ilike(f"%{search}%"))
    query = query.order_by(PlannerScenario.created_at.desc())

    total_result = await db.execute(select(sqla_func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    items = []
    for scenario in result.scalars().all():
        items.append(await _build_scenario_read(db, scenario))

    pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.get("/scenarios/reference", response_model=ScenarioDetailRead)
async def get_reference_scenario(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return the current reference scenario (the live plan).

    Returns 404 if no reference scenario exists yet — the frontend should
    redirect the user to the Scenarios tab to create one.
    """
    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.is_reference == True,  # noqa: E712
            PlannerScenario.active == True,          # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="NO_REFERENCE_SCENARIO_CONFIGURED",
            message="No reference scenario configured",
        )

    base = await _build_scenario_read(db, scenario)
    acts_result = await db.execute(
        select(PlannerScenarioActivity)
        .where(PlannerScenarioActivity.scenario_id == scenario.id)
        .order_by(PlannerScenarioActivity.created_at.asc())
    )
    proposed = [await _build_scenario_activity_read(db, act) for act in acts_result.scalars().all()]
    return {**base, "proposed_activities": proposed, "last_simulation_result": scenario.last_simulation_result, "baseline_snapshot": scenario.baseline_snapshot}


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetailRead)
async def get_scenario(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get scenario detail with proposed activities and simulation result."""
    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )

    base = await _build_scenario_read(db, scenario)

    acts_result = await db.execute(
        select(PlannerScenarioActivity)
        .where(PlannerScenarioActivity.scenario_id == scenario_id)
        .order_by(PlannerScenarioActivity.created_at.asc())
    )
    proposed = []
    for act in acts_result.scalars().all():
        proposed.append(await _build_scenario_activity_read(db, act))

    return {
        **base,
        "proposed_activities": proposed,
        "last_simulation_result": scenario.last_simulation_result,
        "baseline_snapshot": scenario.baseline_snapshot,
    }


@router.post("/scenarios", response_model=ScenarioRead, status_code=201)
async def create_scenario(
    body: ScenarioCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scenario — automatically seeded from all live activities.

    When a new scenario is created, ALL current PlannerActivity rows are
    copied as PlannerScenarioActivity entries (source_activity_id set).
    This gives the scenario a full picture of the current plan from day one.
    The user can then add new activities, modify existing ones, or mark some
    as removed — all within the simulation without touching the live plan.
    """
    from datetime import timezone as tz

    # Capture baseline snapshot
    live_acts_result = await db.execute(
        select(PlannerActivity).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,  # noqa: E712
        )
    )
    live_acts = live_acts_result.scalars().all()

    baseline = {
        "total_activities": len(live_acts),
        "captured_at": datetime.now(tz.utc).isoformat(),
    }

    scenario = PlannerScenario(
        entity_id=entity_id,
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        baseline_snapshot=baseline,
        baseline_snapshot_at=datetime.now(tz.utc),
    )
    db.add(scenario)
    await db.flush()

    # Auto-seed: create a ScenarioActivity pointing to every live activity.
    # No field overrides — source_activity_id links to the live record.
    for act in live_acts:
        db.add(PlannerScenarioActivity(
            scenario_id=scenario.id,
            source_activity_id=act.id,
            # No overrides — scenario inherits the live values
        ))

    # Also apply any explicitly provided proposed_activities (new/modified)
    if body.proposed_activities:
        for pa in body.proposed_activities:
            db.add(PlannerScenarioActivity(scenario_id=scenario.id, **pa.model_dump()))

    await db.commit()
    await db.refresh(scenario)
    return await _build_scenario_read(db, scenario)


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioRead)
async def update_scenario(
    scenario_id: UUID,
    body: ScenarioUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Update scenario metadata (title, description, status)."""
    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )
    if scenario.status == "promoted":
        raise StructuredHTTPException(
            400,
            code="CANNOT_MODIFY_PROMOTED_SCENARIO",
            message="Cannot modify a promoted scenario",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    await db.commit()
    await db.refresh(scenario)
    return await _build_scenario_read(db, scenario)


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a scenario."""
    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )
    scenario.active = False
    await db.commit()


# ── Scenario Activities ──


@router.post("/scenarios/{scenario_id}/activities", response_model=ScenarioActivityRead, status_code=201)
async def add_scenario_activity(
    scenario_id: UUID,
    body: ScenarioActivityCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Add a proposed activity to a scenario."""
    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )
    if scenario.status == "promoted":
        raise StructuredHTTPException(
            400,
            code="CANNOT_MODIFY_PROMOTED_SCENARIO",
            message="Cannot modify a promoted scenario",
        )

    act = PlannerScenarioActivity(scenario_id=scenario_id, **body.model_dump())
    db.add(act)
    await db.commit()
    await db.refresh(act)
    return await _build_scenario_activity_read(db, act)


@router.patch("/scenarios/{scenario_id}/activities/{activity_id}", response_model=ScenarioActivityRead)
async def update_scenario_activity(
    scenario_id: UUID,
    activity_id: UUID,
    body: ScenarioActivityUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Update a proposed activity in a scenario."""
    act_result = await db.execute(
        select(PlannerScenarioActivity).where(
            PlannerScenarioActivity.id == activity_id,
            PlannerScenarioActivity.scenario_id == scenario_id,
        )
    )
    act = act_result.scalar_one_or_none()
    if not act:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_ACTIVITY_NOT_FOUND",
            message="Scenario activity not found",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(act, field, value)
    await db.commit()
    await db.refresh(act)
    return await _build_scenario_activity_read(db, act)


@router.delete("/scenarios/{scenario_id}/activities/{activity_id}", status_code=204)
async def remove_scenario_activity(
    scenario_id: UUID,
    activity_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a proposed activity from a scenario."""
    act_result = await db.execute(
        select(PlannerScenarioActivity).where(
            PlannerScenarioActivity.id == activity_id,
            PlannerScenarioActivity.scenario_id == scenario_id,
        )
    )
    act = act_result.scalar_one_or_none()
    if not act:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_ACTIVITY_NOT_FOUND",
            message="Scenario activity not found",
        )
    await db.delete(act)
    await db.commit()


# ── Scenario Simulation + Promotion ──


@router.post("/scenarios/{scenario_id}/simulate")
async def simulate_scenario_persistent(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.capacity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Run simulation on a saved scenario and cache the result.

    Reads the scenario's proposed activities, builds a ScenarioRequest
    compatible payload, calls the existing simulate_scenario service,
    and saves the result in scenario.last_simulation_result.
    """
    from app.services.modules.planner_service import simulate_scenario

    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )

    acts_result = await db.execute(
        select(PlannerScenarioActivity)
        .where(
            PlannerScenarioActivity.scenario_id == scenario_id,
            PlannerScenarioActivity.is_removed == False,  # noqa: E712
        )
    )
    proposed = acts_result.scalars().all()

    if not proposed:
        raise StructuredHTTPException(
            400,
            code="SCENARIO_HAS_NO_PROPOSED_ACTIVITIES_SIMULATE",
            message="Scenario has no proposed activities to simulate",
        )

    # Build the payload for the existing simulate service
    from datetime import timezone as tz
    today = date.today()
    proposed_activities = []
    for pa in proposed:
        proposed_activities.append({
            "asset_id": str(pa.asset_id) if pa.asset_id else None,
            "pax_quota": pa.pax_quota or 0,
            "start_date": (pa.start_date or today).isoformat(),
            "end_date": (pa.end_date or today).isoformat(),
            "title": pa.title,
        })

    # Use earliest/latest dates as simulation window
    start_dates = [pa.start_date for pa in proposed if pa.start_date]
    end_dates = [pa.end_date for pa in proposed if pa.end_date]
    sim_start = min(start_dates) if start_dates else today
    sim_end = max(end_dates) if end_dates else today

    sim_result = await simulate_scenario(
        db, entity_id,
        proposed_activities=proposed_activities,
        start_date=sim_start,
        end_date=sim_end,
    )

    # Cache the result
    scenario.last_simulation_result = sim_result
    scenario.last_simulated_at = datetime.now(tz.utc)
    await db.commit()

    return sim_result


@router.post("/scenarios/{scenario_id}/promote", response_model=ScenarioPromoteResult)
async def promote_scenario(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    """Promote a scenario — convert proposed activities to live PlannerActivity rows.

    Requires planner.activity.create permission (typically arbiter/DO level).
    """
    from datetime import timezone as tz

    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.active == True,  # noqa: E712
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )
    if scenario.status == "promoted":
        raise StructuredHTTPException(
            400,
            code="SCENARIO_ALREADY_PROMOTED",
            message="Scenario already promoted",
        )
    if scenario.status == "archived":
        raise StructuredHTTPException(
            400,
            code="CANNOT_PROMOTE_ARCHIVED_SCENARIO",
            message="Cannot promote an archived scenario",
        )

    acts_result = await db.execute(
        select(PlannerScenarioActivity)
        .where(PlannerScenarioActivity.scenario_id == scenario_id)
    )
    proposed = acts_result.scalars().all()

    promoted_count = 0
    skipped_count = 0
    errors: list[str] = []
    created_activity_ids: list[str] = []

    # Capture pre-promotion state of every live activity that this scenario
    # will touch. Stored in baseline_snapshot so we can restore later.
    touched_source_ids = {pa.source_activity_id for pa in proposed if pa.source_activity_id}
    pre_promotion_state: dict = {"activities": [], "created_ids": []}
    if touched_source_ids:
        state_rows = (await db.execute(
            select(PlannerActivity).where(PlannerActivity.id.in_(touched_source_ids))
        )).scalars().all()
        for act in state_rows:
            pre_promotion_state["activities"].append({
                "id": str(act.id),
                "title": act.title,
                "asset_id": str(act.asset_id) if act.asset_id else None,
                "type": act.type,
                "priority": act.priority,
                "pax_quota": act.pax_quota,
                "start_date": act.start_date.isoformat() if act.start_date else None,
                "end_date": act.end_date.isoformat() if act.end_date else None,
                "status": act.status,
                "description": act.description,
            })

    for pa in proposed:
        if pa.is_removed:
            # Mark the source activity as cancelled if it exists
            if pa.source_activity_id:
                source = await db.get(PlannerActivity, pa.source_activity_id)
                if source and source.status not in ("cancelled", "completed"):
                    source.status = "cancelled"
                    promoted_count += 1
                else:
                    skipped_count += 1
            continue

        if pa.source_activity_id:
            # Override: PATCH the existing activity with non-null fields
            source = await db.get(PlannerActivity, pa.source_activity_id)
            if not source:
                errors.append(f"Source activity {pa.source_activity_id} not found")
                continue
            if pa.title is not None: source.title = pa.title
            if pa.asset_id is not None: source.asset_id = pa.asset_id
            if pa.type is not None: source.type = pa.type
            if pa.priority is not None: source.priority = pa.priority
            if pa.pax_quota is not None: source.pax_quota = pa.pax_quota
            if pa.start_date is not None: source.start_date = pa.start_date
            if pa.end_date is not None: source.end_date = pa.end_date
            promoted_count += 1
        else:
            # New activity: create a PlannerActivity from the proposal
            if not pa.title or not pa.asset_id or not pa.start_date or not pa.end_date:
                errors.append(f"Proposed activity missing required fields (title/asset/dates)")
                skipped_count += 1
                continue
            new_act = PlannerActivity(
                entity_id=entity_id,
                asset_id=pa.asset_id,
                title=pa.title,
                type=pa.type or "project",
                priority=pa.priority or "medium",
                pax_quota=pa.pax_quota or 0,
                start_date=pa.start_date,
                end_date=pa.end_date,
                status="draft",
                description=pa.notes,
                created_by=current_user.id,
            )
            db.add(new_act)
            await db.flush()
            created_activity_ids.append(str(new_act.id))
            promoted_count += 1

    pre_promotion_state["created_ids"] = created_activity_ids

    # Overwrite baseline_snapshot with pre-promotion state so `restore` can use it.
    scenario.baseline_snapshot = pre_promotion_state
    scenario.status = "promoted"
    scenario.promoted_by = current_user.id
    scenario.promoted_at = datetime.now(tz.utc)

    # ── Reference scenario promotion ─────────────────────────────────────────
    # Demote every currently-reference scenario for this entity, then mark
    # the newly promoted scenario as the reference plan.
    prev_refs_result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.entity_id == entity_id,
            PlannerScenario.is_reference == True,  # noqa: E712
            PlannerScenario.id != scenario_id,
        )
    )
    for prev in prev_refs_result.scalars().all():
        prev.is_reference = False
    scenario.is_reference = True

    await db.commit()

    return ScenarioPromoteResult(
        scenario_id=scenario_id,
        promoted_activity_count=promoted_count,
        skipped_count=skipped_count,
        errors=errors,
    )


@router.post("/scenarios/{scenario_id}/restore")
async def restore_scenario(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("planner.activity.create"),
    db: AsyncSession = Depends(get_db),
):
    """Restore the live plan to its state before this scenario was promoted.

    - Re-applies saved field values (status/dates/pax_quota/...) on each
      activity the scenario had modified.
    - Cancels every activity this scenario had created (since they didn't
      exist pre-promotion).
    - Marks the scenario as 'archived' so it cannot be restored twice.
    """
    from datetime import timezone as tz, date as _date

    result = await db.execute(
        select(PlannerScenario).where(
            PlannerScenario.id == scenario_id,
            PlannerScenario.entity_id == entity_id,
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise StructuredHTTPException(
            404,
            code="SCENARIO_NOT_FOUND",
            message="Scenario not found",
        )
    if scenario.status != "promoted":
        raise StructuredHTTPException(
            400,
            code="ONLY_PROMOTED_SCENARIO_CAN_RESTORED",
            message="Only a promoted scenario can be restored",
        )

    snapshot = scenario.baseline_snapshot or {}
    restored_count = 0
    cancelled_count = 0
    errors: list[str] = []

    # 1. Revert modified activities to their pre-promotion state
    for saved in (snapshot.get("activities") or []):
        try:
            act_id = UUID(saved["id"])
            act = await db.get(PlannerActivity, act_id)
            if not act:
                errors.append(f"Activity {act_id} not found")
                continue
            act.title = saved.get("title") or act.title
            act.asset_id = UUID(saved["asset_id"]) if saved.get("asset_id") else act.asset_id
            act.type = saved.get("type") or act.type
            act.priority = saved.get("priority") or act.priority
            act.pax_quota = saved.get("pax_quota") if saved.get("pax_quota") is not None else act.pax_quota
            if saved.get("start_date"):
                act.start_date = _date.fromisoformat(saved["start_date"])
            if saved.get("end_date"):
                act.end_date = _date.fromisoformat(saved["end_date"])
            act.status = saved.get("status") or act.status
            act.description = saved.get("description")
            restored_count += 1
        except Exception as exc:
            errors.append(f"Failed to restore {saved.get('id')}: {exc}")

    # 2. Cancel activities created by this scenario's promotion
    for created_id_str in (snapshot.get("created_ids") or []):
        try:
            created_id = UUID(created_id_str)
            act = await db.get(PlannerActivity, created_id)
            if act and act.status not in ("cancelled", "completed"):
                act.status = "cancelled"
                cancelled_count += 1
        except Exception as exc:
            errors.append(f"Failed to cancel {created_id_str}: {exc}")

    # 3. Mark scenario as archived (can't be restored twice)
    scenario.status = "archived"
    scenario.promoted_at = scenario.promoted_at  # keep history
    await db.commit()

    return {
        "scenario_id": str(scenario_id),
        "restored_activities": restored_count,
        "cancelled_created_activities": cancelled_count,
        "errors": errors,
    }


# ── POB par installation pour aujourd'hui ─────────────────────────────
# Renvoie pour chaque installation passée en argument (ou pour toutes
# les installations qui ont au moins une activité touchant aujourd'hui)
# le POB prévu (somme des pax_quota des activités en cours) et le POB
# réel (count des `ads_pax.current_onboard = TRUE` rattachés à un Ads
# qui touche l'asset aujourd'hui).
#
# Powers the per-row "POB prévu / réel" sub-line in the Activités
# table (Planner module).


@router.get("/asset-pob-today")
async def get_asset_pob_today(
    asset_ids: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("planner.activity.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return per-asset POB (planned + real) for today.

    Query param `asset_ids` is an optional comma-separated list of UUIDs
    to scope the lookup; when omitted we return stats for every asset
    that has at least one activity touching today.
    """
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()

    # Filter by the requested set of assets, if any.
    asset_id_list: list[UUID] = []
    if asset_ids:
        for raw in asset_ids.split(','):
            raw = raw.strip()
            if not raw:
                continue
            try:
                asset_id_list.append(UUID(raw))
            except ValueError:
                continue

    # POB prévu — sum of pax_quota of live activities at the asset.
    planned_q = (
        select(PlannerActivity.asset_id, sqla_func.coalesce(sqla_func.sum(PlannerActivity.pax_quota), 0))
        .where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,
            PlannerActivity.start_date <= today,
            PlannerActivity.end_date >= today,
            PlannerActivity.status.in_(['validated', 'in_progress', 'submitted']),
        )
        .group_by(PlannerActivity.asset_id)
    )
    if asset_id_list:
        planned_q = planned_q.where(PlannerActivity.asset_id.in_(asset_id_list))
    planned_rows = (await db.execute(planned_q)).all()
    planned_map: dict[UUID, int] = {row[0]: int(row[1] or 0) for row in planned_rows}

    # POB réel — count of currently onboard pax tied to ADS rows that
    # touch the asset today. We use raw SQL because ADS lives in paxlog
    # and we want to keep the query single-shot.
    real_sql = """
        SELECT a.site_entry_asset_id AS asset_id, COUNT(ap.id) AS pob
        FROM ads a
        JOIN ads_pax ap ON ap.ads_id = a.id
        WHERE a.entity_id = :entity_id
          AND ap.current_onboard = TRUE
          AND a.start_date <= :today
          AND a.end_date >= :today
    """
    params: dict[str, object] = {"entity_id": entity_id, "today": today}
    if asset_id_list:
        real_sql += " AND a.site_entry_asset_id = ANY(:asset_ids)"
        params["asset_ids"] = asset_id_list
    real_sql += " GROUP BY a.site_entry_asset_id"
    real_rows = (await db.execute(text(real_sql), params)).all()
    real_map: dict[UUID, int] = {row[0]: int(row[1] or 0) for row in real_rows}

    # Combine into a single response, keyed by asset id (string).
    keys: set[UUID] = set(planned_map.keys()) | set(real_map.keys())
    return {
        str(aid): {
            "planned": planned_map.get(aid, 0),
            "real": real_map.get(aid, 0),
        }
        for aid in keys
    }
