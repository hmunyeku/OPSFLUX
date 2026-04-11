"""Planner service layer — capacity management, conflict detection, impact preview,
recurrence generation, Gantt data, and inter-module integration endpoints.

This service implements the spec rules:
- Historized capacities (never UPDATE, always INSERT)
- Capacity = pob_capacity - permanent_ops - Σ(approved pax_quota)
- Hierarchy inheritance: effective limit = min(self, all parents)
- Conflict detection on submit
- Impact preview before modifying approved activities
- Priority floor per activity type
- daily_pax_load materialized view refresh
"""

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func as sqla_func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import Installation
from app.models.common import Project, User
from app.models.paxlog import Ads, AdsPax
from app.models.planner import (
    PlannerActivity,
    PlannerConflict,
    PlannerConflictActivity,
)

logger = logging.getLogger(__name__)


# ── Priority floors per activity type ──────────────────────────────────────

PRIORITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}
PRIORITY_FLOORS: dict[str, str] = {
    "drilling": "high",
    "workover": "high",
}
# Regulatory maintenance subtypes also have high floor
SUBTYPE_PRIORITY_FLOORS: dict[str, str] = {
    "regulatory": "high",
}

# Validation levels per activity type
VALIDATION_LEVELS: dict[str, list[str]] = {
    "project": ["CDS"],
    "maintenance": ["CDS"],  # corrective = DO fast-track
    "workover": ["CDS", "DPROD"],
    "drilling": ["CDS", "DPROD", "DO"],
    "integrity": ["CDS", "CHSE"],
    "inspection": ["CDS"],
    "event": ["CDS"],
    "permanent_ops": ["SITE_MGR"],
}

# Work order reference sequence prefix
WO_PREFIX = "ACT"

# Recurrence horizon — how far ahead the daily APScheduler job will
# create recurring activity instances. Default is 90 days but the
# admin can override at runtime via the entity-scoped setting
# `planner.recurrence_horizon_days` (read by `_get_recurrence_horizon_days`
# below). Extending this lets the capacity heatmap and forecast see
# further upcoming recurring load.
RECURRENCE_HORIZON_DAYS = 90
RECURRENCE_HORIZON_SETTING_KEY = "planner.recurrence_horizon_days"
RECURRENCE_HORIZON_MAX_DAYS = 365 * 2  # safety cap on the configured value


async def _get_recurrence_horizon_days(db: AsyncSession, entity_id: UUID | None) -> int:
    """Read the entity-scoped horizon override; fall back to the default.

    Settings are stored as JSONB in `settings.value`. We accept any
    castable form (int / float / numeric string / dict with a 'value' key)
    and clamp the result to a sane range so a typo can't blow up the
    daily APScheduler job.
    """
    if entity_id is None:
        return RECURRENCE_HORIZON_DAYS
    try:
        result = await db.execute(
            text(
                """
                SELECT value
                FROM settings
                WHERE key = :key
                  AND scope = 'entity'
                  AND scope_id = :sid
                LIMIT 1
                """
            ),
            {"key": RECURRENCE_HORIZON_SETTING_KEY, "sid": str(entity_id)},
        )
        row = result.first()
        if not row:
            return RECURRENCE_HORIZON_DAYS
        raw = row[0]
        if isinstance(raw, dict) and "value" in raw:
            raw = raw["value"]
        if raw is None:
            return RECURRENCE_HORIZON_DAYS
        try:
            n = int(float(raw))
        except (TypeError, ValueError):
            return RECURRENCE_HORIZON_DAYS
        if n <= 0:
            return RECURRENCE_HORIZON_DAYS
        return min(n, RECURRENCE_HORIZON_MAX_DAYS)
    except Exception:
        # Never let a settings lookup error break the cron job
        return RECURRENCE_HORIZON_DAYS


def validate_priority_floor(activity_type: str, subtype: str | None, priority: str) -> str:
    """Enforce minimum priority per activity type. Returns corrected priority."""
    floor = PRIORITY_FLOORS.get(activity_type)
    if not floor and subtype:
        floor = SUBTYPE_PRIORITY_FLOORS.get(subtype)
    if floor and PRIORITY_ORDER.get(priority, 0) < PRIORITY_ORDER.get(floor, 0):
        return floor
    return priority


