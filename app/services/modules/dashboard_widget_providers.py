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
        WHERE COALESCE(u.default_entity_id, tc.entity_id) = :entity_id
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
            (SELECT COUNT(*) FROM ar_fields WHERE entity_id = :eid AND deleted_at IS NULL) AS fields,
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
        ("ar_fields", "Champ", "#4f46e5"),
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
        "value": rate, "label": "Taux de conformité", "unit": "%",
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
    # PaxCredential links to a User (user_id) OR a TierContact (contact_id)
    # via an XOR constraint — there's no pax_group_id column. We LEFT JOIN
    # both and COALESCE the name.
    r = await db.execute(text("""
        SELECT pc.id,
               COALESCE(
                   u.first_name || ' ' || u.last_name,
                   tc.first_name || ' ' || tc.last_name,
                   '—'
               ) AS pax_name,
               ct.name AS credential_type,
               pc.expiry_date,
               pc.expiry_date - CURRENT_DATE AS days_remaining
        FROM pax_credentials pc
        LEFT JOIN users u ON u.id = pc.user_id
        LEFT JOIN tier_contacts tc ON tc.id = pc.contact_id
        JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE (u.default_entity_id = :eid OR tc.id IN (
            SELECT tcc.id FROM tier_contacts tcc
            JOIN tiers t ON t.id = tcc.tier_id
            WHERE t.entity_id = :eid
        ))
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
        "value": rate, "label": "Taux de conformité", "unit": "%",
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
#  Tiers — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_tiers_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Tiers KPIs: total companies, by type, contacts count."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE type = 'client') AS clients,
            COUNT(*) FILTER (WHERE type = 'supplier') AS suppliers,
            COUNT(*) FILTER (WHERE type = 'subcontractor') AS subcontractors,
            COUNT(*) FILTER (WHERE status = 'active') AS active
        FROM tiers WHERE entity_id = :eid AND archived = FALSE
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    rc = await db.execute(text("""
        SELECT COUNT(*) AS cnt FROM tier_contacts WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    contacts = (rc.mappings().first() or {}).get("cnt", 0)
    return {
        "value": row.get("total", 0), "label": "Entreprises",
        "details": {
            "total": row.get("total", 0), "clients": row.get("clients", 0),
            "suppliers": row.get("suppliers", 0), "subcontractors": row.get("subcontractors", 0),
            "active": row.get("active", 0), "contacts": contacts,
        },
    }


async def provider_tiers_by_type(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Tiers distribution by type."""
    r = await db.execute(text("""
        SELECT type AS name, COUNT(*) AS value
        FROM tiers WHERE entity_id = :eid AND archived = FALSE
        GROUP BY type ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()], "series": [{"name": "Entreprises", "type": "pie"}]}


async def provider_tiers_recent(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Recently created/modified tiers."""
    r = await db.execute(text("""
        SELECT code, name, type, status, created_at
        FROM tiers WHERE entity_id = :eid AND archived = FALSE
        ORDER BY updated_at DESC NULLS LAST LIMIT 10
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "code", "label": "Code"}, {"key": "name", "label": "Nom"},
            {"key": "type", "label": "Type"}, {"key": "status", "label": "Statut"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PackLog — module-contextual providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_packlog_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    requests = await db.execute(text("""
        SELECT
            COUNT(*) AS total_requests,
            COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved', 'assigned', 'in_progress')) AS active_requests,
            COUNT(*) FILTER (WHERE status = 'draft') AS blocked_requests,
            COALESCE(SUM(cargo_count), 0) AS cargo_count
        FROM cargo_requests
        WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    request_row = requests.mappings().first() or {}

    cargo = await db.execute(text("""
        SELECT
            COALESCE(SUM(weight_kg), 0) AS total_weight_kg,
            COUNT(*) FILTER (WHERE status IN ('loaded', 'in_transit')) AS in_motion,
            COUNT(*) FILTER (WHERE status IN ('damaged', 'missing')) AS incidents
        FROM cargo_items
        WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    cargo_row = cargo.mappings().first() or {}

    return {
        "value": request_row.get("total_requests", 0),
        "label": "Demandes d'expédition",
        "unit": "demandes",
        "details": {
            "active_requests": request_row.get("active_requests", 0),
            "blocked_requests": request_row.get("blocked_requests", 0),
            "cargo_count": request_row.get("cargo_count", 0),
            "total_weight_kg": float(cargo_row.get("total_weight_kg", 0) or 0),
            "in_motion": cargo_row.get("in_motion", 0),
            "incidents": cargo_row.get("incidents", 0),
        },
    }


async def provider_packlog_requests_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> list:
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM cargo_requests
        WHERE entity_id = :eid AND active = TRUE
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return [dict(row) for row in r.mappings().all()]


async def provider_packlog_cargo_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> list:
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM cargo_items
        WHERE entity_id = :eid AND active = TRUE
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return [dict(row) for row in r.mappings().all()]


async def provider_packlog_tracking(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    r = await db.execute(text("""
        SELECT
            ci.tracking_code,
            ci.description,
            ci.status,
            v.code AS voyage_code,
            COALESCE(ai.name, ci.receiver_name) AS destination_name,
            COALESCE(ci.received_at, ci.created_at) AS updated_at
        FROM cargo_items ci
        LEFT JOIN voyages v ON v.id = ci.voyage_id
        LEFT JOIN ar_installations ai ON ai.id = ci.destination_asset_id
        WHERE ci.entity_id = :eid AND ci.active = TRUE
        ORDER BY COALESCE(ci.received_at, ci.created_at) DESC
        LIMIT 12
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "tracking_code", "label": "Tracking"},
            {"key": "description", "label": "Description"},
            {"key": "status", "label": "Statut"},
            {"key": "voyage_code", "label": "Voyage"},
            {"key": "destination_name", "label": "Destination"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_packlog_alerts(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    r = await db.execute(text("""
        SELECT *
        FROM (
            SELECT
                'request' AS item_type,
                cr.request_code AS reference,
                cr.title AS label,
                CASE
                    WHEN cr.status = 'draft' THEN 'Dossier incomplet'
                    WHEN cr.status = 'submitted' AND cr.created_at < NOW() - INTERVAL '2 days' THEN 'Soumis sans suite'
                    ELSE NULL
                END AS alert
            FROM cargo_requests cr
            WHERE cr.entity_id = :eid AND cr.active = TRUE

            UNION ALL

            SELECT
                'cargo' AS item_type,
                ci.tracking_code AS reference,
                ci.description AS label,
                CASE
                    WHEN ci.status = 'missing' THEN 'Colis manquant'
                    WHEN ci.status = 'damaged' THEN 'Colis endommagé'
                    WHEN ci.status IN ('registered', 'ready') AND ci.created_at < NOW() - INTERVAL '5 days' THEN 'Retard de traitement'
                    ELSE NULL
                END AS alert
            FROM cargo_items ci
            WHERE ci.entity_id = :eid AND ci.active = TRUE
        ) alerts
        WHERE alert IS NOT NULL
        LIMIT 15
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "reference", "label": "Référence"},
            {"key": "label", "label": "Objet"},
            {"key": "alert", "label": "Alerte"},
            {"key": "item_type", "label": "Type"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_packlog_catalog_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total_articles,
            COUNT(*) FILTER (WHERE COALESCE(active, TRUE) = TRUE) AS active_articles,
            COUNT(*) FILTER (WHERE is_hazmat = TRUE) AS hazmat_articles
        FROM article_catalog
        WHERE entity_id = :eid
    """), {"eid": str(entity_id)})
    row = r.mappings().first() or {}
    return {
        "value": row.get("total_articles", 0),
        "label": "Articles SAP",
        "unit": "articles",
        "details": {
            "active_articles": row.get("active_articles", 0),
            "hazmat_articles": row.get("hazmat_articles", 0),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Registration
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
#  Users (Accounts) Module Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_users_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: user counts (active, inactive, online, MFA enabled)."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE active = TRUE) AS active_count,
            COUNT(*) FILTER (WHERE active = FALSE) AS inactive_count,
            COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '5 minutes') AS online_count,
            COUNT(*) FILTER (WHERE mfa_enabled = TRUE) AS mfa_count,
            COUNT(*) AS total_count
        FROM users
    """))
    row = r.mappings().first()
    return {
        "value": row["active_count"] if row else 0,
        "label": "Utilisateurs actifs",
        "unit": "comptes",
        "trend": None,
        "details": {
            "active": row["active_count"] if row else 0,
            "inactive": row["inactive_count"] if row else 0,
            "online": row["online_count"] if row else 0,
            "mfa_enabled": row["mfa_count"] if row else 0,
            "total": row["total_count"] if row else 0,
        },
    }


async def provider_users_by_role(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: users grouped by role."""
    r = await db.execute(text("""
        SELECT r.name AS name, COUNT(DISTINCT ugm.user_id) AS value
        FROM user_group_roles ugr
        JOIN roles r ON r.code = ugr.role_code
        JOIN user_group_members ugm ON ugm.group_id = ugr.group_id
        JOIN user_groups ug ON ug.id = ugr.group_id AND ug.entity_id = :eid AND ug.active = TRUE
        GROUP BY r.name ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {
        "data": [dict(row) for row in r.mappings().all()],
        "series": [{"name": "Utilisateurs", "type": "bar"}],
    }


async def provider_users_by_group(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: users per group."""
    r = await db.execute(text("""
        SELECT ug.name AS name, COUNT(ugm.user_id) AS value
        FROM user_groups ug
        LEFT JOIN user_group_members ugm ON ugm.group_id = ug.id
        WHERE ug.entity_id = :eid AND ug.active = TRUE
        GROUP BY ug.name ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {
        "data": [dict(row) for row in r.mappings().all()],
        "series": [{"name": "Membres", "type": "bar"}],
    }


async def provider_users_recent_activity(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: recently active users (last login)."""
    r = await db.execute(text("""
        SELECT u.first_name || ' ' || u.last_name AS name,
               u.email, u.last_login_at,
               CASE WHEN u.active THEN 'active' ELSE 'inactive' END AS status,
               CASE WHEN u.mfa_enabled THEN 'oui' ELSE 'non' END AS mfa
        FROM users u
        WHERE u.last_login_at IS NOT NULL
        ORDER BY u.last_login_at DESC LIMIT 15
    """))
    return {
        "columns": [
            {"key": "name", "label": "Nom"},
            {"key": "email", "label": "Email"},
            {"key": "status", "label": "Statut"},
            {"key": "mfa", "label": "MFA"},
            {"key": "last_login_at", "label": "Dernière connexion"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_users_mfa_stats(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: MFA adoption rate."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE mfa_enabled = TRUE) AS mfa_enabled,
            COUNT(*) FILTER (WHERE mfa_enabled = FALSE) AS mfa_disabled,
            COUNT(*) AS total
        FROM users WHERE active = TRUE
    """))
    row = r.mappings().first()
    total = row["total"] if row else 1
    enabled = row["mfa_enabled"] if row else 0
    rate = round(enabled / max(total, 1) * 100, 1)
    return {
        "value": rate,
        "label": "Taux MFA",
        "unit": "%",
        "trend": None,
        "comparison": f"{enabled}/{total} utilisateurs",
    }


async def provider_users_orphans(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: users without any group membership (orphans)."""
    r = await db.execute(text("""
        SELECT u.first_name || ' ' || u.last_name AS name,
               u.email, u.created_at,
               CASE WHEN u.active THEN 'active' ELSE 'inactive' END AS status
        FROM users u
        LEFT JOIN user_group_members ugm ON ugm.user_id = u.id
        WHERE ugm.user_id IS NULL AND u.active = TRUE
        ORDER BY u.created_at DESC
    """))
    return {
        "columns": [
            {"key": "name", "label": "Nom"},
            {"key": "email", "label": "Email"},
            {"key": "status", "label": "Statut"},
            {"key": "created_at", "label": "Créé le"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }

# ═══════════════════════════════════════════════════════════════════════════════
#  Support Module Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_support_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: support ticket counts."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) AS open_count,
            COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
            COUNT(*) FILTER (WHERE priority IN ('high', 'critical') AND status NOT IN ('resolved', 'closed')) AS critical_count,
            COUNT(*) AS total_count
        FROM support_tickets WHERE entity_id = :eid
    """), {"eid": str(entity_id)})
    row = r.mappings().first()
    return {
        "value": row["open_count"] if row else 0,
        "label": "Tickets ouverts",
        "unit": "tickets",
        "trend": None,
        "details": {
            "open": row["open_count"] if row else 0,
            "resolved": row["resolved_count"] if row else 0,
            "critical": row["critical_count"] if row else 0,
            "total": row["total_count"] if row else 0,
        },
    }


async def provider_support_tickets_recent(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: recent support tickets."""
    r = await db.execute(text("""
        SELECT reference, title, status, priority, ticket_type, created_at
        FROM support_tickets WHERE entity_id = :eid
        ORDER BY created_at DESC LIMIT 15
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "reference", "label": "Ref"},
            {"key": "title", "label": "Titre"},
            {"key": "status", "label": "Statut"},
            {"key": "priority", "label": "Priorité"},
            {"key": "ticket_type", "label": "Type"},
            {"key": "created_at", "label": "Créé le"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_support_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: tickets by status."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM support_tickets WHERE entity_id = :eid
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


# ═══════════════════════════════════════════════════════════════════════════════
#  Support Module — Advanced Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_support_by_type(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: tickets by type (bug, improvement, question)."""
    r = await db.execute(text("""
        SELECT ticket_type AS name, COUNT(*) AS value
        FROM support_tickets WHERE entity_id = :eid
        GROUP BY ticket_type ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_support_by_priority(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: open tickets by priority — shows urgency distribution."""
    r = await db.execute(text("""
        SELECT priority AS name, COUNT(*) AS value
        FROM support_tickets WHERE entity_id = :eid AND status NOT IN ('resolved', 'closed')
        GROUP BY priority ORDER BY CASE priority
            WHEN 'critical' THEN 1 WHEN 'high' THEN 2
            WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_support_trend(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: tickets opened vs resolved per week (last 8 weeks)."""
    r = await db.execute(text("""
        SELECT
            TO_CHAR(DATE_TRUNC('week', created_at), 'DD/MM') AS week,
            COUNT(*) FILTER (WHERE TRUE) AS opened,
            COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) AS resolved
        FROM support_tickets WHERE entity_id = :eid
            AND created_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY DATE_TRUNC('week', created_at)
    """), {"eid": str(entity_id)})
    return {
        "data": [dict(row) for row in r.mappings().all()],
        "series": [{"name": "Ouverts", "type": "area"}, {"name": "Résolus", "type": "area"}],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Conformité Module — Advanced Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_conformite_urgency(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: items expiring by urgency band (7j, 30j, 90j, >90j)."""
    r = await db.execute(text("""
        SELECT
            CASE
                WHEN expires_at <= NOW() THEN 'Expiré'
                WHEN expires_at <= NOW() + INTERVAL '7 days' THEN '< 7 jours'
                WHEN expires_at <= NOW() + INTERVAL '30 days' THEN '< 30 jours'
                WHEN expires_at <= NOW() + INTERVAL '90 days' THEN '< 90 jours'
                ELSE '> 90 jours'
            END AS name,
            COUNT(*) AS value
        FROM compliance_records
        WHERE entity_id = :eid AND expires_at IS NOT NULL AND status != 'expired'
        GROUP BY 1
        ORDER BY MIN(expires_at)
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_conformite_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: compliance records by status (donut)."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM compliance_records WHERE entity_id = :eid
        GROUP BY status ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_conformite_matrix(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: compliance matrix — type × status counts."""
    r = await db.execute(text("""
        SELECT ct.name AS type_name,
               COUNT(*) FILTER (WHERE cr.status = 'valid') AS valid,
               COUNT(*) FILTER (WHERE cr.status = 'pending') AS pending,
               COUNT(*) FILTER (WHERE cr.status = 'expired') AS expired,
               COUNT(*) FILTER (WHERE cr.status = 'non_compliant') AS non_compliant,
               COUNT(*) AS total
        FROM compliance_records cr
        JOIN compliance_types ct ON ct.id = cr.compliance_type_id
        WHERE cr.entity_id = :eid
        GROUP BY ct.name ORDER BY total DESC
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "type_name", "label": "Type"},
            {"key": "valid", "label": "Valide"},
            {"key": "pending", "label": "En attente"},
            {"key": "expired", "label": "Expiré"},
            {"key": "non_compliant", "label": "Non conforme"},
            {"key": "total", "label": "Total"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_conformite_trend(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: compliance score trend over last 6 months (area)."""
    r = await db.execute(text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', cr.updated_at), 'Mon YY') AS month,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE cr.status = 'valid') / NULLIF(COUNT(*), 0),
                1
            ) AS score
        FROM compliance_records cr
        WHERE cr.entity_id = :eid AND cr.updated_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', cr.updated_at)
        ORDER BY DATE_TRUNC('month', cr.updated_at)
    """), {"eid": str(entity_id)})
    return {
        "data": [dict(row) for row in r.mappings().all()],
        "series": [{"name": "Score conformité", "type": "area"}],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Planner Module — Advanced Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_planner_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: planner activity summary."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'draft') AS draft,
            COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
            COUNT(*) FILTER (WHERE status = 'validated') AS validated,
            COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COALESCE(SUM(pax_quota), 0) AS total_pax
        FROM planner_activities
        WHERE entity_id = :eid AND active = TRUE
    """), {"eid": str(entity_id)})
    row = r.mappings().first()
    return {
        "value": row["total"] if row else 0,
        "label": "Activités planifiées",
        "unit": "activités",
        "details": {
            "draft": row["draft"] if row else 0,
            "submitted": row["submitted"] if row else 0,
            "validated": row["validated"] if row else 0,
            "in_progress": row["in_progress"] if row else 0,
            "completed": row["completed"] if row else 0,
        },
    }


async def provider_planner_by_type(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: activities by type (project, workover, drilling, etc.)."""
    r = await db.execute(text("""
        SELECT type AS name, COUNT(*) AS value
        FROM planner_activities
        WHERE entity_id = :eid AND active = TRUE
        GROUP BY type ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_planner_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: activities by status (funnel-style)."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM planner_activities
        WHERE entity_id = :eid AND active = TRUE
        GROUP BY status ORDER BY CASE status
            WHEN 'draft' THEN 1 WHEN 'submitted' THEN 2 WHEN 'validated' THEN 3
            WHEN 'in_progress' THEN 4 WHEN 'completed' THEN 5 ELSE 6 END
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_planner_conflicts_kpi(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: active conflicts count."""
    r = await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM planner_conflicts
        WHERE entity_id = :eid AND resolution_status IN ('unresolved', 'deferred')
    """), {"eid": str(entity_id)})
    row = r.mappings().first()
    return {
        "value": row["cnt"] if row else 0,
        "label": "Conflits actifs",
        "unit": "conflits",
    }


async def provider_planner_pax_by_site(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: PAX quota by site (top 10)."""
    r = await db.execute(text("""
        SELECT i.name AS name, COALESCE(SUM(pa.pax_quota), 0) AS value
        FROM planner_activities pa
        JOIN ar_installations i ON i.id = pa.asset_id
        WHERE pa.entity_id = :eid AND pa.active = TRUE
            AND pa.status IN ('draft', 'submitted', 'validated', 'in_progress')
        GROUP BY i.name ORDER BY value DESC LIMIT 10
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


# ── Plan de charge (workload chart) ─────────────────────────────────────
#
# Stacked-bar histogram of planned POB per activity type per time bucket.
# This is the dashboard counterpart of the planner Gantt's "plan de charge"
# footer row, but rendered as a standalone chart widget that can be dropped
# on any dashboard tab.
#
# Computation strategy: instead of pulling raw activities and aggregating in
# Python (which is what the gantt does client-side), we use Postgres
# `generate_series` to materialise a daily activity × bucket join, then
# group by bucket and pivot type → column. This keeps the query O(activities ×
# days_in_window) but pushes everything to the database. For typical
# windows (12 weeks × ~50 active activities) the query stays under 50 ms.

PLANNER_ACTIVITY_TYPES: tuple[str, ...] = (
    "project", "workover", "drilling", "integrity",
    "maintenance", "permanent_ops", "inspection", "event",
)


async def provider_planner_workload_chart(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: stacked POB per activity type per time bucket (plan de charge).

    Config:
      - bucket: 'day' | 'week' | 'month' | 'quarter' (default: 'week')
      - lookback_days: int (default: 7)
      - lookahead_days: int (default: 84)
      - include_drafts: bool (default: True) — include 'draft'/'submitted'
    """
    bucket = (config or {}).get("bucket", "week")
    if bucket not in ("day", "week", "month", "quarter"):
        bucket = "week"

    lookback = int((config or {}).get("lookback_days", 7))
    lookahead = int((config or {}).get("lookahead_days", 84))
    if lookback < 0:
        lookback = 0
    if lookahead <= 0:
        lookahead = 84
    # Hard caps to keep the query bounded
    lookback = min(lookback, 365)
    lookahead = min(lookahead, 366)

    include_drafts = bool((config or {}).get("include_drafts", True))
    if include_drafts:
        status_filter = "('draft', 'submitted', 'validated', 'in_progress')"
    else:
        status_filter = "('validated', 'in_progress')"

    # Bucket label format — pg date_trunc + to_char
    if bucket == "day":
        bucket_unit = "day"
        label_fmt = "DD/MM"
    elif bucket == "week":
        bucket_unit = "week"
        label_fmt = '"S"IW'  # ISO week number, e.g. "S15"
    elif bucket == "month":
        bucket_unit = "month"
        label_fmt = "Mon YY"
    else:  # quarter
        bucket_unit = "quarter"
        label_fmt = '"T"Q YY'

    sql = f"""
        WITH window_range AS (
            SELECT
                (CURRENT_DATE - INTERVAL '{lookback} days')::date AS w_start,
                (CURRENT_DATE + INTERVAL '{lookahead} days')::date AS w_end
        ),
        days AS (
            SELECT generate_series(w_start, w_end, '1 day')::date AS d
            FROM window_range
        ),
        activity_days AS (
            -- Materialise per-day PAX contribution for each activity that
            -- overlaps the window. We use the constant pax_quota — variable
            -- per-day quotas (pax_quota_daily JSONB) are NOT exploded here
            -- because the indexing cost would dwarf the gain for a chart
            -- widget; consumers needing per-day precision should use the
            -- planner gantt directly.
            SELECT
                date_trunc(:bucket_unit, d.d)::date AS bucket_start,
                pa.type AS act_type,
                pa.pax_quota AS pax
            FROM days d
            JOIN planner_activities pa
              ON pa.entity_id = :eid
             AND pa.active = TRUE
             AND pa.deleted_at IS NULL
             AND pa.status IN {status_filter}
             AND pa.start_date IS NOT NULL
             AND pa.end_date IS NOT NULL
             AND d.d >= pa.start_date::date
             AND d.d <= pa.end_date::date
        ),
        agg AS (
            SELECT
                bucket_start,
                act_type,
                SUM(pax)::int AS total
            FROM activity_days
            GROUP BY bucket_start, act_type
        )
        SELECT
            bucket_start,
            to_char(bucket_start, :label_fmt) AS name,
            COALESCE(SUM(CASE WHEN act_type = 'project' THEN total END), 0)::int AS project,
            COALESCE(SUM(CASE WHEN act_type = 'workover' THEN total END), 0)::int AS workover,
            COALESCE(SUM(CASE WHEN act_type = 'drilling' THEN total END), 0)::int AS drilling,
            COALESCE(SUM(CASE WHEN act_type = 'integrity' THEN total END), 0)::int AS integrity,
            COALESCE(SUM(CASE WHEN act_type = 'maintenance' THEN total END), 0)::int AS maintenance,
            COALESCE(SUM(CASE WHEN act_type = 'permanent_ops' THEN total END), 0)::int AS permanent_ops,
            COALESCE(SUM(CASE WHEN act_type = 'inspection' THEN total END), 0)::int AS inspection,
            COALESCE(SUM(CASE WHEN act_type = 'event' THEN total END), 0)::int AS event
        FROM agg
        GROUP BY bucket_start
        ORDER BY bucket_start
    """
    r = await db.execute(text(sql), {
        "eid": str(entity_id),
        "bucket_unit": bucket_unit,
        "label_fmt": label_fmt,
    })
    rows = [dict(row) for row in r.mappings().all()]
    # Drop bucket_start from the payload — it's only used for ordering
    for row in rows:
        row.pop("bucket_start", None)
    return {"data": rows}


# ═══════════════════════════════════════════════════════════════════════════════
#  Papyrus Module — Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_papyrus_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: Papyrus document summary with workflow and revision totals."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) AS total_documents,
            COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
            COUNT(*) FILTER (WHERE status = 'in_review') AS in_review_count,
            COUNT(*) FILTER (WHERE status IN ('approved', 'published')) AS ready_count,
            COUNT(*) FILTER (WHERE status = 'archived') AS archived_count
        FROM documents
        WHERE entity_id = :eid AND deleted_at IS NULL
    """), {"eid": str(entity_id)})
    row = r.mappings().first()

    rev = await db.execute(text("""
        SELECT COUNT(*) AS revision_count
        FROM revisions
        WHERE entity_id = :eid
    """), {"eid": str(entity_id)})
    rev_row = rev.mappings().first()

    return {
        "value": row["total_documents"] if row else 0,
        "label": "Documents Papyrus",
        "unit": "documents",
        "trend": None,
        "details": {
            "draft": row["draft_count"] if row else 0,
            "in_review": row["in_review_count"] if row else 0,
            "ready": row["ready_count"] if row else 0,
            "archived": row["archived_count"] if row else 0,
            "revisions": rev_row["revision_count"] if rev_row else 0,
        },
    }


async def provider_papyrus_by_status(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: Papyrus documents by workflow status."""
    r = await db.execute(text("""
        SELECT status AS name, COUNT(*) AS value
        FROM documents
        WHERE entity_id = :eid AND deleted_at IS NULL
        GROUP BY status
        ORDER BY CASE status
            WHEN 'draft' THEN 1
            WHEN 'in_review' THEN 2
            WHEN 'approved' THEN 3
            WHEN 'published' THEN 4
            WHEN 'obsolete' THEN 5
            WHEN 'archived' THEN 6
            ELSE 7
        END
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_papyrus_by_type(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: Papyrus documents by document type."""
    r = await db.execute(text("""
        SELECT
            COALESCE(dt.code, 'Sans type') AS name,
            COUNT(*) AS value
        FROM documents d
        LEFT JOIN doc_types dt ON dt.id = d.doc_type_id
        WHERE d.entity_id = :eid AND d.deleted_at IS NULL
        GROUP BY COALESCE(dt.code, 'Sans type')
        ORDER BY value DESC, name
        LIMIT 12
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_papyrus_recent_documents(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: most recently updated Papyrus documents."""
    r = await db.execute(text("""
        SELECT
            d.id,
            d.number,
            d.title,
            d.status,
            d.updated_at,
            d.created_at,
            COALESCE(dt.code, '-') AS doc_type_code,
            COALESCE(rv.rev_code, '-') AS current_revision
        FROM documents d
        LEFT JOIN doc_types dt ON dt.id = d.doc_type_id
        LEFT JOIN revisions rv ON rv.id = d.current_revision_id
        WHERE d.entity_id = :eid AND d.deleted_at IS NULL
        ORDER BY COALESCE(d.updated_at, d.created_at) DESC
        LIMIT 15
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "number", "label": "Numero"},
            {"key": "title", "label": "Titre"},
            {"key": "doc_type_code", "label": "Type"},
            {"key": "status", "label": "Statut"},
            {"key": "current_revision", "label": "Revision"},
            {"key": "updated_at", "label": "Mis a jour"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


async def provider_papyrus_forms_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: Papyrus forms, pending external submissions, and failed dispatches."""
    r = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM papyrus_forms WHERE entity_id = :eid AND is_active = TRUE) AS active_forms,
            (SELECT COUNT(*) FROM papyrus_external_links WHERE entity_id = :eid AND is_revoked = FALSE) AS live_links,
            (SELECT COUNT(*) FROM papyrus_external_submissions WHERE entity_id = :eid AND status = 'pending') AS pending_submissions,
            (SELECT COUNT(*) FROM papyrus_dispatch_runs WHERE entity_id = :eid AND status = 'failed') AS failed_dispatches
    """), {"eid": str(entity_id)})
    row = r.mappings().first()
    return {
        "value": row["pending_submissions"] if row else 0,
        "label": "Collecte a traiter",
        "unit": "soumissions",
        "trend": None,
        "details": {
            "forms": row["active_forms"] if row else 0,
            "links": row["live_links"] if row else 0,
            "pending_submissions": row["pending_submissions"] if row else 0,
            "failed_dispatches": row["failed_dispatches"] if row else 0,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Workflow Module — Providers
# ═══════════════════════════════════════════════════════════════════════════════


async def provider_workflow_overview(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """KPI: workflow instance summary."""
    r = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE current_state NOT IN ('completed', 'cancelled', 'rejected')) AS active,
            COUNT(*) FILTER (WHERE current_state = 'completed') AS completed,
            COUNT(*) FILTER (WHERE current_state IN ('cancelled', 'rejected')) AS cancelled,
            COUNT(*) AS total
        FROM workflow_instances
        WHERE entity_id = :eid
    """), {"eid": str(entity_id)})
    row = r.mappings().first()
    return {
        "value": row["active"] if row else 0,
        "label": "Workflows actifs",
        "unit": "instances",
        "details": {
            "active": row["active"] if row else 0,
            "completed": row["completed"] if row else 0,
            "cancelled": row["cancelled"] if row else 0,
            "total": row["total"] if row else 0,
        },
    }


async def provider_workflow_by_definition(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Chart: workflow instances by definition name."""
    r = await db.execute(text("""
        SELECT wd.name AS name, COUNT(*) AS value
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wd.id = wi.definition_id
        WHERE wi.entity_id = :eid
        GROUP BY wd.name ORDER BY value DESC
    """), {"eid": str(entity_id)})
    return {"data": [dict(row) for row in r.mappings().all()]}


async def provider_workflow_pending(
    *, config: dict, tenant_id: UUID, entity_id: UUID | None,
    user: Any, db: AsyncSession,
) -> dict:
    """Table: pending workflow instances awaiting action."""
    r = await db.execute(text("""
        SELECT wd.name AS definition, wi.current_state AS state,
               wi.created_at, wi.entity_type, wi.entity_id AS ref_id
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wd.id = wi.definition_id
        WHERE wi.entity_id = :eid
            AND wi.current_state NOT IN ('completed', 'cancelled', 'rejected')
        ORDER BY wi.created_at DESC LIMIT 15
    """), {"eid": str(entity_id)})
    return {
        "columns": [
            {"key": "definition", "label": "Workflow"},
            {"key": "state", "label": "État"},
            {"key": "entity_type", "label": "Type"},
            {"key": "created_at", "label": "Créé le"},
        ],
        "rows": [dict(row) for row in r.mappings().all()],
    }


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
    # ── Tiers module ──
    "tiers_overview": provider_tiers_overview,
    "tiers_by_type": provider_tiers_by_type,
    "tiers_recent": provider_tiers_recent,
    # ── Users module ──
    "users_overview": provider_users_overview,
    "users_by_role": provider_users_by_role,
    "users_by_group": provider_users_by_group,
    "users_recent_activity": provider_users_recent_activity,
    "users_mfa_stats": provider_users_mfa_stats,
    "users_orphans": provider_users_orphans,
    # ── PackLog module ──
    "packlog_overview": provider_packlog_overview,
    "packlog_requests_by_status": provider_packlog_requests_by_status,
    "packlog_cargo_by_status": provider_packlog_cargo_by_status,
    "packlog_tracking": provider_packlog_tracking,
    "packlog_alerts": provider_packlog_alerts,
    "packlog_catalog_overview": provider_packlog_catalog_overview,
    # ── Support module ──
    "support_overview": provider_support_overview,
    "support_tickets_recent": provider_support_tickets_recent,
    "support_by_status": provider_support_by_status,
    "support_by_type": provider_support_by_type,
    "support_by_priority": provider_support_by_priority,
    "support_trend": provider_support_trend,
    # ── Conformité module (advanced) ──
    "conformite_urgency": provider_conformite_urgency,
    "conformite_by_status": provider_conformite_by_status,
    "conformite_matrix": provider_conformite_matrix,
    "conformite_trend": provider_conformite_trend,
    # ── Planner module (advanced) ──
    "planner_overview": provider_planner_overview,
    "planner_by_type": provider_planner_by_type,
    "planner_by_status": provider_planner_by_status,
    "planner_conflicts_kpi": provider_planner_conflicts_kpi,
    "planner_pax_by_site": provider_planner_pax_by_site,
    "planner_workload_chart": provider_planner_workload_chart,
    # ── Papyrus module ──
    "papyrus_overview": provider_papyrus_overview,
    "papyrus_by_status": provider_papyrus_by_status,
    "papyrus_by_type": provider_papyrus_by_type,
    "papyrus_recent_documents": provider_papyrus_recent_documents,
    "papyrus_forms_overview": provider_papyrus_forms_overview,
    # ── Workflow module ──
    "workflow_overview": provider_workflow_overview,
    "workflow_by_definition": provider_workflow_by_definition,
    "workflow_pending": provider_workflow_pending,
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
