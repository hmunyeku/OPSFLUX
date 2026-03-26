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
            pp.first_name || ' ' || pp.last_name AS pax_name,
            pp.badge_number,
            ct.name AS credential_name,
            ct.category,
            pc.expiry_date,
            pc.status,
            pc.expiry_date - CURRENT_DATE AS days_remaining
        FROM pax_credentials pc
        JOIN pax_profiles pp ON pp.id = pc.pax_id
        JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pp.entity_id = :entity_id
          AND pp.archived = FALSE
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
            pp.first_name || ' ' || pp.last_name AS pax_name,
            a.name AS asset_name,
            pi.created_at
        FROM pax_incidents pi
        LEFT JOIN pax_profiles pp ON pp.id = pi.pax_id
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
                COUNT(DISTINCT ap.pax_id)::int AS load,
                COALESCE(asset.pax_capacity, 0) AS capacity,
                CASE WHEN COALESCE(asset.pax_capacity, 0) > 0
                     THEN ROUND(
                         (COUNT(DISTINCT ap.pax_id)::numeric
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
#  Registration
# ═══════════════════════════════════════════════════════════════════════════════

_PROVIDER_MAP: dict[str, Any] = {
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
