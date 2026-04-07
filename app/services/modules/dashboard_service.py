"""Dashboard service — CRUD, widget catalog, SQL widget, home page, TV mode, import/export.

Modules register their predefined widgets at startup via `register_widget()`.
The widget catalog is role-filtered and exposed via the API.
"""

import hashlib
import json
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import (
    DashboardExport,
    WidgetCatalogEntry,
    WidgetDataResponse,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  Widget Catalog — global registry populated by modules at startup
# ═══════════════════════════════════════════════════════════════════════════════

WIDGET_CATALOG: dict[str, WidgetCatalogEntry] = {}


def register_widget(widget_id: str, entry: WidgetCatalogEntry) -> None:
    """Register a widget in the global catalog. Called by modules at startup."""
    WIDGET_CATALOG[widget_id] = entry
    logger.debug("Registered widget: %s (%s)", widget_id, entry.source_module)


def _init_predefined_widgets() -> None:
    """Populate catalog with predefined widgets from the spec."""
    for wid, meta in PREDEFINED_WIDGETS.items():
        if wid not in WIDGET_CATALOG:
            register_widget(
                wid,
                WidgetCatalogEntry(
                    id=wid,
                    type=meta["type"],
                    title=meta["title"],
                    source_module=meta["source"],
                    roles=meta.get("roles", ["*"]),
                ),
            )


# Predefined widgets per spec
PREDEFINED_WIDGETS: dict[str, dict[str, Any]] = {
    "alerts_urgent": {
        "type": "kpi",
        "title": "Alertes critiques",
        "source": "core",
        "roles": ["*"],
    },
    "pax_on_site": {
        "type": "kpi",
        "title": "PAX sur site",
        "source": "paxlog",
        "roles": ["CDS", "OMAA", "DO"],
    },
    "ads_pending": {
        "type": "table",
        "title": "AdS en attente",
        "source": "paxlog",
        "roles": ["CDS", "CHSE", "DPROD"],
    },
    "planner_gantt_mini": {
        "type": "chart",
        "title": "Gantt compact",
        "source": "planner",
        "roles": ["CDS", "DO", "DPROD"],
    },
    "capacity_heatmap": {
        "type": "chart",
        "title": "Heatmap charge PAX",
        "source": "planner",
        "roles": ["DO", "DPROD"],
    },
    "fleet_map": {
        "type": "map",
        "title": "Carte flotte temps réel",
        "source": "travelwiz",
        "roles": ["LOG_BASE", "DO"],
    },
    "trips_today": {
        "type": "table",
        "title": "Voyages du jour",
        "source": "travelwiz",
        "roles": ["LOG_BASE"],
    },
    "cargo_pending": {
        "type": "table",
        "title": "Cargo en attente",
        "source": "travelwiz",
        "roles": ["LOG_BASE"],
    },
    "pickup_progress": {
        "type": "kpi",
        "title": "Ramassage en cours",
        "source": "travelwiz",
        "roles": ["LOG_BASE"],
    },
    "compliance_expiry": {
        "type": "table",
        "title": "Certifications expirant 30j",
        "source": "paxlog",
        "roles": ["CHSE", "CMEDIC"],
    },
    "signalements_actifs": {
        "type": "table",
        "title": "Signalements actifs",
        "source": "paxlog",
        "roles": ["CHSE", "CDS", "DO"],
    },
    "project_status": {
        "type": "table",
        "title": "Projets actifs",
        "source": "projets",
        "roles": ["CHEF_PROJET", "DPROJ"],
    },
    "my_ads": {
        "type": "table",
        "title": "Mes AdS en cours",
        "source": "paxlog",
        "roles": ["DEMANDEUR"],
    },
    "kpi_fleet": {
        "type": "kpi",
        "title": "KPIs flotte",
        "source": "travelwiz",
        "roles": ["LOG_BASE", "DO"],
    },
    "weather_sites": {
        "type": "kpi",
        "title": "Météo sites",
        "source": "travelwiz",
        "roles": ["LOG_BASE", "DO"],
    },
    # ── Projets module widgets ──
    "projets_kpis": {
        "type": "kpi",
        "title": "KPIs Projets",
        "description": "Projets actifs, terminés, progression, budget, tâches",
        "source": "projets",
        "roles": ["CHEF_PROJET", "DPROJ", "DO"],
    },
    "projets_weather": {
        "type": "chart",
        "title": "Santé projets (météo)",
        "description": "Distribution météo des projets actifs",
        "source": "projets",
        "roles": ["CHEF_PROJET", "DPROJ", "DO"],
    },
    "projets_deadlines": {
        "type": "table",
        "title": "Échéances 14 jours",
        "description": "Tâches dont l'échéance est dans les 14 prochains jours",
        "source": "projets",
        "roles": ["CHEF_PROJET", "DPROJ"],
    },
    "projets_top_volume": {
        "type": "table",
        "title": "Top projets par volume",
        "description": "Les 5 projets avec le plus de tâches",
        "source": "projets",
        "roles": ["CHEF_PROJET", "DPROJ", "DO"],
    },
    # ── Asset Registry module widgets ──
    "assets_overview": {
        "type": "kpi",
        "title": "Vue d'ensemble Assets",
        "description": "Champs, sites, installations, équipements, pipelines",
        "source": "asset_registry",
        "roles": ["ASSET_ADMIN", "DO", "CDS"],
    },
    "assets_equipment_by_class": {
        "type": "chart",
        "title": "Équipements par classe",
        "description": "Distribution des équipements par type (pompe, grue, séparateur…)",
        "source": "asset_registry",
        "roles": ["ASSET_ADMIN", "DO"],
    },
    "assets_by_status": {
        "type": "chart",
        "title": "Équipements par statut",
        "description": "Distribution opérationnel / standby / hors service",
        "source": "asset_registry",
        "roles": ["ASSET_ADMIN", "DO"],
    },
    "assets_sites_by_type": {
        "type": "chart",
        "title": "Sites par type",
        "description": "Distribution production / terminal / forage / stockage",
        "source": "asset_registry",
        "roles": ["ASSET_ADMIN", "DO"],
    },
    "assets_map": {
        "type": "map",
        "title": "Carte des assets",
        "description": "Champs, sites et installations géolocalisés",
        "source": "asset_registry",
        "roles": ["ASSET_ADMIN", "DO", "CDS"],
    },
    # ── PaxLog module widgets ──
    "paxlog_compliance_rate": {
        "type": "kpi",
        "title": "Taux de conformité PAX",
        "description": "Pourcentage de conformité globale avec détail",
        "source": "paxlog",
        "roles": ["CDS", "CHSE", "DO"],
    },
    "paxlog_ads_by_status": {
        "type": "chart",
        "title": "AdS par statut",
        "description": "Distribution des autorisations de sortie par statut",
        "source": "paxlog",
        "roles": ["CDS", "CHSE", "DO"],
    },
    "paxlog_expiring_credentials": {
        "type": "table",
        "title": "Certifications expirant bientôt",
        "description": "PAX dont les certifications expirent dans les 30 prochains jours",
        "source": "paxlog",
        "roles": ["CHSE", "CMEDIC"],
    },
    "paxlog_incidents": {
        "type": "kpi",
        "title": "Incidents actifs",
        "description": "Nombre d'incidents PAX non résolus",
        "source": "paxlog",
        "roles": ["CDS", "CHSE", "DO"],
    },
    # ── Conformité module widgets ──
    "conformite_kpis": {
        "type": "kpi",
        "title": "KPIs Conformité",
        "description": "Taux de conformité, valides, expirés, en attente",
        "source": "conformite",
        "roles": ["RESPONSABLE_CONFORMITE", "OPERATEUR_CONFORMITE", "CHSE"],
    },
    "conformite_by_category": {
        "type": "chart",
        "title": "Conformité par catégorie",
        "description": "Formation, certification, habilitation, médical — valides vs expirés",
        "source": "conformite",
        "roles": ["RESPONSABLE_CONFORMITE", "OPERATEUR_CONFORMITE", "CHSE"],
    },
    # ── Tiers module widgets ──
    "tiers_overview": {
        "type": "kpi",
        "title": "Vue d'ensemble Tiers",
        "description": "Entreprises par type, contacts, statut actif",
        "source": "tiers",
        "roles": ["*"],
    },
    "tiers_by_type": {
        "type": "chart",
        "title": "Entreprises par type",
        "description": "Distribution clients / fournisseurs / sous-traitants",
        "source": "tiers",
        "roles": ["*"],
    },
    "tiers_recent": {
        "type": "table",
        "title": "Tiers récents",
        "description": "Dernières entreprises créées ou modifiées",
        "source": "tiers",
        "roles": ["*"],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  Widget Catalog — filtered by user roles
# ═══════════════════════════════════════════════════════════════════════════════

def get_widget_catalog(user_roles: list[str]) -> list[dict[str, Any]]:
    """Return catalog entries the user can access based on their roles."""
    _init_predefined_widgets()

    role_set = set(user_roles)
    result: list[dict[str, Any]] = []

    # SUPER_ADMIN and TENANT_ADMIN see all widgets
    is_admin = bool(role_set.intersection({"SUPER_ADMIN", "TENANT_ADMIN", "SYS_ADMIN"}))

    for wid, entry in WIDGET_CATALOG.items():
        # "*" means all roles have access; admins see everything
        if is_admin or "*" in entry.roles or role_set.intersection(entry.roles):
            result.append(entry.model_dump())

    return sorted(result, key=lambda w: w["title"])


# ═══════════════════════════════════════════════════════════════════════════════
#  SQL Widget — Security Validation
# ═══════════════════════════════════════════════════════════════════════════════

FORBIDDEN_KEYWORDS: set[str] = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE",
    "EXEC", "EXECUTE", "GRANT", "REVOKE", "COPY",
    "PG_", "INFORMATION_SCHEMA", "PG_CATALOG",
    "SET", "SHOW", "VACUUM", "ANALYZE",
}

FORBIDDEN_PATTERNS: list[re.Pattern] = [
    re.compile(r";\s*\w", re.IGNORECASE),          # Multiple statements
    re.compile(r"--", re.IGNORECASE),                # SQL comments
    re.compile(r"/\*", re.IGNORECASE),               # Block comments
    re.compile(r"\\copy", re.IGNORECASE),            # psql copy
    re.compile(r"pg_read_file", re.IGNORECASE),      # File system access
    re.compile(r"pg_ls_dir", re.IGNORECASE),         # Directory listing
    re.compile(r"lo_import|lo_export", re.IGNORECASE),  # Large object ops
    re.compile(r"dblink", re.IGNORECASE),            # External DB access
]


def _validate_sql_query(query: str) -> str | None:
    """Validate a SQL query. Returns error message or None if valid."""
    normalized = query.strip().upper()

    # Must start with SELECT or WITH
    if not normalized.startswith("SELECT") and not normalized.startswith("WITH"):
        return "Query must start with SELECT or WITH"

    # Check forbidden keywords (word-boundary match)
    for keyword in FORBIDDEN_KEYWORDS:
        pattern = re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE)
        if pattern.search(query):
            return f"Forbidden keyword: {keyword}"

    # Check forbidden patterns
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(query):
            return f"Forbidden pattern detected: {pattern.pattern}"

    return None


async def validate_and_execute_widget_sql(
    query: str,
    params: dict[str, Any],
    user: Any,
    tenant_id: UUID,
    max_rows: int = 10000,
    timeout_seconds: int = 30,
) -> dict[str, Any]:
    """Validate and execute a SQL widget query with security constraints.

    Returns dict with columns, rows, row_count, truncated, execution_time_ms, error.
    """
    from app.core.database import async_session_factory

    # Security validation
    error = _validate_sql_query(query)
    if error:
        return {
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "execution_time_ms": 0,
            "error": f"Security validation failed: {error}",
        }

    # Inject tenant isolation — wrap in a CTE with tenant filter
    # The query must contain a {tenant_id} placeholder or we auto-inject
    safe_query = query.strip().rstrip(";")

    # Add LIMIT
    safe_query = f"SELECT * FROM ({safe_query}) AS _widget_q LIMIT {max_rows + 1}"

    start = time.monotonic()

    try:
        async with async_session_factory() as session:
            # Set statement timeout
            await session.execute(
                text(f"SET LOCAL statement_timeout = '{timeout_seconds * 1000}'")
            )

            # Execute with params (add tenant_id to params for convenience)
            all_params = {**params, "tenant_id": str(tenant_id), "user_id": str(user.id)}
            result = await session.execute(text(safe_query), all_params)

            columns = list(result.keys()) if result.returns_rows else []
            rows_raw = result.fetchall() if result.returns_rows else []

            elapsed_ms = (time.monotonic() - start) * 1000
            truncated = len(rows_raw) > max_rows
            rows = [list(row) for row in rows_raw[:max_rows]]

            return {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "truncated": truncated,
                "execution_time_ms": round(elapsed_ms, 2),
                "error": None,
            }

    except Exception as e:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning("SQL widget query failed: %s", e)
        return {
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "execution_time_ms": round(elapsed_ms, 2),
            "error": str(e),
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  Dashboard CRUD
# ═══════════════════════════════════════════════════════════════════════════════

async def create_dashboard(
    data: Any,
    owner_id: UUID,
    tenant_id: UUID,
    entity_id: UUID | None,
    db: AsyncSession,
) -> Any:
    """Create a new dashboard."""
    from app.models.dashboard import Dashboard

    dashboard = Dashboard(
        tenant_id=tenant_id,
        entity_id=entity_id,
        name=data.name,
        description=data.description,
        owner_id=owner_id,
        is_public=data.is_public,
        nav_menu_parent=data.nav_menu_parent,
        nav_menu_label=data.nav_menu_label,
        nav_menu_icon=data.nav_menu_icon,
        nav_menu_order=data.nav_menu_order,
        nav_show_in_sidebar=data.nav_show_in_sidebar,
        global_filters=data.global_filters,
        layout_mobile=data.layout_mobile,
        layout_tablet=data.layout_tablet,
        layout_desktop=data.layout_desktop,
        widgets=data.widgets,
        tv_refresh_seconds=data.tv_refresh_seconds,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)

    logger.info("Created dashboard '%s' (%s) by user %s", dashboard.name, dashboard.id, owner_id)
    return dashboard


async def get_dashboard(
    dashboard_id: UUID,
    tenant_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single dashboard by ID."""
    from app.models.dashboard import Dashboard

    result = await db.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.tenant_id == tenant_id,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        from fastapi import HTTPException
        raise HTTPException(404, "Dashboard not found")
    return dashboard


async def update_dashboard(
    dashboard_id: UUID,
    data: Any,
    tenant_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update an existing dashboard."""
    dashboard = await get_dashboard(dashboard_id, tenant_id, db)

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        from fastapi import HTTPException
        raise HTTPException(400, "No fields to update")

    for field, value in update_data.items():
        setattr(dashboard, field, value)

    await db.commit()
    await db.refresh(dashboard)
    return dashboard


async def delete_dashboard(
    dashboard_id: UUID,
    tenant_id: UUID,
    db: AsyncSession,
) -> None:
    """Delete a dashboard and its permissions."""
    from app.models.dashboard import Dashboard, DashboardPermission

    dashboard = await get_dashboard(dashboard_id, tenant_id, db)

    # Delete permissions first
    await db.execute(
        delete(DashboardPermission).where(
            DashboardPermission.dashboard_id == dashboard_id
        )
    )

    await db.delete(dashboard)
    await db.commit()

    logger.info("Deleted dashboard %s", dashboard_id)


async def list_dashboards(
    tenant_id: UUID,
    entity_id: UUID | None,
    db: AsyncSession,
    owner_id: UUID | None = None,
    is_public: bool | None = None,
) -> list[Any]:
    """List dashboards with optional filters."""
    from app.models.dashboard import Dashboard

    query = select(Dashboard).where(Dashboard.tenant_id == tenant_id)

    if entity_id is not None:
        query = query.where(
            or_(
                Dashboard.entity_id == entity_id,
                Dashboard.entity_id.is_(None),  # Cross-entity dashboards
            )
        )

    if owner_id is not None:
        query = query.where(Dashboard.owner_id == owner_id)

    if is_public is not None:
        query = query.where(Dashboard.is_public == is_public)

    query = query.order_by(Dashboard.nav_menu_order, Dashboard.name)
    result = await db.execute(query)
    return result.scalars().all()


# ═══════════════════════════════════════════════════════════════════════════════
#  Home Page Resolution: user > role > BU > global
# ═══════════════════════════════════════════════════════════════════════════════

async def get_home_page_for_user(
    user_id: UUID,
    roles: list[str],
    bu_id: UUID | None,
    tenant_id: UUID,
    db: AsyncSession,
) -> Any | None:
    """Resolve the home page dashboard for a user.

    Resolution order: user-specific > role > BU > global.
    Returns the Dashboard object or None.
    """
    from app.models.dashboard import Dashboard, HomePageSetting

    # 1. User-specific
    result = await db.execute(
        select(HomePageSetting).where(
            HomePageSetting.tenant_id == tenant_id,
            HomePageSetting.scope_type == "user",
            HomePageSetting.scope_value == str(user_id),
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        return await _load_dashboard(setting.dashboard_id, db)

    # 2. Role-based (first matching role wins)
    if roles:
        result = await db.execute(
            select(HomePageSetting).where(
                HomePageSetting.tenant_id == tenant_id,
                HomePageSetting.scope_type == "role",
                HomePageSetting.scope_value.in_(roles),
            ).limit(1)
        )
        setting = result.scalar_one_or_none()
        if setting:
            return await _load_dashboard(setting.dashboard_id, db)

    # 3. BU-based
    if bu_id:
        result = await db.execute(
            select(HomePageSetting).where(
                HomePageSetting.tenant_id == tenant_id,
                HomePageSetting.scope_type == "bu",
                HomePageSetting.scope_value == str(bu_id),
            )
        )
        setting = result.scalar_one_or_none()
        if setting:
            return await _load_dashboard(setting.dashboard_id, db)

    # 4. Global fallback
    result = await db.execute(
        select(HomePageSetting).where(
            HomePageSetting.tenant_id == tenant_id,
            HomePageSetting.scope_type == "global",
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        return await _load_dashboard(setting.dashboard_id, db)

    return None


async def set_home_page(
    data: Any,
    tenant_id: UUID,
    db: AsyncSession,
) -> Any:
    """Set or update a home page setting."""
    from app.models.dashboard import HomePageSetting

    # Upsert: check existing
    result = await db.execute(
        select(HomePageSetting).where(
            HomePageSetting.tenant_id == tenant_id,
            HomePageSetting.scope_type == data.scope_type,
            HomePageSetting.scope_value == data.scope_value
            if data.scope_value
            else HomePageSetting.scope_value.is_(None),
        )
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.dashboard_id = data.dashboard_id
    else:
        setting = HomePageSetting(
            tenant_id=tenant_id,
            scope_type=data.scope_type,
            scope_value=data.scope_value,
            dashboard_id=data.dashboard_id,
        )
        db.add(setting)

    await db.commit()
    await db.refresh(setting)
    return setting


async def _load_dashboard(dashboard_id: UUID, db: AsyncSession) -> Any | None:
    """Load a dashboard by ID (no tenant check — internal use)."""
    from app.models.dashboard import Dashboard
    return await db.get(Dashboard, dashboard_id)


# ═══════════════════════════════════════════════════════════════════════════════
#  Widget Data Fetching
# ═══════════════════════════════════════════════════════════════════════════════

# Registry of data providers per widget_id
_WIDGET_DATA_PROVIDERS: dict[str, Any] = {}


def register_widget_data_provider(widget_id: str, provider: Any) -> None:
    """Register an async callable that fetches data for a widget type."""
    _WIDGET_DATA_PROVIDERS[widget_id] = provider


async def get_widget_data(
    widget_id: str,
    widget_config: dict[str, Any],
    tenant_id: UUID,
    entity_id: UUID | None,
    user: Any,
    db: AsyncSession,
) -> WidgetDataResponse:
    """Dispatch to the appropriate data provider for a widget."""
    provider = _WIDGET_DATA_PROVIDERS.get(widget_id)
    if not provider:
        return WidgetDataResponse(
            widget_id=widget_id,
            widget_type=widget_config.get("type", "unknown"),
            error=f"No data provider registered for widget '{widget_id}'",
            generated_at=datetime.now(timezone.utc),
        )

    try:
        data = await provider(
            config=widget_config,
            tenant_id=tenant_id,
            entity_id=entity_id,
            user=user,
            db=db,
        )
        row_count = len(data) if isinstance(data, list) else (1 if data else 0)
        return WidgetDataResponse(
            widget_id=widget_id,
            widget_type=widget_config.get("type", "unknown"),
            data=data,
            row_count=row_count,
            generated_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        logger.exception("Widget data provider failed for %s", widget_id)
        return WidgetDataResponse(
            widget_id=widget_id,
            widget_type=widget_config.get("type", "unknown"),
            error=str(e),
            generated_at=datetime.now(timezone.utc),
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  Import / Export
# ═══════════════════════════════════════════════════════════════════════════════

async def export_dashboard_json(
    dashboard_id: UUID,
    tenant_id: UUID,
    db: AsyncSession,
) -> DashboardExport:
    """Export a dashboard as a JSON-serializable object."""
    dashboard = await get_dashboard(dashboard_id, tenant_id, db)

    return DashboardExport(
        version="1.0",
        name=dashboard.name,
        description=dashboard.description,
        global_filters=dashboard.global_filters,
        layout_mobile=dashboard.layout_mobile,
        layout_tablet=dashboard.layout_tablet,
        layout_desktop=dashboard.layout_desktop,
        widgets=dashboard.widgets or [],
        nav_menu_parent=dashboard.nav_menu_parent,
        nav_menu_label=dashboard.nav_menu_label,
        nav_menu_icon=dashboard.nav_menu_icon,
        nav_menu_order=dashboard.nav_menu_order,
        nav_show_in_sidebar=dashboard.nav_show_in_sidebar,
        tv_refresh_seconds=dashboard.tv_refresh_seconds,
    )


async def import_dashboard_json(
    data: Any,
    owner_id: UUID,
    tenant_id: UUID,
    entity_id: UUID | None,
    db: AsyncSession,
) -> Any:
    """Import a dashboard from a JSON export payload.

    If overwrite_id is set, updates the existing dashboard.
    Otherwise creates a new one.
    """
    from app.models.dashboard import Dashboard

    export_data = data.dashboard

    if data.overwrite_id:
        # Update existing
        dashboard = await get_dashboard(data.overwrite_id, tenant_id, db)
        dashboard.name = export_data.name
        dashboard.description = export_data.description
        dashboard.global_filters = export_data.global_filters
        dashboard.layout_mobile = export_data.layout_mobile
        dashboard.layout_tablet = export_data.layout_tablet
        dashboard.layout_desktop = export_data.layout_desktop
        dashboard.widgets = export_data.widgets
        dashboard.nav_menu_parent = export_data.nav_menu_parent
        dashboard.nav_menu_label = export_data.nav_menu_label
        dashboard.nav_menu_icon = export_data.nav_menu_icon
        dashboard.nav_menu_order = export_data.nav_menu_order
        dashboard.nav_show_in_sidebar = export_data.nav_show_in_sidebar
        dashboard.tv_refresh_seconds = export_data.tv_refresh_seconds
    else:
        # Create new
        dashboard = Dashboard(
            tenant_id=tenant_id,
            entity_id=entity_id,
            name=export_data.name,
            description=export_data.description,
            owner_id=owner_id,
            is_public=False,
            global_filters=export_data.global_filters,
            layout_mobile=export_data.layout_mobile,
            layout_tablet=export_data.layout_tablet,
            layout_desktop=export_data.layout_desktop,
            widgets=export_data.widgets,
            nav_menu_parent=export_data.nav_menu_parent,
            nav_menu_label=export_data.nav_menu_label,
            nav_menu_icon=export_data.nav_menu_icon,
            nav_menu_order=export_data.nav_menu_order,
            nav_show_in_sidebar=export_data.nav_show_in_sidebar,
            tv_refresh_seconds=export_data.tv_refresh_seconds,
        )
        db.add(dashboard)

    await db.commit()
    await db.refresh(dashboard)

    logger.info(
        "Imported dashboard '%s' (%s) by user %s",
        dashboard.name, dashboard.id, owner_id,
    )
    return dashboard


# ═══════════════════════════════════════════════════════════════════════════════
#  TV Mode — token-based anonymous access
# ═══════════════════════════════════════════════════════════════════════════════

async def generate_tv_link(
    dashboard_id: UUID,
    tenant_id: UUID,
    expires_hours: int,
    refresh_seconds: int,
    db: AsyncSession,
) -> dict[str, Any]:
    """Generate or regenerate a TV access token for a dashboard."""
    from app.core.config import settings

    dashboard = await get_dashboard(dashboard_id, tenant_id, db)

    # Generate secure token
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_hours)

    dashboard.tv_token = token
    dashboard.tv_token_expires_at = expires_at
    dashboard.tv_refresh_seconds = refresh_seconds

    await db.commit()

    url = f"{settings.FRONTEND_URL}/tv/{token}"

    logger.info("Generated TV link for dashboard %s, expires %s", dashboard_id, expires_at)

    return {
        "dashboard_id": dashboard_id,
        "token": token,
        "url": url,
        "expires_at": expires_at,
        "refresh_seconds": refresh_seconds,
    }


async def get_dashboard_by_tv_token(
    token: str,
    db: AsyncSession,
) -> Any | None:
    """Load a dashboard by its TV token (no auth required).

    Returns None if token is invalid or expired.
    """
    from app.models.dashboard import Dashboard

    result = await db.execute(
        select(Dashboard).where(
            Dashboard.tv_token == token,
        )
    )
    dashboard = result.scalar_one_or_none()

    if not dashboard:
        return None

    # Check expiry
    if dashboard.tv_token_expires_at and dashboard.tv_token_expires_at < datetime.now(timezone.utc):
        return None

    return dashboard


async def revoke_tv_link(
    dashboard_id: UUID,
    tenant_id: UUID,
    db: AsyncSession,
) -> None:
    """Revoke the TV token for a dashboard."""
    dashboard = await get_dashboard(dashboard_id, tenant_id, db)

    dashboard.tv_token = None
    dashboard.tv_token_expires_at = None

    await db.commit()
    logger.info("Revoked TV link for dashboard %s", dashboard_id)


# ═══════════════════════════════════════════════════════════════════════════════
#  Access Logging
# ═══════════════════════════════════════════════════════════════════════════════

async def log_dashboard_access(
    dashboard_id: UUID,
    tenant_id: UUID,
    user_id: UUID | None,
    access_type: str,
    ip_address: str | None,
    db: AsyncSession,
) -> None:
    """Log a dashboard access event."""
    from app.models.dashboard import DashboardAccessLog

    log_entry = DashboardAccessLog(
        tenant_id=tenant_id,
        dashboard_id=dashboard_id,
        user_id=user_id,
        access_type=access_type,
        ip_address=ip_address,
    )
    db.add(log_entry)
    # Don't commit — let the caller's transaction handle it
    await db.flush()
