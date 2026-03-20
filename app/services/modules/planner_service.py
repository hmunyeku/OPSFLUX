"""Planner service layer — capacity management, conflict detection, impact preview,
recurrence generation, Gantt data, and inter-module integration endpoints.

This service implements the spec rules:
- Historized capacities (never UPDATE, always INSERT)
- Capacity = max_pax - permanent_ops - Σ(approved pax_quota)
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

from app.models.common import Asset, Project, User
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
    Falls back to asset.max_pax / permanent_ops_quota if no capacity record exists.
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

    # Fallback: read from asset itself
    asset = await db.get(Asset, asset_id)
    if not asset:
        return None
    return {
        "id": None,
        "max_pax_total": asset.max_pax or 0,
        "permanent_ops_quota": asset.permanent_ops_quota or 0,
        "max_pax_per_company": {},
        "effective_date": None,
        "reason": "Asset default",
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
    asset = await db.get(Asset, asset_id)
    if not asset:
        return own_max

    current = asset
    effective = own_max
    while current and current.parent_id:
        parent = await db.get(Asset, current.parent_id)
        if parent:
            parent_cap = await get_current_capacity(db, parent.id, target)
            parent_max = parent_cap["max_pax_total"] if parent_cap else (parent.max_pax or 0)
            if parent_max > 0:
                effective = min(effective, parent_max)
        current = parent

    return effective


async def compute_daily_load(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
    target_date: date,
) -> dict:
    """Compute PAX load for a single asset on a single day."""
    cap = await get_current_capacity(db, asset_id, target_date)
    total = cap["max_pax_total"] if cap else 0
    perm_ops = cap["permanent_ops_quota"] if cap else 0

    # Sum pax_quota of approved/in_progress/submitted activities overlapping the date
    result = await db.execute(
        select(
            sqla_func.coalesce(sqla_func.sum(PlannerActivity.pax_quota), 0),
        ).where(
            PlannerActivity.entity_id == entity_id,
            PlannerActivity.asset_id == asset_id,
            PlannerActivity.active == True,  # noqa: E712
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
            PlannerActivity.start_date <= datetime.combine(end_date, datetime.max.time()),
            PlannerActivity.end_date >= datetime.combine(start_date, datetime.min.time()),
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

    # Group by asset
    asset_map: dict[UUID, dict] = {}
    for act in activities:
        if act.asset_id not in asset_map:
            asset = await db.get(Asset, act.asset_id)
            cap = await get_current_capacity(db, act.asset_id)
            asset_map[act.asset_id] = {
                "id": str(act.asset_id),
                "name": asset.name if asset else "Unknown",
                "parent_id": str(asset.parent_id) if asset and asset.parent_id else None,
                "capacity": {
                    "max_pax": cap["max_pax_total"] if cap else 0,
                    "permanent_ops_quota": cap["permanent_ops_quota"] if cap else 0,
                },
                "activities": [],
            }
        asset_map[act.asset_id]["activities"].append({
            "id": str(act.id),
            "title": act.title,
            "type": act.type,
            "subtype": act.subtype,
            "status": act.status,
            "priority": act.priority,
            "pax_quota": act.pax_quota,
            "start_date": act.start_date.isoformat() if act.start_date else None,
            "end_date": act.end_date.isoformat() if act.end_date else None,
            "project_id": str(act.project_id) if act.project_id else None,
            "created_by": str(act.created_by),
            "well_reference": act.well_reference,
            "rig_name": act.rig_name,
            "work_order_ref": act.work_order_ref,
        })

    return {
        "assets": list(asset_map.values()),
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

    Returns a flat list of {asset_id, asset_name, date, saturation_pct, residual}.
    """
    # Get relevant assets
    asset_query = select(Asset).where(
        Asset.entity_id == entity_id,
        Asset.active == True,  # noqa: E712
    )
    if asset_ids:
        asset_query = asset_query.where(Asset.id.in_(asset_ids))
    else:
        # Only assets with max_pax > 0 (sites)
        asset_query = asset_query.where(Asset.max_pax > 0)

    assets_result = await db.execute(asset_query)
    assets = assets_result.scalars().all()

    heatmap = []
    for asset in assets:
        current = start_date
        while current <= end_date:
            load = await compute_daily_load(db, entity_id, asset.id, current)
            heatmap.append({
                "asset_id": str(asset.id),
                "asset_name": asset.name,
                "date": current.isoformat(),
                "saturation_pct": load["saturation_pct"],
                "residual": load["residual"],
                "total_used": load["total_used"],
                "max_pax": load["max_pax_total"],
            })
            current += timedelta(days=1)

    return heatmap


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

            # Only generate within the next 30 days
            horizon = date.today() + timedelta(days=30)
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
