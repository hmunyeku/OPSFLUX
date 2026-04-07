"""Concrete widget data providers — each returns data for a specific widget type.

Every provider is an async callable with the signature:

    async def provider_xxx(*, config, tenant_id, entity_id, user, db) -> dict | list

The returned dict MUST match the widget type convention:
  - KPI   -> {"value": ..., "label": ..., "trend": ..., "unit": ...}
  - table -> {"columns": [...], "rows": [...]}
  - chart -> {"data": [...], "series": [...]}
  - map   -> {"markers": [...]}

All queries are scoped by entity_id and use raw SQL via text().
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  KPI Providers
# ═══════════════════════════════════════════════════════════════════════════════

async def provider_pax_on_site(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Count PAX currently on site(s).  Queries ads_pax WHERE current_onboard=TRUE."""
    result = await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM ads_pax ap
        JOIN ads a ON a.id = ap.ads_id
        WHERE a.entity_id = :entity_id
          AND ap.current_onboard = TRUE
          AND a.deleted_at IS NULL
    """), {"entity_id": str(entity_id)})
    row = result.mappings().first()
    count = row["cnt"] if row else 0

    return {
        "value": count,
        "label": "PAX sur site",
        "trend": None,
        "unit": "personnes",
    }


async def provider_ads_pending(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Count AdS pending validation.  Returns KPI-style payload."""
    result = await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM ads
        WHERE entity_id = :entity_id
          AND status IN ('submitted', 'pending_compliance', 'pending_validation',
                         'pending_initiator_review', 'pending_project_review',
                         'pending_arbitration')
          AND archived = FALSE
    """), {"entity_id": str(entity_id)})
    row = result.mappings().first()
    count = row["cnt"] if row else 0

    return {
        "value": count,
        "label": "AdS en attente",
        "trend": None,
        "unit": "demandes",
    }


async def provider_alerts_urgent(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get unread high-priority notifications for the current user."""
    result = await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM notifications
        WHERE entity_id = :entity_id
          AND user_id = :user_id
          AND read = FALSE
          AND category IN ('alert', 'urgent', 'critical', 'conflict', 'incident')
    """), {"entity_id": str(entity_id), "user_id": str(user.id)})
    row = result.mappings().first()
    count = row["cnt"] if row else 0

    return {
        "value": count,
        "label": "Alertes urgentes",
        "trend": None,
        "unit": "non lues",
    }


async def provider_pickup_progress(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get active pickup rounds progress — completed / total."""
    result = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) AS total
        FROM pickup_rounds
        WHERE entity_id = :entity_id
          AND active = TRUE
          AND scheduled_departure::date = CURRENT_DATE
    """), {"entity_id": str(entity_id)})
    row = result.mappings().first()
    completed = row["completed"] if row else 0
    total = row["total"] if row else 0

    return {
        "value": completed,
        "label": "Ramassages terminés",
        "trend": None,
        "unit": f"/ {total} prévus",
    }


async def provider_kpi_fleet(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get fleet KPIs — active vectors, on-time %, etc."""
    result = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE active = TRUE) AS active_vectors,
            COUNT(*) AS total_vectors
        FROM transport_vectors
        WHERE entity_id = :entity_id
          AND archived = FALSE
    """), {"entity_id": str(entity_id)})
    row = result.mappings().first()
    active = row["active_vectors"] if row else 0
    total = row["total_vectors"] if row else 0

    # On-time percentage from recent voyages (last 30 days)
    ot_result = await db.execute(text("""
        SELECT
            COUNT(*) AS total_voyages,
            COUNT(*) FILTER (
                WHERE actual_arrival IS NOT NULL
                  AND actual_arrival <= scheduled_arrival + INTERVAL '15 minutes'
            ) AS on_time
        FROM voyages
        WHERE entity_id = :entity_id
          AND status IN ('arrived', 'closed')
          AND scheduled_departure >= NOW() - INTERVAL '30 days'
          AND archived = FALSE
    """), {"entity_id": str(entity_id)})
    ot_row = ot_result.mappings().first()
    total_voyages = ot_row["total_voyages"] if ot_row else 0
    on_time = ot_row["on_time"] if ot_row else 0
    on_time_pct = round((on_time / total_voyages * 100), 1) if total_voyages > 0 else 0

    return {
        "value": active,
        "label": "Vecteurs actifs",
        "trend": None,
        "unit": f"/ {total} — {on_time_pct}% ponctualité",
    }


async def provider_weather_sites(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get latest weather for operational sites.

    Weather data is typically stored externally or cached; here we return
    a placeholder structure that the frontend can fill via its own API calls.
    """
    result = await db.execute(text("""
        SELECT id, code, name, latitude, longitude
        FROM ar_installations
        WHERE entity_id = :entity_id
          AND type IN ('site', 'platform', 'base')
          AND archived = FALSE
        ORDER BY name
        LIMIT 20
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "value": len(rows),
        "label": "Sites opérationnels",
        "trend": None,
        "sites": [
            {
                "id": str(r["id"]),
                "code": r["code"],
                "name": r["name"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "weather": None,  # populated by frontend weather API call
            }
            for r in rows
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Table Providers
# ═══════════════════════════════════════════════════════════════════════════════

async def provider_trips_today(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get trips departing or arriving today."""
    result = await db.execute(text("""
        SELECT
            v.id,
            v.code,
            v.status,
            tv.name AS vector_name,
            tv.type AS vector_type,
            dep.name AS departure_base,
            v.scheduled_departure,
            v.scheduled_arrival,
            v.actual_departure,
            v.actual_arrival
        FROM voyages v
        JOIN transport_vectors tv ON tv.id = v.vector_id
        JOIN ar_installations dep ON dep.id = v.departure_base_id
        WHERE v.entity_id = :entity_id
          AND v.archived = FALSE
          AND (
              v.scheduled_departure::date = CURRENT_DATE
              OR v.scheduled_arrival::date = CURRENT_DATE
          )
        ORDER BY v.scheduled_departure
        LIMIT 50
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "code", "label": "Voyage"},
            {"key": "vector_name", "label": "Vecteur"},
            {"key": "vector_type", "label": "Type"},
            {"key": "departure_base", "label": "Départ"},
            {"key": "status", "label": "Statut"},
            {"key": "scheduled_departure", "label": "Départ prévu"},
            {"key": "scheduled_arrival", "label": "Arrivée prévue"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "code": r["code"],
                "vector_name": r["vector_name"],
                "vector_type": r["vector_type"],
                "departure_base": r["departure_base"],
                "status": r["status"],
                "scheduled_departure": r["scheduled_departure"].isoformat() if r["scheduled_departure"] else None,
                "scheduled_arrival": r["scheduled_arrival"].isoformat() if r["scheduled_arrival"] else None,
                "actual_departure": r["actual_departure"].isoformat() if r["actual_departure"] else None,
                "actual_arrival": r["actual_arrival"].isoformat() if r["actual_arrival"] else None,
            }
            for r in rows
        ],
    }


async def provider_cargo_pending(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get cargo items in status 'registered' or 'ready_for_loading'."""
    result = await db.execute(text("""
        SELECT
            c.id,
            c.tracking_code,
            c.description,
            c.cargo_type,
            c.weight_kg,
            c.status,
            dest.name AS destination,
            c.created_at
        FROM cargo_items c
        LEFT JOIN ar_installations dest ON dest.id = c.destination_asset_id
        WHERE c.entity_id = :entity_id
          AND c.status IN ('registered', 'ready')
          AND c.archived = FALSE
        ORDER BY c.created_at DESC
        LIMIT 50
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "tracking_code", "label": "Tracking"},
            {"key": "description", "label": "Description"},
            {"key": "cargo_type", "label": "Type"},
            {"key": "weight_kg", "label": "Poids (kg)"},
            {"key": "destination", "label": "Destination"},
            {"key": "status", "label": "Statut"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "tracking_code": r["tracking_code"],
                "description": r["description"],
                "cargo_type": r["cargo_type"],
                "weight_kg": float(r["weight_kg"]) if r["weight_kg"] else 0,
                "destination": r["destination"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }


async def provider_compliance_expiry(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get credentials expiring in next 30 days."""
    days_ahead = config.get("days_ahead", 30)
    result = await db.execute(text("""
        SELECT
            pc.id,
            COALESCE(
                u.first_name || ' ' || u.last_name,
                tc.first_name || ' ' || tc.last_name
            ) AS pax_name,
            COALESCE(u.badge_number, tc.badge_number) AS badge_number,
            ct.name AS credential_name,
            ct.category,
            pc.expiry_date,
            pc.status,
            pc.expiry_date - CURRENT_DATE AS days_remaining
        FROM pax_credentials pc
        LEFT JOIN users u ON u.id = pc.user_id
        LEFT JOIN tier_contacts tc ON tc.id = pc.contact_id
        JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE COALESCE(u.entity_id, tc.entity_id) = :entity_id
          AND COALESCE(u.archived, tc.archived) = FALSE
          AND pc.expiry_date IS NOT NULL
          AND pc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days_ahead
          AND pc.status IN ('valid', 'pending_validation')
        ORDER BY pc.expiry_date ASC
        LIMIT 100
    """), {"entity_id": str(entity_id), "days_ahead": days_ahead})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "pax_name", "label": "PAX"},
            {"key": "badge_number", "label": "Badge"},
            {"key": "credential_name", "label": "Certification"},
            {"key": "category", "label": "Catégorie"},
            {"key": "expiry_date", "label": "Expiration"},
            {"key": "days_remaining", "label": "Jours restants"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "pax_name": r["pax_name"],
                "badge_number": r["badge_number"],
                "credential_name": r["credential_name"],
                "category": r["category"],
                "expiry_date": r["expiry_date"].isoformat() if r["expiry_date"] else None,
                "days_remaining": r["days_remaining"],
                "status": r["status"],
            }
            for r in rows
        ],
    }


async def provider_signalements_actifs(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get active (unresolved) incidents."""
    result = await db.execute(text("""
        SELECT
            pi.id,
            pi.severity,
            pi.description,
            pi.incident_date,
            COALESCE(
                u.first_name || ' ' || u.last_name,
                tc.first_name || ' ' || tc.last_name
            ) AS pax_name,
            a.name AS asset_name,
            pi.created_at
        FROM pax_incidents pi
        LEFT JOIN users u ON u.id = pi.user_id
        LEFT JOIN tier_contacts tc ON tc.id = pi.contact_id
        LEFT JOIN ar_installations a ON a.id = pi.asset_id
        WHERE pi.entity_id = :entity_id
          AND pi.resolved_at IS NULL
        ORDER BY
            CASE pi.severity
                WHEN 'permanent_ban' THEN 1
                WHEN 'temp_ban' THEN 2
                WHEN 'warning' THEN 3
                ELSE 4
            END,
            pi.incident_date DESC
        LIMIT 50
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "severity", "label": "Sévérité"},
            {"key": "pax_name", "label": "PAX"},
            {"key": "asset_name", "label": "Site"},
            {"key": "description", "label": "Description"},
            {"key": "incident_date", "label": "Date"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "severity": r["severity"],
                "pax_name": r["pax_name"],
                "asset_name": r["asset_name"],
                "description": r["description"][:200] if r["description"] else "",
                "incident_date": r["incident_date"].isoformat() if r["incident_date"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }


async def provider_project_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get active projects with status counts."""
    result = await db.execute(text("""
        SELECT
            p.id,
            p.code,
            p.name,
            p.status,
            p.priority,
            p.progress,
            p.start_date,
            p.end_date,
            u.first_name || ' ' || u.last_name AS manager_name
        FROM projects p
        LEFT JOIN users u ON u.id = p.manager_id
        WHERE p.entity_id = :entity_id
          AND p.active = TRUE
          AND p.archived = FALSE
          AND p.status IN ('draft', 'planned', 'active', 'on_hold')
        ORDER BY
            CASE p.priority
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
            END,
            p.name
        LIMIT 50
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "code", "label": "Code"},
            {"key": "name", "label": "Projet"},
            {"key": "status", "label": "Statut"},
            {"key": "priority", "label": "Priorité"},
            {"key": "progress", "label": "Avancement"},
            {"key": "manager_name", "label": "Chef de projet"},
            {"key": "end_date", "label": "Échéance"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "code": r["code"],
                "name": r["name"],
                "status": r["status"],
                "priority": r["priority"],
                "progress": r["progress"],
                "manager_name": r["manager_name"],
                "start_date": r["start_date"].isoformat() if r["start_date"] else None,
                "end_date": r["end_date"].isoformat() if r["end_date"] else None,
            }
            for r in rows
        ],
    }


async def provider_my_ads(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get current user's AdS."""
    result = await db.execute(text("""
        SELECT
            a.id,
            a.reference,
            a.type,
            a.status,
            a.visit_purpose,
            a.start_date,
            a.end_date,
            asset.name AS site_name,
            (SELECT COUNT(*) FROM ads_pax ap WHERE ap.ads_id = a.id) AS pax_count
        FROM ads a
        JOIN ar_installations asset ON asset.id = a.site_entry_asset_id
        WHERE a.entity_id = :entity_id
          AND a.requester_id = :user_id
          AND a.deleted_at IS NULL
          AND a.status NOT IN ('cancelled', 'completed')
        ORDER BY a.start_date DESC
        LIMIT 50
    """), {"entity_id": str(entity_id), "user_id": str(user.id)})
    rows = result.mappings().all()

    return {
        "columns": [
            {"key": "reference", "label": "Référence"},
            {"key": "status", "label": "Statut"},
            {"key": "site_name", "label": "Site"},
            {"key": "start_date", "label": "Début"},
            {"key": "end_date", "label": "Fin"},
            {"key": "pax_count", "label": "PAX"},
        ],
        "rows": [
            {
                "id": str(r["id"]),
                "reference": r["reference"],
                "type": r["type"],
                "status": r["status"],
                "visit_purpose": r["visit_purpose"][:100] if r["visit_purpose"] else "",
                "site_name": r["site_name"],
                "start_date": r["start_date"].isoformat() if r["start_date"] else None,
                "end_date": r["end_date"].isoformat() if r["end_date"] else None,
                "pax_count": r["pax_count"],
            }
            for r in rows
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Chart Providers
# ═══════════════════════════════════════════════════════════════════════════════

async def provider_capacity_heatmap(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get daily PAX load per asset from the daily_pax_load materialized view.

    Falls back to an inline query from ads + ads_pax if the materialized
    view does not exist yet.
    """
    try:
        result = await db.execute(text("""
            SELECT
                dpl.asset_id,
                a.name  AS asset_name,
                dpl.date,
                dpl.load,
                dpl.capacity,
                CASE WHEN dpl.capacity > 0
                     THEN ROUND((dpl.load::numeric / dpl.capacity) * 100, 1)
                     ELSE 0
                END AS percentage
            FROM daily_pax_load dpl
            JOIN ar_installations a ON a.id = dpl.asset_id
            WHERE a.entity_id = :entity_id
              AND dpl.date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
            ORDER BY a.name, dpl.date
        """), {"entity_id": str(entity_id)})
    except Exception:
        # Materialized view may not exist — fallback to inline computation
        result = await db.execute(text("""
            SELECT
                asset.id   AS asset_id,
                asset.name AS asset_name,
                d::date    AS date,
                COUNT(DISTINCT ap.id)::int AS load,
                COALESCE(asset.pax_capacity, 0) AS capacity,
                CASE WHEN COALESCE(asset.pax_capacity, 0) > 0
                     THEN ROUND(
                         (COUNT(DISTINCT ap.id)::numeric
                          / asset.pax_capacity) * 100, 1)
                     ELSE 0
                END AS percentage
            FROM ads a
            JOIN ads_pax ap ON ap.ads_id = a.id
            JOIN ar_installations asset ON asset.id = a.site_entry_asset_id
            CROSS JOIN generate_series(
                GREATEST(a.start_date, CURRENT_DATE),
                LEAST(a.end_date, CURRENT_DATE + 30),
                '1 day'
            ) AS d
            WHERE a.entity_id = :entity_id
              AND a.status IN ('approved', 'in_progress')
              AND a.deleted_at IS NULL
              AND a.end_date >= CURRENT_DATE
              AND a.start_date <= CURRENT_DATE + 30
            GROUP BY asset.id, asset.name, asset.pax_capacity, d::date
            ORDER BY asset.name, date
        """), {"entity_id": str(entity_id)})

    rows = result.mappings().all()

    return {
        "data": [
            {
                "asset_id": str(r["asset_id"]),
                "asset_name": r["asset_name"],
                "date": r["date"].isoformat() if r["date"] else None,
                "load": r["load"],
                "capacity": r["capacity"],
                "percentage": float(r["percentage"]) if r["percentage"] else 0,
            }
            for r in rows
        ],
    }


async def provider_planner_gantt_mini(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get planner activities for mini-Gantt (next 30 days)."""
    result = await db.execute(text("""
        SELECT
            pa.id,
            pa.title,
            pa.type,
            pa.status,
            pa.priority,
            pa.start_date,
            pa.end_date,
            pa.pax_quota,
            a.name AS asset_name,
            p.name AS project_name
        FROM planner_activities pa
        JOIN ar_installations a ON a.id = pa.asset_id
        LEFT JOIN projects p ON p.id = pa.project_id
        WHERE pa.entity_id = :entity_id
          AND pa.active = TRUE
          AND pa.status NOT IN ('cancelled', 'rejected')
          AND (
              (pa.start_date IS NOT NULL AND pa.start_date <= NOW() + INTERVAL '30 days')
              OR pa.status = 'in_progress'
          )
          AND (
              pa.end_date IS NULL
              OR pa.end_date >= NOW() - INTERVAL '7 days'
          )
        ORDER BY pa.start_date NULLS LAST
        LIMIT 50
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "data": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "type": r["type"],
                "status": r["status"],
                "asset_name": r["asset_name"],
                "start_date": r["start_date"].isoformat() if r["start_date"] else None,
                "end_date": r["end_date"].isoformat() if r["end_date"] else None,
                "pax_quota": r["pax_quota"],
            }
            for r in rows
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Map Providers
# ═══════════════════════════════════════════════════════════════════════════════

async def provider_fleet_map(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Get latest positions of all active vectors for map widget.

    Uses DISTINCT ON to get only the most recent position per vector.
    """
    result = await db.execute(text("""
        SELECT DISTINCT ON (tv.id)
            tv.id AS vector_id,
            tv.name AS vector_name,
            tv.type AS vector_type,
            vp.latitude,
            vp.longitude,
            vp.speed_knots,
            vp.heading,
            tv.status,
            vp.recorded_at
        FROM transport_vectors tv
        LEFT JOIN vector_positions vp ON vp.vector_id = tv.id
        WHERE tv.entity_id = :entity_id
          AND tv.active = TRUE
          AND tv.archived = FALSE
        ORDER BY tv.id, vp.recorded_at DESC NULLS LAST
    """), {"entity_id": str(entity_id)})
    rows = result.mappings().all()

    return {
        "markers": [
            {
                "id": str(r["vector_id"]),
                "name": r["vector_name"],
                "type": r["vector_type"],
                "lat": r["latitude"],
                "lng": r["longitude"],
                "speed": r["speed_knots"],
                "heading": r["heading"],
                "status": r["status"],
                "updated_at": r["recorded_at"].isoformat() if r["recorded_at"] else None,
            }
            for r in rows
            if r["latitude"] is not None
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Projets — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_projets_kpis(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """All project KPIs in one call: active, completed, avg progress, budget, task stats."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'active') AS active,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) AS total,
            COALESCE(AVG(progress), 0) AS avg_progress,
            COALESCE(SUM(budget), 0) AS total_budget
        FROM projects WHERE entity_id = :eid AND archived = FALSE
    """), {"eid": str(entity_id)})
    p = r.mappings().first() or {}
    rt = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
            COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('done','cancelled')) AS overdue,
            COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('done','cancelled')) AS critical,
            COUNT(*) FILTER (WHERE status = 'done') AS done
        FROM project_tasks WHERE active = TRUE
          AND project_id IN (SELECT id FROM projects WHERE entity_id = :eid AND archived = FALSE)
    """), {"eid": str(entity_id)})
    t = rt.mappings().first() or {}
    return {
        "value": p.get("active", 0), "label": "Projets actifs",
        "details": {
            "active": p.get("active", 0), "completed": p.get("completed", 0), "total": p.get("total", 0),
            "avg_progress": round(float(p.get("avg_progress", 0)), 1),
            "total_budget": float(p.get("total_budget", 0)),
            "tasks_in_progress": t.get("in_progress", 0), "tasks_overdue": t.get("overdue", 0),
            "tasks_critical": t.get("critical", 0), "tasks_done": t.get("done", 0),
        },
    }


async def provider_projets_weather(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Project health by weather category."""
    r = await db.execute(text("""
        SELECT weather, COUNT(*) AS cnt
        FROM projects WHERE entity_id = :eid AND archived = FALSE AND status = 'active'
        GROUP BY weather ORDER BY cnt DESC
    """), {"eid": str(entity_id)})
    rows = r.mappings().all()
    return {
        "data": [{"name": row["weather"] or "unknown", "value": row["cnt"]} for row in rows],
        "series": [{"name": "Projets", "type": "bar"}],
    }


async def provider_projets_deadlines(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Tasks with deadlines in the next 14 days."""
    r = await db.execute(text("""
        SELECT pt.title, pt.due_date, pt.status, pt.priority, p.code AS project_code
        FROM project_tasks pt
        JOIN projects p ON p.id = pt.project_id
        WHERE p.entity_id = :eid AND p.archived = FALSE AND pt.active = TRUE
          AND pt.due_date BETWEEN NOW() AND NOW() + INTERVAL '14 days'
          AND pt.status NOT IN ('done','cancelled')
        ORDER BY pt.due_date LIMIT 10
    """), {"eid": str(entity_id)})
    rows = r.mappings().all()
    return {
        "columns": [
            {"key": "project_code", "label": "Projet"},
            {"key": "title", "label": "Tache"},
            {"key": "due_date", "label": "Echeance"},
            {"key": "status", "label": "Statut"},
            {"key": "priority", "label": "Priorite"},
        ],
        "rows": [dict(row) for row in rows],
    }


async def provider_projets_top_volume(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Top 5 projects by task count."""
    r = await db.execute(text("""
        SELECT p.code, p.name, p.progress, p.status,
               COUNT(pt.id) AS task_count
        FROM projects p
        LEFT JOIN project_tasks pt ON pt.project_id = p.id AND pt.active = TRUE
        WHERE p.entity_id = :eid AND p.archived = FALSE
        GROUP BY p.id ORDER BY task_count DESC LIMIT 5
    """), {"eid": str(entity_id)})
    rows = r.mappings().all()
    return {
        "columns": [
            {"key": "code", "label": "Code"}, {"key": "name", "label": "Nom"},
            {"key": "progress", "label": "%"}, {"key": "task_count", "label": "Taches"},
        ],
        "rows": [dict(row) for row in rows],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Asset Registry — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_assets_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Asset registry KPIs: fields, sites, installations, equipment, pipelines."""
    r = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM ar_oil_fields WHERE entity_id = :eid AND deleted_at IS NULL) AS fields,
            (SELECT COUNT(*) FROM ar_sites WHERE entity_id = :eid AND deleted_at IS NULL) AS sites,
            (SELECT COUNT(*) FROM ar_installations WHERE entity_id = :eid AND deleted_at IS NULL) AS installations,
            (SELECT COUNT(*) FROM ar_equipment WHERE entity_id = :eid AND deleted_at IS NULL) AS equipment,
            (SELECT COUNT(*) FROM ar_pipelines WHERE entity_id = :eid AND deleted_at IS NULL) AS pipelines
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    return {
        "value": row.get("installations", 0), "label": "Installations",
        "details": {k: row.get(k, 0) for k in ("fields", "sites", "installations", "equipment", "pipelines")},
    }


async def provider_assets_equipment_by_class(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Equipment count grouped by class."""
    r = await db.execute(text("""
        SELECT equipment_class AS name, COUNT(*) AS value
        FROM ar_equipment WHERE entity_id = :eid AND deleted_at IS NULL
        GROUP BY equipment_class ORDER BY value DESC LIMIT 15
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()], "series": [{"name": "Equipements", "type": "pie"}]}


async def provider_assets_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Equipment count grouped by status."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM ar_equipment WHERE entity_id = :eid AND deleted_at IS NULL
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()], "series": [{"name": "Statut", "type": "bar"}]}


async def provider_assets_sites_by_type(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Sites grouped by type."""
    r = await db.execute(text("""
        SELECT site_type AS name, COUNT(*) AS value
        FROM ar_sites WHERE entity_id = :eid AND deleted_at IS NULL
        GROUP BY site_type ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()], "series": [{"name": "Sites", "type": "pie"}]}


async def provider_assets_map(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Geographic markers for fields, sites, installations."""
    markers = []
    for tbl, label, color in [
        ("ar_oil_fields", "Champ", "#4f46e5"),
        ("ar_sites", "Site", "#06b6d4"),
        ("ar_installations", "Installation", "#f59e0b"),
    ]:
        r = await db.execute(text(f"""
            SELECT code, name, latitude, longitude
            FROM {tbl} WHERE entity_id = :eid AND deleted_at IS NULL
              AND latitude IS NOT NULL AND longitude IS NOT NULL
        """), {"eid": str(entity_id)})
        for row in r.mappings().all():
            markers.append({
                "lat": float(row["latitude"]), "lng": float(row["longitude"]),
                "label": f'{row["code"]} — {row["name"]}', "type": label, "color": color,
            })
    return {"markers": markers}


# ═══════════════════════════════════════════════════════════════════════════════
#  PaxLog — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_paxlog_compliance_rate(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """PaxLog compliance rate and breakdown."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_compliant = TRUE) AS compliant,
            COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired,
            COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_soon
        FROM compliance_records
        WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    total = row.get("total", 0)
    compliant = row.get("compliant", 0)
    rate = round(compliant / total * 100, 1) if total > 0 else 0
    return {
        "value": rate, "label": "Taux de conformite", "unit": "%",
        "details": {"total": total, "compliant": compliant,
                    "expired": row.get("expired", 0), "expiring_soon": row.get("expiring_soon", 0)},
    }


async def provider_paxlog_ads_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """ADS count grouped by status."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM ads WHERE entity_id = :eid AND archived = FALSE
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()], "series": [{"name": "AdS", "type": "bar"}]}


async def provider_paxlog_expiring_credentials(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Credentials expiring in the next 30 days."""
    days = int(config.get("days_ahead", 30))
    r = await db.execute(text("""
        SELECT pc.id, pg.name AS pax_name, ct.name AS credential_type,
               pc.expiry_date, pc.expiry_date - CURRENT_DATE AS days_remaining
        FROM pax_credentials pc
        JOIN pax_groups pg ON pg.id = pc.pax_group_id
        JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pg.entity_id = :eid AND pc.active = TRUE
          AND pc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days * INTERVAL '1 day'
        ORDER BY pc.expiry_date LIMIT 15
    """), {"eid": str(entity_id), "days": days})
    rows = r.mappings().all()
    return {
        "columns": [
            {"key": "pax_name", "label": "PAX"}, {"key": "credential_type", "label": "Type"},
            {"key": "expiry_date", "label": "Expiration"}, {"key": "days_remaining", "label": "J restants"},
        ],
        "rows": [dict(row) for row in rows],
    }


async def provider_paxlog_incidents(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Active incident count."""
    r = await db.execute(text("""
        SELECT COUNT(*) AS cnt FROM pax_incidents
        WHERE entity_id = :eid AND status NOT IN ('closed','resolved')
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    return {"value": row.get("cnt", 0), "label": "Incidents actifs", "unit": "incidents"}


# ═══════════════════════════════════════════════════════════════════════════════
#  Conformité — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_conformite_kpis(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Conformité KPIs: total, valid, expired, pending, rate."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_compliant = TRUE AND (expires_at IS NULL OR expires_at > NOW())) AS valid,
            COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_soon
        FROM compliance_records WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    total = row.get("total", 0)
    valid = row.get("valid", 0)
    rate = round(valid / total * 100, 1) if total > 0 else 0
    return {
        "value": rate, "label": "Taux de conformite", "unit": "%",
        "details": {
            "total": total, "valid": valid, "expired": row.get("expired", 0),
            "pending": row.get("pending", 0), "expiring_soon": row.get("expiring_soon", 0),
            "rate": rate,
        },
    }


async def provider_conformite_by_category(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Conformité records grouped by type category."""
    r = await db.execute(text("""
        SELECT ct.category AS name,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE cr.is_compliant = TRUE AND (cr.expires_at IS NULL OR cr.expires_at > NOW())) AS valid,
               COUNT(*) FILTER (WHERE cr.expires_at < NOW()) AS expired
        FROM compliance_records cr
        JOIN compliance_types ct ON ct.id = cr.compliance_type_id
        WHERE cr.entity_id = :eid AND cr.active = TRUE
        GROUP BY ct.category ORDER BY total DESC
    """), {"eid": str(entity_id)})
    rows = r.mappings().all()
    return {
        "data": [{"name": row["name"] or "autre", "total": row["total"], "valid": row["valid"], "expired": row["expired"]} for row in rows],
        "series": [{"name": "Valide", "type": "bar"}, {"name": "Expire", "type": "bar"}],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Registration
# ═══════════════════════════════════════════════════════════════════════════════

_PROVIDER_MAP: dict[str, Any] = {
    # ── Core / cross-module ──
    "pax_on_site": provider_pax_on_site,
    "ads_pending": provider_ads_pending,
    "alerts_urgent": provider_alerts_urgent,
    "pickup_progress": provider_pickup_progress,
    "kpi_fleet": provider_kpi_fleet,
    "weather_sites": provider_weather_sites,
    "trips_today": provider_trips_today,
    "cargo_pending": provider_cargo_pending,
    "compliance_expiry": provider_compliance_expiry,
    "signalements_actifs": provider_signalements_actifs,
    "project_status": provider_project_status,
    "my_ads": provider_my_ads,
    "capacity_heatmap": provider_capacity_heatmap,
    "planner_gantt_mini": provider_planner_gantt_mini,
    "fleet_map": provider_fleet_map,
    # ── Projets module ──
    "projets_kpis": provider_projets_kpis,
    "projets_weather": provider_projets_weather,
    "projets_deadlines": provider_projets_deadlines,
    "projets_top_volume": provider_projets_top_volume,
    # ── Asset Registry module ──
    "assets_overview": provider_assets_overview,
    "assets_equipment_by_class": provider_assets_equipment_by_class,
    "assets_by_status": provider_assets_by_status,
    "assets_sites_by_type": provider_assets_sites_by_type,
    "assets_map": provider_assets_map,
    # ── PaxLog module ──
    "paxlog_compliance_rate": provider_paxlog_compliance_rate,
    "paxlog_ads_by_status": provider_paxlog_ads_by_status,
    "paxlog_expiring_credentials": provider_paxlog_expiring_credentials,
    "paxlog_incidents": provider_paxlog_incidents,
    # ── Conformité module ──
    "conformite_kpis": provider_conformite_kpis,
    "conformite_by_category": provider_conformite_by_category,
}


def register_all_widget_providers() -> None:
    """Register all concrete widget data providers with the dashboard service.

    Call this once at application startup.
    """
    from app.services.modules.dashboard_service import register_widget_data_provider

    for widget_id, provider_fn in _PROVIDER_MAP.items():
        register_widget_data_provider(widget_id, provider_fn)

    logger.info(
        "Registered %d widget data providers: %s",
        len(_PROVIDER_MAP),
        ", ".join(sorted(_PROVIDER_MAP.keys())),
    )