async def generate_work_order_ref(db: AsyncSession, entity_id: UUID) -> str:
    """Generate sequential work order reference: ACT-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("ACT", db, entity_id=entity_id)


# ── Capacity management ────────────────────────────────────────────────────


async def get_current_capacity(
    db: AsyncSession, asset_id: UUID, at_date: date | None = None,
) -> dict | None:
    """Get the most recent capacity record for an asset as of a given date.

    Reads from asset_capacities (historized table — never UPDATE, always INSERT).
    Falls back to installation/site/field pob_capacity if no capacity record exists.
    """
    target = at_date or date.today()

    result = await db.execute(
        text(
            "SELECT id, max_pax_total, permanent_ops_quota, max_pax_per_company, "
            "effective_date, reason, changed_by "
            "FROM asset_capacities "
            "WHERE asset_id = :aid AND effective_date <= :dt "
            "ORDER BY effective_date DESC LIMIT 1"
        ),
        {"aid": str(asset_id), "dt": target},
    )
    row = result.first()
    if row:
        return {
            "id": row[0],
            "max_pax_total": row[1],
            "permanent_ops_quota": row[2],
            "max_pax_per_company": row[3] or {},
            "effective_date": row[4],
            "reason": row[5],
            "changed_by": row[6],
        }

    # Fallback hierarchy: Installation.pob_capacity → Site.pob_capacity → Field.pob_capacity → 0
    from app.models.asset_registry import OilField, OilSite

    asset = await db.get(Installation, asset_id)
    if not asset:
        return None

    pob = asset.pob_capacity
    source = "installation"

    # If not set on installation, try the parent site
    if pob is None and asset.site_id:
        site = await db.get(OilSite, asset.site_id)
        if site and site.pob_capacity is not None:
            pob = site.pob_capacity
            source = "site"
        # If not set on site, try the parent field
        if pob is None and site and site.field_id:
            field = await db.get(OilField, site.field_id)
            if field and field.pob_capacity is not None:
                pob = field.pob_capacity
                source = "champ"

    return {
        "id": None,
        "max_pax_total": pob or 0,
        "permanent_ops_quota": 0,
        "max_pax_per_company": {},
        "effective_date": None,
        "reason": f"Défaut {source} (pob)",
        "changed_by": None,
    }


async def get_effective_capacity(
    db: AsyncSession, asset_id: UUID, at_date: date | None = None,
) -> int:
    """Get effective capacity considering hierarchy inheritance.

    Rule: effective limit = min(own limit, all parent limits).
    """
    target = at_date or date.today()
    cap = await get_current_capacity(db, asset_id, target)
    own_max = cap["max_pax_total"] if cap else 0

    # Walk parent hierarchy
    asset = await db.get(Installation, asset_id)
    if not asset:
        return own_max

    # Installation hierarchy: Installation -> Site (via site_id)
    # Check site-level capacity if it exists
    effective = own_max
    if asset.site_id:
        from app.models.asset_registry import OilSite
        site = await db.get(OilSite, asset.site_id)
        if site:
            site_cap = await get_current_capacity(db, site.id, target)
            if site_cap:
                site_max = site_cap["max_pax_total"]
                if site_max > 0:
                    effective = min(effective, site_max)

    return effective


# Statuses that consume capacity. "submitted" is included by default
# so the heatmap and conflict detection account for pending requests —
# this gives managers visibility into worst-case load before validation.
# Callers that only want confirmed load can pass include_submitted=False.
_CAPACITY_STATUSES_CONFIRMED = ["validated", "in_progress"]
_CAPACITY_STATUSES_ALL = ["submitted", "validated", "in_progress"]


async def count_real_pob_for_asset_day(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
    target_date: date,
) -> int:
    """Count physically onboard pax for an asset on a given day."""
    result = await db.execute(
        select(sqla_func.count())
        .select_from(AdsPax)
        .join(Ads, Ads.id == AdsPax.ads_id)
        .where(
            Ads.entity_id == entity_id,
            Ads.site_entry_asset_id == asset_id,
            Ads.deleted_at.is_(None),
            AdsPax.current_onboard == True,  # noqa: E712
            Ads.start_date.isnot(None),
            Ads.end_date.isnot(None),
            Ads.start_date <= target_date,
            Ads.end_date >= target_date,
        )
    )
    return int(result.scalar() or 0)


async def compute_daily_load(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
    target_date: date,
    include_submitted: bool = True,
) -> dict:
    """Compute PAX load for a single asset on a single day.

    When ``include_submitted`` is True (default), submitted activities
    that haven't been validated yet still count toward capacity — this
    is a "reservation" mechanism so the arbitration dashboard reflects
    pending demand, not just confirmed allocations.
    """
    cap = await get_current_capacity(db, asset_id, target_date)
    total = cap["max_pax_total"] if cap else 0
    perm_ops = cap["permanent_ops_quota"] if cap else 0
    statuses = _CAPACITY_STATUSES_ALL if include_submitted else _CAPACITY_STATUSES_CONFIRMED

    # Sum pax_quota of activities in the relevant statuses overlapping the date
    # Supports both constant mode (pax_quota) and variable mode (pax_quota_daily)
    activities_result = await db.execute(
        select(
            PlannerActivity.pax_quota,
            PlannerActivity.pax_quota_mode,
            PlannerActivity.pax_quota_daily,
        ).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id == asset_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.status.in_(statuses),
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(target_date, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(target_date, datetime.min.time()),
        )
    )
    used_by_activities = 0
    day_key = target_date.isoformat()
    for row in activities_result.all():
        if row.pax_quota_mode == "variable" and isinstance(row.pax_quota_daily, dict):
            used_by_activities += int(row.pax_quota_daily.get(day_key, 0))
        else:
            used_by_activities += row.pax_quota or 0
    used = perm_ops + used_by_activities
    residual = total - used
    saturation = (used / total * 100) if total > 0 else 0.0

    return {
        "asset_id": asset_id,
        "date": target_date,
        "max_pax_total": total,
        "permanent_ops_quota": perm_ops,
        "used_by_activities": used_by_activities,
        "total_used": used,
        "residual": residual,
        "saturation_pct": round(saturation, 2),
    }


async def check_availability(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
    start_date: date,
    end_date: date,
    exclude_activity_id: UUID | None = None,
) -> dict:
    """Check availability for a date range on an asset.

    Returns availability per day plus summary. Used by PaxLog when creating AdS.
    """
    days = []
    current = start_date
    worst_residual = None
    total_max = 0

    while current <= end_date:
        load = await compute_daily_load(db, entity_id, asset_id, current)
        # If excluding an activity (e.g. modifying it), subtract its quota
        if exclude_activity_id:
            act = await db.get(PlannerActivity, exclude_activity_id)
            if act and act.status in ("validated", "in_progress"):
                act_start = act.start_date.date() if hasattr(act.start_date, "date") else act.start_date
                act_end = act.end_date.date() if hasattr(act.end_date, "date") else act.end_date
                if act_start and act_end and act_start <= current <= act_end:
                    load["used_by_activities"] -= act.pax_quota
                    load["total_used"] -= act.pax_quota
                    load["residual"] += act.pax_quota

        days.append(load)
        if worst_residual is None or load["residual"] < worst_residual:
            worst_residual = load["residual"]
        total_max = max(total_max, load["max_pax_total"])
        current += timedelta(days=1)

    return {
        "asset_id": asset_id,
        "start_date": start_date,
        "end_date": end_date,
        "worst_residual": worst_residual or 0,
        "max_capacity": total_max,
        "days": days,
    }


# ── Impact preview ──────────────────────────────────────────────────────────


async def get_impact_preview(
    db: AsyncSession,
    activity_id: UUID,
    entity_id: UUID,
    new_start: date | None = None,
    new_end: date | None = None,
    new_pax_quota: int | None = None,
    new_status: str | None = None,
) -> dict:
    """Preview the impact of modifying an approved activity.

    Returns count of affected AdS, manifests, and potential new conflicts.
    Used to populate the confirmation modal before applying changes.
    """
    activity = await db.get(PlannerActivity, activity_id)
    if not activity:
        return {"error": "Activity not found"}

    # Count linked AdS (via planner_activity_id)
    ads_count_result = await db.execute(
        text(
            "SELECT COUNT(*) FROM ads "
            "WHERE planner_activity_id = :aid AND status IN ('approved', 'in_progress')"
        ),
        {"aid": str(activity_id)},
    )
    ads_affected = ads_count_result.scalar() or 0

    # Count linked manifests (via AdS → manifest entries)
    manifest_count_result = await db.execute(
        text(
            "SELECT COUNT(DISTINCT pm.id) FROM pax_manifests pm "
            "JOIN pax_manifest_entries pme ON pme.manifest_id = pm.id "
            "JOIN ads_pax ap ON ap.id = pme.ads_pax_id "
            "JOIN ads a ON a.id = ap.ads_id "
            "WHERE a.planner_activity_id = :aid "
            "AND pm.status IN ('draft', 'pending_validation', 'validated')"
        ),
        {"aid": str(activity_id)},
    )
    manifests_affected = manifest_count_result.scalar() or 0

    # Check for new conflicts if dates/quota change
    potential_conflicts = 0
    if new_start or new_end or new_pax_quota:
        check_start = new_start or (activity.start_date.date() if activity.start_date else date.today())
        check_end = new_end or (activity.end_date.date() if activity.end_date else date.today())
        check_pax = new_pax_quota if new_pax_quota is not None else activity.pax_quota

        avail = await check_availability(
            db, entity_id, activity.asset_id,
            check_start, check_end,
            exclude_activity_id=activity_id,
        )
        for day in avail["days"]:
            if day["residual"] < check_pax:
                potential_conflicts += 1

    # Summary of changes
    changes = {}
    if new_start and activity.start_date:
        old_start = activity.start_date.date() if hasattr(activity.start_date, "date") else activity.start_date
        delta = (new_start - old_start).days
        changes["start_date"] = {"old": str(old_start), "new": str(new_start), "delta_days": delta}
    if new_end and activity.end_date:
        old_end = activity.end_date.date() if hasattr(activity.end_date, "date") else activity.end_date
        delta = (new_end - old_end).days
        changes["end_date"] = {"old": str(old_end), "new": str(new_end), "delta_days": delta}
    if new_pax_quota is not None and new_pax_quota != activity.pax_quota:
        changes["pax_quota"] = {"old": activity.pax_quota, "new": new_pax_quota}
    if new_status and new_status != activity.status:
        changes["status"] = {"old": activity.status, "new": new_status}

    return {
        "activity_id": str(activity_id),
        "activity_title": activity.title,
        "ads_affected": ads_affected,
        "manifests_affected": manifests_affected,
        "potential_conflict_days": potential_conflicts,
        "changes": changes,
    }


# ── Gantt data ──────────────────────────────────────────────────────────────


async def get_gantt_data(
    db: AsyncSession,
    entity_id: UUID,
    start_date: date,
    end_date: date,
    asset_ids: list[UUID] | None = None,
    types: list[str] | None = None,
    statuses: list[str] | None = None,
    show_permanent_ops: bool = True,
) -> dict:
    """Get activities grouped by asset for Gantt chart rendering.

    Returns:
    {
        "assets": [
            {
                "id": "...", "name": "...", "parent_id": "...",
                "capacity": {"max_pax": 80, "perm_ops": 12, "residual": ...},
                "activities": [...]
            }
        ],
        "dependencies": [...]
    }
    """
    query = (
        select(PlannerActivity)
        .where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc),
            PlannerActivity.end_date >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
        )
    )

    if not show_permanent_ops:
        query = query.where(PlannerActivity.type != "permanent_ops")
    if asset_ids:
        query = query.where(PlannerActivity.asset_id.in_(asset_ids))
    if types:
        query = query.where(PlannerActivity.type.in_(types))
    if statuses:
        query = query.where(PlannerActivity.status.in_(statuses))
    else:
        query = query.where(
            PlannerActivity.status.in_(["draft", "submitted", "validated", "in_progress"])
        )

    result = await db.execute(query.order_by(PlannerActivity.start_date))
    activities = result.scalars().all()

    # Batch-fetch linked project task progress for activities that reference
    # a source_task_id. This lets the Gantt bar show the task progress bar
    # without N+1 queries.
    from app.models.common import ProjectTask, Project
    linked_task_ids = {act.source_task_id for act in activities if getattr(act, "source_task_id", None)}
    task_progress_by_id: dict[UUID, int] = {}
    if linked_task_ids:
        task_rows = await db.execute(
            select(ProjectTask.id, ProjectTask.progress).where(
                ProjectTask.id.in_(linked_task_ids)
            )
        )
        for row in task_rows.all():
            task_progress_by_id[row[0]] = int(row[1] or 0)

    # ── WBS roll-up support ──────────────────────────────────────────
    # The progress of a parent activity = weighted average of its
    # children using the resolved weighting method. The chain is
    # documented in PlannerActivity.progress_weight_method.
    #
    # To compute this correctly we need every active activity in the
    # entity (parents may have children outside the date filter), plus
    # the linked Project methods (for the chain), plus the entity-level
    # admin default. All loaded in batched queries.

    # 1. Load every ACTIVE activity in the entity (no date/status filter)
    #    so the parent ↔ children graph is complete even when the gantt
    #    is filtered by a narrow time window.
    all_acts_result = await db.execute(
        select(PlannerActivity).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.deleted_at.is_(None),
        )
    )
    all_acts = list(all_acts_result.scalars().all())
    all_acts_by_id: dict[UUID, PlannerActivity] = {a.id: a for a in all_acts}
    children_by_parent: dict[UUID | None, list[PlannerActivity]] = {}
    for a in all_acts:
        children_by_parent.setdefault(a.parent_id, []).append(a)

    # 2. Linked Project methods (batched)
    project_method_by_id: dict[UUID, str | None] = {}
    distinct_project_ids = {a.project_id for a in all_acts if a.project_id}
    if distinct_project_ids:
        proj_rows = await db.execute(
            select(Project.id, Project.progress_weight_method).where(
                Project.id.in_(distinct_project_ids)
            )
        )
        for row in proj_rows.all():
            project_method_by_id[row[0]] = row[1]

    # 3. Entity-scoped Planner default
    planner_default_method = "equal"
    try:
        from sqlalchemy import text as _text
        setting_row = await db.execute(
            _text(
                """
                SELECT value FROM settings
                WHERE key = 'planner.default_progress_weight_method'
                  AND scope = 'entity' AND scope_id = :sid
                LIMIT 1
                """
            ),
            {"sid": str(entity_id)},
        )
        row = setting_row.first()
        if row:
            raw = row[0]
            if isinstance(raw, dict) and "value" in raw:
                raw = raw["value"]
            if isinstance(raw, str) and raw in ("equal", "effort", "duration", "manual"):
                planner_default_method = raw
    except Exception:
        pass

    def _resolve_method_for_activity(act) -> str:
        """Resolve the progress weighting method for one activity using
        the documented chain."""
        if act.progress_weight_method in ("equal", "effort", "duration", "manual"):
            return act.progress_weight_method
        if act.project_id:
            pm = project_method_by_id.get(act.project_id)
            if pm in ("equal", "effort", "duration", "manual"):
                return pm
        return planner_default_method

    def _activity_raw_weight(act, method: str) -> float:
        """Per-activity weight in the parent's weighted average. Same
        semantics as ProjectTask in projets.py:_task_raw_weight."""
        if method == "effort":
            # planner activities don't have estimated_hours, so we
            # approximate effort by pax_quota * duration_in_days
            # (a 10-pax activity for 5 days = 50 person-days of effort)
            if act.start_date and act.end_date:
                days = max(1, (act.end_date - act.start_date).days or 1)
            else:
                days = 1
            return float(int(act.pax_quota or 0) * days)
        if method == "duration":
            if act.start_date and act.end_date:
                return float(max((act.end_date - act.start_date).days, 0))
            return 0.0
        if method == "manual":
            return float(act.weight or 0)
        # 'equal'
        return 1.0

    def _weighted_avg(items: list[tuple[float, float]]) -> float:
        if not items:
            return 0.0
        total = sum(w for _, w in items)
        if total > 0:
            return sum(v * w for v, w in items) / total
        return sum(v for v, _ in items) / len(items)

    def _leaf_progress(act) -> int:
        """Existing leaf progress logic — linked project task → status →
        time-based fraction."""
        stid = getattr(act, "source_task_id", None)
        if stid and stid in task_progress_by_id:
            return task_progress_by_id[stid]
        if act.status == "completed":
            return 100
        if act.status in ("cancelled", "rejected", "draft", "submitted"):
            return 0
        if act.start_date and act.end_date:
            start_ts = act.start_date.timestamp()
            end_ts = act.end_date.timestamp()
            if end_ts > start_ts:
                now_ts = datetime.now(timezone.utc).timestamp()
                if now_ts <= start_ts:
                    return 0
                if now_ts >= end_ts:
                    return 100
                return int(round((now_ts - start_ts) / (end_ts - start_ts) * 100))
        return 0

    # Memoised recursive computation (DFS with cycle guard)
    progress_cache: dict[UUID, int] = {}
    in_progress_set: set[UUID] = set()

    def _compute_activity_progress(act) -> int:
        if act.id in progress_cache:
            return progress_cache[act.id]
        if act.id in in_progress_set:
            return 0  # cycle break
        in_progress_set.add(act.id)
        children = children_by_parent.get(act.id, [])
        if not children:
            value = _leaf_progress(act)
        else:
            method = _resolve_method_for_activity(act)
            child_items = [
                (float(_compute_activity_progress(c)), _activity_raw_weight(c, method))
                for c in children
            ]
            value = int(round(max(0.0, min(100.0, _weighted_avg(child_items)))))
        progress_cache[act.id] = value
        in_progress_set.discard(act.id)
        return value

    # Group by asset
    asset_map: dict[UUID | None, dict] = {}
    for act in activities:
        aid = act.asset_id
        if aid not in asset_map:
            asset = await db.get(Installation, aid) if aid else None
            cap = await get_current_capacity(db, aid) if aid else None
            asset_map[aid] = {
                "id": str(aid) if aid else None,
                "name": asset.name if asset else "Non affecté",
                "site_id": str(asset.site_id) if asset and asset.site_id else None,
                "capacity": {
                    "max_pax": cap["max_pax_total"] if cap else 0,
                    "permanent_ops_quota": cap["permanent_ops_quota"] if cap else 0,
                },
                "activities": [],
            }
        asset_map[aid]["activities"].append({
            "id": str(act.id),
            "title": act.title,
            "type": act.type,
            "subtype": act.subtype,
            "status": act.status,
            "priority": act.priority,
            "pax_quota": act.pax_quota,
            "pax_quota_mode": getattr(act, "pax_quota_mode", "constant") or "constant",
            "pax_quota_daily": getattr(act, "pax_quota_daily", None),
            "start_date": act.start_date.isoformat() if act.start_date else None,
            "end_date": act.end_date.isoformat() if act.end_date else None,
            "project_id": str(act.project_id) if act.project_id else None,
            "source_task_id": str(act.source_task_id) if getattr(act, "source_task_id", None) else None,
            "progress": _compute_activity_progress(act),
            "created_by": str(act.created_by),
            "well_reference": act.well_reference,
            "rig_name": act.rig_name,
            "work_order_ref": act.work_order_ref,
        })

    # ── Dependencies between visible activities ──
    activity_ids = [act.id for act in activities]
    dependencies_payload: list[dict] = []
    if activity_ids:
        from app.models.planner import PlannerActivityDependency
        deps_result = await db.execute(
            select(PlannerActivityDependency).where(
                PlannerActivityDependency.predecessor_id.in_(activity_ids),
                PlannerActivityDependency.successor_id.in_(activity_ids),
            )
        )
        for dep in deps_result.scalars().all():
            dependencies_payload.append({
                "id": str(dep.id),
                "predecessor_id": str(dep.predecessor_id),
                "successor_id": str(dep.successor_id),
                "dependency_type": dep.dependency_type,
                "lag_days": dep.lag_days,
            })

    return {
        "assets": list(asset_map.values()),
        "dependencies": dependencies_payload,
    }


# ── Capacity heatmap ──────────────────────────────────────────────────────


async def get_capacity_heatmap(
    db: AsyncSession,
    entity_id: UUID,
    start_date: date,
    end_date: date,
    asset_ids: list[UUID] | None = None,
) -> list[dict]:
    """Get capacity heatmap data — daily saturation per asset.

    Batched implementation: 4 SQL queries total (assets, capacity history,
    activities, real POB) instead of N×D×2. For 6 assets × 365 days the
    previous version issued ~4380 queries (~15 s on the VPS). This version
    issues 4 queries and aggregates in Python (~1.5 s).

    Returns a flat list of daily entries with forecast and real POB.
    """
    # ── 1. Assets in scope ───────────────────────────────────────────
    asset_query = select(Installation).where(
        Installation.entity_id == entity_id,
        Installation.archived == False,  # noqa: E712
    )
    if asset_ids:
        asset_query = asset_query.where(Installation.id.in_(asset_ids))

    assets_result = await db.execute(asset_query)
    assets = assets_result.scalars().all()
    if not assets:
        return []

    asset_ids_list = [a.id for a in assets]
    asset_by_id = {a.id: a for a in assets}

    # ── 2. Capacity history for ALL assets in one query ─────────────
    # Pull every asset_capacities row with effective_date <= end_date for
    # the relevant assets. We'll sort and walk per asset to derive the
    # active capacity for each day in the range.
    cap_rows_result = await db.execute(
        text(
            "SELECT asset_id, max_pax_total, permanent_ops_quota, effective_date "
            "FROM asset_capacities "
            "WHERE asset_id = ANY(:aids) AND effective_date <= :end_dt "
            "ORDER BY asset_id, effective_date ASC"
        ),
        {"aids": [str(a) for a in asset_ids_list], "end_dt": end_date},
    )
    # cap_history[asset_id] = sorted list of (effective_date, max_pax, perm_ops)
    cap_history: dict[UUID, list[tuple[date, int, int]]] = {}
    for row in cap_rows_result:
        aid = UUID(str(row[0])) if not isinstance(row[0], UUID) else row[0]
        cap_history.setdefault(aid, []).append((row[3], int(row[1] or 0), int(row[2] or 0)))

    # Pre-fetch fallback capacity from the asset registry hierarchy for assets
    # without any asset_capacities row. We need site/field pob_capacity too.
    from app.models.asset_registry import OilField, OilSite
    site_ids = {a.site_id for a in assets if a.site_id}
    field_ids: set[UUID] = set()
    sites_by_id: dict[UUID, OilSite] = {}
    if site_ids:
        sites_result = await db.execute(select(OilSite).where(OilSite.id.in_(site_ids)))
        for s in sites_result.scalars().all():
            sites_by_id[s.id] = s
            if s.field_id:
                field_ids.add(s.field_id)
    fields_by_id: dict[UUID, OilField] = {}
    if field_ids:
        fields_result = await db.execute(select(OilField).where(OilField.id.in_(field_ids)))
        for f in fields_result.scalars().all():
            fields_by_id[f.id] = f

    def fallback_capacity(asset: Installation) -> int:
        if asset.pob_capacity is not None:
            return asset.pob_capacity
        if asset.site_id and asset.site_id in sites_by_id:
            site = sites_by_id[asset.site_id]
            if site.pob_capacity is not None:
                return site.pob_capacity
            if site.field_id and site.field_id in fields_by_id:
                field = fields_by_id[site.field_id]
                if field.pob_capacity is not None:
                    return field.pob_capacity
        return 0

    def capacity_for_day(asset_id: UUID, day: date) -> tuple[int, int]:
        """Return (max_pax_total, permanent_ops_quota) effective on `day`."""
        history = cap_history.get(asset_id, [])
        # Walk in reverse to find the most recent effective_date <= day
        active_total: int | None = None
        active_perm: int | None = None
        for eff_date, mpt, perm in reversed(history):
            if eff_date <= day:
                active_total = mpt
                active_perm = perm
                break
        if active_total is None:
            asset = asset_by_id.get(asset_id)
            return (fallback_capacity(asset) if asset else 0, 0)
        return (active_total, active_perm or 0)

    # ── 3. All activities overlapping the range, in one query ──────
    activities_result = await db.execute(
        select(
            PlannerActivity.asset_id,
            PlannerActivity.start_date,
            PlannerActivity.end_date,
            PlannerActivity.pax_quota,
            PlannerActivity.pax_quota_mode,
            PlannerActivity.pax_quota_daily,
        ).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id.in_(asset_ids_list),
            PlannerActivity.active == True,  # noqa: E712
            PlannerActivity.status.in_(_CAPACITY_STATUSES_ALL),
            PlannerActivity.start_date.isnot(None),
            PlannerActivity.end_date.isnot(None),
            PlannerActivity.start_date <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc),
            PlannerActivity.end_date >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
        )
    )
    # forecast_by_asset_day[asset_id][YYYY-MM-DD] = sum_pax
    forecast_by_asset_day: dict[UUID, dict[str, int]] = {}
    for row in activities_result.all():
        aid = row.asset_id
        if aid is None:
            continue
        a_start_dt = row.start_date
        a_end_dt = row.end_date
        if a_start_dt is None or a_end_dt is None:
            continue
        a_start_d = a_start_dt.date() if hasattr(a_start_dt, "date") else a_start_dt
        a_end_d = a_end_dt.date() if hasattr(a_end_dt, "date") else a_end_dt
        # Clamp to the heatmap window
        from_d = max(a_start_d, start_date)
        to_d = min(a_end_d, end_date)
        if to_d < from_d:
            continue
        is_variable = row.pax_quota_mode == "variable" and isinstance(row.pax_quota_daily, dict)
        constant_q = int(row.pax_quota or 0)
        per_asset = forecast_by_asset_day.setdefault(aid, {})
        cur_d = from_d
        while cur_d <= to_d:
            day_key = cur_d.isoformat()
            if is_variable:
                v = int(row.pax_quota_daily.get(day_key, constant_q))
            else:
                v = constant_q
            per_asset[day_key] = per_asset.get(day_key, 0) + v
            cur_d += timedelta(days=1)

    # ── 4. Real POB (currently_onboard) in one query ────────────────
    pob_result = await db.execute(
        select(
            Ads.site_entry_asset_id,
            Ads.start_date,
            Ads.end_date,
            sqla_func.count(AdsPax.id).label("nb"),
        )
        .select_from(Ads)
        .join(AdsPax, AdsPax.ads_id == Ads.id)
        .where(
            Ads.entity_id == entity_id,
            Ads.site_entry_asset_id.in_(asset_ids_list),
            Ads.deleted_at.is_(None),
            AdsPax.current_onboard == True,  # noqa: E712
            Ads.start_date.isnot(None),
            Ads.end_date.isnot(None),
            Ads.start_date <= end_date,
            Ads.end_date >= start_date,
        )
        .group_by(Ads.id, Ads.site_entry_asset_id, Ads.start_date, Ads.end_date)
    )
    # real_pob_by_asset_day[asset_id][YYYY-MM-DD] = pax count
    real_pob_by_asset_day: dict[UUID, dict[str, int]] = {}
    for row in pob_result.all():
        aid = row.site_entry_asset_id
        if aid is None:
            continue
        from_d = max(row.start_date, start_date)
        to_d = min(row.end_date, end_date)
        if to_d < from_d:
            continue
        per_asset = real_pob_by_asset_day.setdefault(aid, {})
        cur_d = from_d
        while cur_d <= to_d:
            day_key = cur_d.isoformat()
            per_asset[day_key] = per_asset.get(day_key, 0) + int(row.nb or 0)
            cur_d += timedelta(days=1)

    # ── 5. Build the heatmap rows ───────────────────────────────────
    heatmap = []
    for asset in assets:
        aid = asset.id
        per_asset_forecast = forecast_by_asset_day.get(aid, {})
        per_asset_real = real_pob_by_asset_day.get(aid, {})
        cur_d = start_date
        while cur_d <= end_date:
            day_key = cur_d.isoformat()
            max_pax_total, permanent_ops_quota = capacity_for_day(aid, cur_d)
            used_by_activities = per_asset_forecast.get(day_key, 0)
            real_pob = per_asset_real.get(day_key, 0)
            total_used = permanent_ops_quota + used_by_activities
            residual = max_pax_total - total_used
            saturation = (total_used / max_pax_total * 100) if max_pax_total > 0 else 0.0
            heatmap.append({
                "asset_id": str(aid),
                "asset_name": asset.name,
                "date": day_key,
                "saturation_pct": round(saturation, 2),
                "forecast_pax": total_used,
                "real_pob": real_pob,
                "remaining_capacity": residual,
                "capacity_limit": max_pax_total,
            })
            cur_d += timedelta(days=1)

    return heatmap


# ── What-if scenario simulation ──────────────────────────────────────────


async def simulate_scenario(
    db: AsyncSession,
    entity_id: UUID,
    proposed_activities: list[dict],
    start_date: date,
    end_date: date,
) -> dict:
    """Dry-run scenario: compute projected daily load and conflicts
    assuming a set of proposed activities were added alongside the
    existing ones — without persisting anything.

    ``proposed_activities`` is a list of dicts with at least:
        asset_id, pax_quota, start_date, end_date, title (optional)

    Returns:
        daily_loads: [{asset_id, date, current_load, projected_load,
                       max_capacity, saturation_pct}]
        projected_conflicts: [{asset_id, date, overflow}]
        summary: {total_days, conflict_days, worst_overflow, worst_date}
    """
    # Gather all unique assets from proposals
    asset_ids: set[UUID] = set()
    for pa in proposed_activities:
        try:
            asset_ids.add(UUID(str(pa["asset_id"])))
        except (KeyError, ValueError):
            continue
    if not asset_ids:
        return {"daily_loads": [], "projected_conflicts": [], "summary": {}}

    # Pre-compute current loads per (asset, date)
    daily_loads: list[dict] = []
    projected_conflicts: list[dict] = []
    total_days = 0
    conflict_days = 0
    worst_overflow = 0
    worst_date: date | None = None

    for asset_id in asset_ids:
        current = start_date
        while current <= end_date:
            total_days += 1
            load = await compute_daily_load(db, entity_id, asset_id, current, include_submitted=True)
            current_used = load["total_used"]
            max_cap = load["max_pax_total"]

            # Add proposed pax for this asset+date
            proposed_extra = 0
            for pa in proposed_activities:
                try:
                    pa_asset = UUID(str(pa["asset_id"]))
                except (KeyError, ValueError):
                    continue
                if pa_asset != asset_id:
                    continue
                pa_start = pa.get("start_date")
                pa_end = pa.get("end_date")
                if pa_start is None or pa_end is None:
                    continue
                # Parse dates if strings
                if isinstance(pa_start, str):
                    pa_start = date.fromisoformat(pa_start[:10])
                if isinstance(pa_end, str):
                    pa_end = date.fromisoformat(pa_end[:10])
                if pa_start <= current <= pa_end:
                    proposed_extra += int(pa.get("pax_quota", 0) or 0)

            projected_used = current_used + proposed_extra
            projected_sat = (projected_used / max_cap * 100) if max_cap > 0 else 0.0
            overflow = projected_used - max_cap if max_cap > 0 and projected_used > max_cap else 0

            entry = {
                "asset_id": str(asset_id),
                "date": current.isoformat(),
                "current_load": current_used,
                "proposed_extra": proposed_extra,
                "projected_load": projected_used,
                "max_capacity": max_cap,
                "saturation_pct": round(projected_sat, 2),
                "overflow": overflow,
            }
            daily_loads.append(entry)

            if overflow > 0:
                conflict_days += 1
                projected_conflicts.append({
                    "asset_id": str(asset_id),
                    "date": current.isoformat(),
                    "overflow": overflow,
                })
                if overflow > worst_overflow:
                    worst_overflow = overflow
                    worst_date = current

            current += timedelta(days=1)

    return {
        "daily_loads": daily_loads,
        "projected_conflicts": projected_conflicts,
        "summary": {
            "total_days": total_days,
            "conflict_days": conflict_days,
            "worst_overflow": worst_overflow,
            "worst_date": worst_date.isoformat() if worst_date else None,
            "proposed_count": len(proposed_activities),
        },
    }


# ── Capacity forecast ────────────────────────────────────────────────────


async def forecast_capacity(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
    horizon_days: int = 90,
) -> dict:
    """Predict future capacity trends from historical activity patterns.

    Uses a simple trailing-average approach:
    1. Look back 90 days and compute average daily load per weekday
    2. Project forward ``horizon_days`` using the weekday pattern
    3. Overlay already-scheduled activities (submitted + validated + in_progress)
    4. Flag days where projected load > 80% capacity as "at risk"

    Returns:
        forecast: [{date, projected_load, scheduled_load, combined_load,
                     max_capacity, at_risk}]
        summary: {at_risk_days, avg_projected_load, peak_date, peak_load}
    """
    today = date.today()
    lookback_start = today - timedelta(days=90)
    cap = await get_current_capacity(db, asset_id, today)
    max_cap = cap["max_pax_total"] if cap else 0

    if max_cap <= 0:
        return {
            "forecast": [],
            "summary": {
                "at_risk_days": 0,
                "avg_projected_load": 0,
                "avg_real_pob": 0,
                "peak_date": None,
                "peak_load": 0,
                "max_capacity": 0,
                "horizon_days": horizon_days,
            },
        }

    # Compute historical daily loads (last 90 days)
    historical: dict[int, list[int]] = {i: [] for i in range(7)}  # weekday -> loads
    current = lookback_start
    while current < today:
        load = await compute_daily_load(db, entity_id, asset_id, current, include_submitted=False)
        historical[current.weekday()].append(load["total_used"])
        current += timedelta(days=1)

    # Compute weekday averages
    weekday_avg: dict[int, float] = {}
    for wd, loads in historical.items():
        weekday_avg[wd] = sum(loads) / len(loads) if loads else 0.0

    # Project forward
    forecast: list[dict] = []
    at_risk_days = 0
    total_combined = 0
    peak_load = 0
    peak_date: date | None = None

    current = today
    end = today + timedelta(days=horizon_days)
    while current <= end:
        projected = weekday_avg.get(current.weekday(), 0.0)
        # Scheduled load from already-planned activities
        scheduled_load = await compute_daily_load(db, entity_id, asset_id, current, include_submitted=True)
        scheduled = scheduled_load["total_used"]
        real_pob = await count_real_pob_for_asset_day(db, entity_id, asset_id, current)
        # Combined: max of projected trend and scheduled (don't double-count)
        combined = max(projected, float(scheduled))
        at_risk = combined > (max_cap * 0.8)
        if at_risk:
            at_risk_days += 1
        total_combined += combined
        if combined > peak_load:
            peak_load = combined
            peak_date = current

        forecast.append({
            "date": current.isoformat(),
            "projected_load": round(projected, 1),
            "scheduled_load": scheduled,
            "combined_load": round(combined, 1),
            "real_pob": real_pob,
            "max_capacity": max_cap,
            "at_risk": at_risk,
            "saturation_pct": round(combined / max_cap * 100, 2) if max_cap > 0 else 0,
        })
        current += timedelta(days=1)

    days_counted = len(forecast) or 1
    return {
        "forecast": forecast,
        "summary": {
            "at_risk_days": at_risk_days,
            "avg_projected_load": round(total_combined / days_counted, 1),
            "avg_real_pob": round(sum(day["real_pob"] for day in forecast) / days_counted, 1),
            "peak_date": peak_date.isoformat() if peak_date else None,
            "peak_load": round(peak_load, 1),
            "max_capacity": max_cap,
            "horizon_days": horizon_days,
        },
    }


# ── Materialized view refresh ──────────────────────────────────────────────


async def refresh_daily_pax_load(db: AsyncSession) -> None:
    """Refresh the daily_pax_load materialized view.

    Called periodically (every 5 min) by APScheduler and after
    activity status changes.
    """
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY daily_pax_load"))
        await db.commit()
        logger.info("daily_pax_load materialized view refreshed")
    except Exception:
        logger.warning("Could not refresh daily_pax_load (may not exist yet)")


# ── Recurrence ──────────────────────────────────────────────────────────────


async def generate_recurring_activities(db: AsyncSession, entity_id: UUID) -> int:
    """Generate upcoming activity instances from recurrence rules.

    Called daily by APScheduler. Creates activities for the next N days
    based on each rule's frequency/interval.
    """
    generated = 0
    try:
        rules_result = await db.execute(
            text(
                "SELECT r.id, r.activity_id, r.frequency, r.interval_value, "
                "r.day_of_week, r.day_of_month, r.end_date, r.last_generated_at "
                "FROM activity_recurrence_rules r "
                "WHERE r.active = TRUE"
            )
        )
        rules = rules_result.all()

        for rule in rules:
            rule_id, activity_id, freq, interval_val, dow, dom, end_dt, last_gen = rule
            template = await db.get(PlannerActivity, activity_id)
            if not template or template.entity_id != entity_id:
                continue

            # Determine next occurrence date
            last = last_gen.date() if last_gen else (template.start_date.date() if template.start_date else date.today())
            next_date = _compute_next_occurrence(last, freq, interval_val, dow, dom)

            if end_dt and next_date > end_dt:
                continue

            # Generate within the configurable horizon (default 90 days,
            # overridable via the `planner.recurrence_horizon_days` admin
            # setting). This aligns with the heatmap's extended range so
            # recurring activities appear on the capacity forecast before
            # managers notice a gap.
            horizon_days = await _get_recurrence_horizon_days(db, entity_id)
            horizon = date.today() + timedelta(days=horizon_days)
            if next_date > horizon:
                continue

            # Calculate duration from template
            duration = timedelta(days=1)
            if template.start_date and template.end_date:
                duration = template.end_date - template.start_date

            # Create new activity
            new_act = PlannerActivity(
                entity_id=template.entity_id,
                asset_id=template.asset_id,
                project_id=template.project_id,
                type=template.type,
                subtype=template.subtype,
                title=template.title,
                description=template.description,
                status="draft",
                priority=template.priority,
                pax_quota=template.pax_quota,
                start_date=datetime.combine(next_date, datetime.min.time()),
                end_date=datetime.combine(next_date, datetime.min.time()) + duration,
                created_by=template.created_by,
            )
            db.add(new_act)

            # Update last_generated_at
            await db.execute(
                text(
                    "UPDATE activity_recurrence_rules SET last_generated_at = NOW() "
                    "WHERE id = :rid"
                ),
                {"rid": str(rule_id)},
            )
            generated += 1

        await db.commit()
    except Exception as e:
        logger.error("Error generating recurring activities: %s", e)

    return generated


def _compute_next_occurrence(
    after: date, frequency: str, interval: int,
    day_of_week: int | None, day_of_month: int | None,
) -> date:
    """Compute the next occurrence date after the given date."""
    if frequency == "daily":
        return after + timedelta(days=interval)
    elif frequency == "weekly":
        next_d = after + timedelta(weeks=interval)
        if day_of_week is not None:
            # Adjust to the specified day of week (0=Monday)
            days_ahead = day_of_week - next_d.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            next_d = next_d + timedelta(days=days_ahead)
        return next_d
    elif frequency == "monthly":
        month = after.month + interval
        year = after.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(day_of_month or after.day, 28)  # Safe for all months
        return date(year, month, day)
    elif frequency == "quarterly":
        return _compute_next_occurrence(after, "monthly", 3 * interval, day_of_week, day_of_month)
    elif frequency == "annually":
        return date(after.year + interval, after.month, after.day)
    else:
        return after + timedelta(days=interval)
