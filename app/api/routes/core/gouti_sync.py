"""Gouti sync routes — synchronize project data from external Gouti API into local Projets module."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import Project, Setting, User
from app.services.connectors.gouti_connector import GoutiConnector, create_gouti_connector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gouti", tags=["gouti-sync"])

GOUTI_SETTINGS_PREFIX = "integration.gouti"


# ── Response schemas ──────────────────────────────────────────────────────


class SyncResult(BaseModel):
    synced: int
    created: int
    updated: int
    errors: list[str]


class SyncStatus(BaseModel):
    last_sync_at: str | None
    project_count: int
    connector_configured: bool
    # Capability matrix probed at connector test time. The frontend uses
    # ``writes`` to decide which fields are read-only on Gouti-imported
    # projects, and ``reads`` to badge endpoints that can be fetched.
    capabilities: dict | None = None
    # Auto-sync settings surfaced so the UI can show "next run in N min".
    auto_sync_enabled: bool = False
    auto_sync_interval_minutes: int = 60
    # Whether the user has saved a selection (used by the split-button UI
    # to decide whether main click = force sync vs open selection modal).
    has_selection: bool = False


class CatalogTask(BaseModel):
    gouti_id: str
    name: str
    status: str | None = None
    progress: int | None = None


class CatalogProject(BaseModel):
    gouti_id: str
    code: str
    name: str
    status: str | None = None
    progress: int | None = None
    manager_name: str | None = None
    target_date: str | None = None
    task_count: int = 0
    tasks: list[CatalogTask] = []


class TaskSelection(BaseModel):
    mode: str = "all"  # "all" | "none" | "some"
    task_ids: list[str] = []  # populated when mode = "some"


class ProjectSelection(BaseModel):
    include: bool = True
    tasks: TaskSelection = TaskSelection()


class SyncSelection(BaseModel):
    projects: dict[str, ProjectSelection] = {}  # keyed by gouti_id


class SingleProjectSyncResult(BaseModel):
    project_id: str
    local_id: str
    action: str  # "created" | "updated"
    reports_synced: int
    errors: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────


async def _get_gouti_settings(db: AsyncSession, entity_id: UUID) -> dict[str, str]:
    """Fetch all integration.gouti.* settings from the Setting table."""
    result = await db.execute(
        select(Setting).where(
            Setting.key.startswith(GOUTI_SETTINGS_PREFIX + "."),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    settings: dict[str, str] = {}
    for s in result.scalars().all():
        # "integration.gouti.base_url" -> "base_url"
        field = s.key.replace(GOUTI_SETTINGS_PREFIX + ".", "")
        val = s.value.get("v", "") if isinstance(s.value, dict) else str(s.value)
        settings[field] = str(val) if val else ""
    return settings


def _build_connector(settings: dict[str, str]) -> GoutiConnector:
    """Create a GoutiConnector from settings, validating required fields.

    Accepts either (client_id + client_secret) for full OAuth flow or
    (client_id + cached token) for token-based auth — matching the logic
    in core.integrations._test_gouti.
    """
    client_id = settings.get("client_id", "")
    client_secret = settings.get("client_secret", "")
    token = settings.get("token", "")
    entity_code = settings.get("entity_code", "")

    if not client_id:
        raise HTTPException(
            status_code=400,
            detail="Gouti non configuré : client_id requis. "
                   "Configurez-le dans Paramètres > Intégrations > Gouti.",
        )
    if not client_secret and not token:
        raise HTTPException(
            status_code=400,
            detail="Gouti non configuré : client_secret ou token requis. "
                   "Configurez les credentials dans Paramètres > Intégrations > Gouti.",
        )
    if not entity_code:
        raise HTTPException(
            status_code=400,
            detail="Gouti non configuré : entity_code requis.",
        )

    return create_gouti_connector(settings)


def _make_external_ref(gouti_project_id: str) -> str:
    """Build the canonical external_ref value for a Gouti project."""
    return f"gouti:{gouti_project_id}"


def _map_gouti_status(gouti_status: str | None) -> str:
    """Map Gouti project status to local Project status enum.

    Gouti returns long French labels like "En cours de réalisation",
    "Terminé", "Annulé", "En attente", etc. We normalise via substring
    match since the exact wording varies between projects.
    """
    if not gouti_status:
        return "draft"
    s = gouti_status.lower().strip()
    # Order matters: more specific keywords first
    if "annul" in s or "cancel" in s:
        return "cancelled"
    if "termin" in s or "closed" in s or "complete" in s or "achev" in s:
        return "completed"
    if "attente" in s or "hold" in s or "suspen" in s or "pause" in s:
        return "on_hold"
    if "cours" in s or "realis" in s or "réalis" in s or "active" in s or "actif" in s or "in progress" in s:
        return "active"
    if "planif" in s or "planned" in s or "prévu" in s or "prevu" in s:
        return "planned"
    if "brouillon" in s or "draft" in s or "initi" in s:
        return "draft"
    return "draft"


def _map_gouti_priority(gouti_priority: str | None) -> str:
    """Map Gouti priority to local Project priority enum."""
    if not gouti_priority:
        return "medium"
    mapping = {
        "low": "low",
        "basse": "low",
        "medium": "medium",
        "moyenne": "medium",
        "high": "high",
        "haute": "high",
        "critical": "critical",
        "critique": "critical",
    }
    return mapping.get(gouti_priority.lower().strip(), "medium")


def _parse_gouti_date(value: str | None) -> datetime | None:
    """Parse a date string from Gouti into a timezone-aware datetime."""
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


async def _upsert_project_from_gouti(
    db: AsyncSession,
    entity_id: UUID,
    gouti_data: dict,
) -> tuple[Project, str]:
    """Upsert a single project from Gouti data. Returns (project, action) where action is 'created' or 'updated'."""
    # Gouti identifiers. Gouti's /projects returns PascalCase keys (Ref,
    # Name, Status, ...) with no "id" field — the dict key is the ID, and
    # ``_extract_items`` surfaces it as ``_id``. Fall back to other casings
    # in case a different endpoint returns a different shape.
    gouti_id = str(
        gouti_data.get("_id")
        or gouti_data.get("Ref")
        or gouti_data.get("ref_pr")
        or gouti_data.get("id")
        or gouti_data.get("Id")
        or gouti_data.get("ID")
        or gouti_data.get("project_id")
        or gouti_data.get("projectId")
        or ""
    )
    if not gouti_id:
        raise ValueError("Projet Gouti sans identifiant")

    external_ref = _make_external_ref(gouti_id)

    # Look up existing project by external_ref within the entity
    result = await db.execute(
        select(Project).where(
            Project.entity_id == entity_id,
            Project.external_ref == external_ref,
        )
    )
    existing = result.scalars().first()

    # ── Field extraction — Gouti /projects returns PascalCase English keys ─
    # Verified empirically via /gouti/debug/raw-projects against a real entity:
    # {Name, Ref, Status, Description, Weather, Trend, Tasks_progress,
    #  Start_date, Target_date, Project_manager: {ref_us, name_us}, ...}
    name = (
        gouti_data.get("Name")
        or gouti_data.get("name_pr")
        or gouti_data.get("name")
        or gouti_data.get("title")
        or f"Gouti Project {gouti_id}"
    )
    code = (
        gouti_data.get("Ref")
        or gouti_data.get("ref_pr")
        or gouti_data.get("code")
        or f"GOU-{gouti_id}"
    )
    description = (
        gouti_data.get("Description")
        or gouti_data.get("description_pr")
        or gouti_data.get("description")
    )
    status = _map_gouti_status(
        gouti_data.get("Status")
        or gouti_data.get("status_pr")
        or gouti_data.get("status")
    )
    # Gouti uses Criticality (1-5) for priority-ish, Trend for direction.
    # Map criticality: 1=critical, 2=high, 3=medium, 4-5=low.
    crit_raw = gouti_data.get("Criticality") or gouti_data.get("criticality") or ""
    try:
        crit_int = int(str(crit_raw).strip()) if crit_raw else 0
    except ValueError:
        crit_int = 0
    if crit_int == 1:
        priority = "critical"
    elif crit_int == 2:
        priority = "high"
    elif crit_int == 3:
        priority = "medium"
    elif crit_int >= 4:
        priority = "low"
    else:
        priority = _map_gouti_priority(gouti_data.get("priority"))

    # Gouti "Tasks_progress" is a string like "91%" — strip the % sign.
    progress_raw = gouti_data.get("Tasks_progress") or gouti_data.get("progress") or 0
    if isinstance(progress_raw, str):
        progress_raw = progress_raw.replace("%", "").strip()
    try:
        progress = int(float(progress_raw))
    except (ValueError, TypeError):
        progress = 0
    progress = max(0, min(100, progress))

    start_date = _parse_gouti_date(
        gouti_data.get("Start_date")
        or gouti_data.get("start_date")
        or gouti_data.get("startDate")
    )
    end_date = _parse_gouti_date(
        gouti_data.get("Target_date")
        or gouti_data.get("end_date")
        or gouti_data.get("endDate")
    )
    budget_raw = gouti_data.get("budget")
    budget = None
    if budget_raw is not None:
        try:
            budget = float(budget_raw)
        except (ValueError, TypeError):
            budget = None

    # Gouti Weather values are lowercase English: "sunny"/"cloudy"/"rain"/"storm".
    # Normalise to OpsFlux canonical: sunny/cloudy/rainy/stormy.
    weather_raw = str(gouti_data.get("Weather") or gouti_data.get("weather") or "sunny").lower().strip()
    weather_map = {
        "sunny": "sunny", "sun": "sunny", "ensoleille": "sunny",
        "cloudy": "cloudy", "cloud": "cloudy", "nuageux": "cloudy",
        "rain": "rainy", "rainy": "rainy", "pluvieux": "rainy",
        "storm": "stormy", "stormy": "stormy", "orageux": "stormy",
    }
    weather = weather_map.get(weather_raw, "sunny")

    if existing:
        # Update existing project
        existing.name = name
        existing.code = code
        existing.description = description
        existing.status = status
        existing.priority = priority
        existing.progress = progress
        existing.weather = weather
        existing.start_date = start_date
        existing.end_date = end_date
        existing.budget = budget
        return existing, "updated"
    else:
        # Create new project
        project = Project(
            entity_id=entity_id,
            code=code,
            name=name,
            description=description,
            status=status,
            priority=priority,
            progress=progress,
            weather=weather,
            start_date=start_date,
            end_date=end_date,
            budget=budget,
            external_ref=external_ref,
        )
        db.add(project)
        return project, "created"


async def _save_setting(db: AsyncSession, entity_id: UUID, key: str, value: str) -> None:
    """Upsert a single setting."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = {"v": value}
    else:
        db.add(Setting(key=key, value={"v": value}, scope="entity", scope_id=str(entity_id)))


# ── Routes ────────────────────────────────────────────────────────────────


@router.post("/sync", response_model=SyncResult)
async def sync_all_projects(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a full sync of all projects from Gouti into the local Projets table.

    Reads Gouti credentials from integration.gouti.* settings, fetches all projects,
    and upserts them locally using external_ref to track origin.
    """
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)

    # Fetch projects from Gouti
    try:
        gouti_projects = await connector.get_projects()
    except Exception as exc:
        logger.error("Gouti sync — failed to fetch projects: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de récupérer les projets depuis Gouti : {str(exc)[:300]}",
        )

    created = 0
    updated = 0
    errors: list[str] = []

    for gp in gouti_projects:
        try:
            _project, action = await _upsert_project_from_gouti(db, entity_id, gp)
            if action == "created":
                created += 1
            else:
                updated += 1
        except Exception as exc:
            gouti_id = gp.get("id") or gp.get("project_id") or "?"
            msg = f"Erreur projet Gouti {gouti_id}: {str(exc)[:200]}"
            logger.warning("Gouti sync — %s", msg)
            errors.append(msg)

    # Commit all changes in a single transaction
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error("Gouti sync — commit failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la sauvegarde : {str(exc)[:300]}",
        )

    # Record last sync timestamp
    now_iso = datetime.now(timezone.utc).isoformat()
    await _save_setting(db, entity_id, f"{GOUTI_SETTINGS_PREFIX}.last_sync_at", now_iso)
    await _save_setting(db, entity_id, f"{GOUTI_SETTINGS_PREFIX}.last_sync_count", str(created + updated))
    await db.commit()

    logger.info(
        "Gouti sync completed — created=%d, updated=%d, errors=%d (user=%s)",
        created, updated, len(errors), current_user.id,
    )

    return SyncResult(
        synced=created + updated,
        created=created,
        updated=updated,
        errors=errors,
    )


@router.get("/status", response_model=SyncStatus)
async def get_sync_status(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last Gouti sync timestamp and project count."""
    gouti_settings = await _get_gouti_settings(db, entity_id)

    last_sync_at = gouti_settings.get("last_sync_at") or None

    # Count local projects that originated from Gouti
    count_result = await db.execute(
        select(sqla_func.count()).select_from(Project).where(
            Project.entity_id == entity_id,
            Project.external_ref.startswith("gouti:"),
            Project.archived == False,
        )
    )
    project_count = count_result.scalar() or 0

    # Determine if the connector is configured.
    # Gouti accepts either (client_id + client_secret) for full OAuth flow, or
    # (client_id + cached token) for token-based auth. Align with _test_gouti
    # which validates the same way — requiring both secret and token here would
    # incorrectly report "not configured" for token-auth setups.
    has_credentials = bool(
        gouti_settings.get("client_secret") or gouti_settings.get("token")
    )
    connector_configured = bool(gouti_settings.get("client_id")) and has_credentials

    # Load probed capabilities (fallback to static defaults if never tested)
    from app.services.connectors.gouti_capabilities import load_capabilities
    capabilities = await load_capabilities(db, entity_id)

    # Auto-sync settings
    auto_sync_enabled = (gouti_settings.get("auto_sync_enabled") or "").lower() in ("1", "true", "on", "yes")
    try:
        auto_sync_interval = int(gouti_settings.get("auto_sync_interval_minutes") or 60)
    except (TypeError, ValueError):
        auto_sync_interval = 60

    # Check whether a selection has been saved for this entity
    selection = await _load_selection(db, entity_id)
    has_selection = bool(selection and selection.get("projects"))

    return SyncStatus(
        last_sync_at=last_sync_at,
        project_count=project_count,
        connector_configured=connector_configured,
        capabilities=capabilities,
        auto_sync_enabled=auto_sync_enabled,
        auto_sync_interval_minutes=auto_sync_interval,
        has_selection=has_selection,
    )


# ── Selection storage helpers ─────────────────────────────────────────────


async def _load_selection(db: AsyncSession, entity_id: UUID) -> dict:
    """Fetch the saved sync selection for this entity, or {} if none."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.sync_selection",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row and isinstance(row.value, dict):
        return row.value
    return {}


async def _save_selection(db: AsyncSession, entity_id: UUID, selection: dict) -> None:
    """Persist the sync selection as integration.gouti.sync_selection."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.sync_selection",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = selection
    else:
        db.add(Setting(
            key="integration.gouti.sync_selection",
            value=selection,
            scope="entity",
            scope_id=str(entity_id),
        ))
    await db.commit()


# ── Catalog filters ──────────────────────────────────────────────────────


def _project_matches_filters(gp: dict, filters: dict) -> bool:
    """Check whether a raw Gouti project passes the given filter dict.

    filters keys (all optional):
      - year: int — matches Start_date/Target_date year
      - category_ids: list[str] — any-match on Enterprise_categories
      - status: list[str] — substring match on canonical status
      - manager_id: str — Project_manager.ref_us match
      - criticality: list[int] — Criticality match
      - search: str — name/ref substring (case-insensitive)
    """
    # Year (start year OR target year)
    year = filters.get("year")
    if year:
        def _y(d):
            if not d:
                return None
            try:
                return int(str(d)[:4])
            except ValueError:
                return None
        years = {_y(gp.get("Start_date")), _y(gp.get("Target_date"))}
        years.discard(None)
        if int(year) not in years:
            return False

    # Enterprise categories (étiquettes) — any match
    wanted_cats = filters.get("category_ids") or []
    if wanted_cats:
        project_cats = gp.get("Enterprise_categories") or []
        project_cat_ids = {str(c.get("id")) for c in project_cats if isinstance(c, dict) and c.get("id")}
        if not any(str(c) in project_cat_ids for c in wanted_cats):
            return False

    # Status (canonical enum)
    wanted_status = filters.get("status") or []
    if wanted_status:
        canonical = _map_gouti_status(gp.get("Status") or "")
        if canonical not in wanted_status:
            return False

    # Manager
    wanted_mgr = filters.get("manager_id")
    if wanted_mgr:
        mgr = gp.get("Project_manager") or {}
        if str(mgr.get("ref_us")) != str(wanted_mgr):
            return False

    # Criticality
    wanted_crit = filters.get("criticality") or []
    if wanted_crit:
        crit_raw = gp.get("Criticality") or ""
        try:
            crit_int = int(str(crit_raw).strip())
        except ValueError:
            crit_int = 0
        if crit_int not in [int(c) for c in wanted_crit]:
            return False

    # Search (name / ref)
    search = (filters.get("search") or "").strip().lower()
    if search:
        name = str(gp.get("Name") or "").lower()
        ref = str(gp.get("Ref") or "").lower()
        if search not in name and search not in ref:
            return False

    return True


@router.get("/catalog/facets")
async def get_catalog_facets(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Return the distinct values available for each filter, computed from
    the current Gouti catalog. Used by the import modal to populate its
    filter controls without the frontend parsing the full catalog itself.
    """
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)
    projects = await connector.get_projects()

    years: set[int] = set()
    categories: dict[str, str] = {}  # id -> name
    statuses: dict[str, int] = {}  # canonical -> count
    managers: dict[str, str] = {}  # ref_us -> name_us
    criticalities: dict[int, int] = {}  # value -> count

    for gp in projects:
        for d_key in ("Start_date", "Target_date"):
            d = gp.get(d_key)
            if d:
                try:
                    years.add(int(str(d)[:4]))
                except ValueError:
                    pass
        for cat in gp.get("Enterprise_categories") or []:
            if isinstance(cat, dict) and cat.get("id"):
                categories[str(cat["id"])] = str(cat.get("name") or cat["id"])
        canonical_st = _map_gouti_status(gp.get("Status") or "")
        statuses[canonical_st] = statuses.get(canonical_st, 0) + 1
        mgr = gp.get("Project_manager")
        if isinstance(mgr, dict) and mgr.get("ref_us"):
            managers[str(mgr["ref_us"])] = str(mgr.get("name_us") or mgr["ref_us"])
        try:
            crit_int = int(str(gp.get("Criticality") or "").strip() or "0")
            if crit_int:
                criticalities[crit_int] = criticalities.get(crit_int, 0) + 1
        except ValueError:
            pass

    return {
        "years": sorted(years, reverse=True),
        "categories": [{"id": k, "name": v} for k, v in sorted(categories.items(), key=lambda kv: kv[1].lower())],
        "statuses": [{"value": k, "count": v} for k, v in sorted(statuses.items())],
        "managers": [{"ref_us": k, "name_us": v} for k, v in sorted(managers.items(), key=lambda kv: kv[1].lower())],
        "criticalities": [{"value": k, "count": v} for k, v in sorted(criticalities.items())],
        "total_projects": len(projects),
    }


@router.get("/catalog")
async def get_catalog(
    year: int | None = None,
    category_ids: str | None = None,  # comma-separated
    status: str | None = None,  # comma-separated canonical values
    manager_id: str | None = None,
    criticality: str | None = None,  # comma-separated
    search: str | None = None,
    include_tasks: bool = False,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the full Gouti catalog (projects + optionally tasks) without
    importing anything. Supports filters that mirror Gouti's own filter
    controls. The ``include_tasks`` flag is off by default because fetching
    tasks per-project is expensive — the frontend only requests them when
    the user expands a project row in the selection modal.

    Admin permanent filters stored under ``integration.gouti.default_filters``
    are merged in on top of the request filters: request params take
    precedence, but any filter the user hasn't set falls back to the
    admin default.
    """
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)
    all_projects = await connector.get_projects()

    # Admin permanent filters
    default_filters = await _load_default_filters(db, entity_id)

    filters = {
        "year": year if year is not None else default_filters.get("year"),
        "category_ids": (
            [c.strip() for c in category_ids.split(",") if c.strip()] if category_ids
            else default_filters.get("category_ids") or []
        ),
        "status": (
            [s.strip() for s in status.split(",") if s.strip()] if status
            else default_filters.get("status") or []
        ),
        "manager_id": manager_id or default_filters.get("manager_id"),
        "criticality": (
            [int(c.strip()) for c in criticality.split(",") if c.strip().isdigit()] if criticality
            else default_filters.get("criticality") or []
        ),
        "search": search,
    }

    filtered = [gp for gp in all_projects if _project_matches_filters(gp, filters)]

    # Build catalog entries
    catalog: list[dict] = []
    for gp in filtered:
        gouti_id = str(gp.get("_id") or gp.get("Ref") or "")
        if not gouti_id:
            continue
        mgr = gp.get("Project_manager") or {}
        # Progress is "91%" string
        progress_raw = gp.get("Tasks_progress") or ""
        progress_val: int | None = None
        if isinstance(progress_raw, str):
            try:
                progress_val = int(float(progress_raw.replace("%", "").strip()))
            except (ValueError, TypeError):
                progress_val = None
        entry = {
            "gouti_id": gouti_id,
            "code": str(gp.get("Ref") or gouti_id),
            "name": str(gp.get("Name") or f"Gouti Project {gouti_id}"),
            "status": _map_gouti_status(gp.get("Status") or ""),
            "status_raw": gp.get("Status"),
            "progress": progress_val,
            "manager_name": mgr.get("name_us") if isinstance(mgr, dict) else None,
            "target_date": gp.get("Target_date"),
            "start_date": gp.get("Start_date"),
            "criticality": gp.get("Criticality"),
            "categories": gp.get("Enterprise_categories") or [],
            "task_count": 0,
            "tasks": [],
        }
        if include_tasks:
            try:
                raw_tasks_resp = await connector.get_project_reports(gouti_id)  # placeholder: will use tasks endpoint below
            except Exception:
                raw_tasks_resp = []
            # TODO: wire to dedicated tasks endpoint
            entry["tasks"] = []
        catalog.append(entry)

    return {
        "total": len(all_projects),
        "filtered": len(catalog),
        "applied_filters": filters,
        "items": catalog,
    }


# ── Default filters (admin permanent filters) ────────────────────────────


async def _load_default_filters(db: AsyncSession, entity_id: UUID) -> dict:
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.default_filters",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row and isinstance(row.value, dict):
        return row.value
    return {}


@router.get("/default-filters")
async def get_default_filters(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Return the admin-configured permanent filters for the import assistant."""
    return await _load_default_filters(db, entity_id)


@router.put("/default-filters")
async def put_default_filters(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Persist the admin permanent filters. Body must be a dict with any of:
    year (int), category_ids (list[str]), status (list[str]), manager_id (str),
    criticality (list[int])."""
    # Minimal validation
    allowed_keys = {"year", "category_ids", "status", "manager_id", "criticality"}
    clean = {k: v for k, v in body.items() if k in allowed_keys}
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.default_filters",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = clean
    else:
        db.add(Setting(
            key="integration.gouti.default_filters",
            value=clean,
            scope="entity",
            scope_id=str(entity_id),
        ))
    await db.commit()
    return clean


# ── Selection endpoints ─────────────────────────────────────────────────


@router.get("/selection")
async def get_selection(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Return the user-saved import selection."""
    return await _load_selection(db, entity_id)


@router.put("/selection")
async def put_selection(
    body: SyncSelection,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Persist the user import selection."""
    await _save_selection(db, entity_id, body.model_dump())
    return body


@router.delete("/selection", status_code=204)
async def delete_selection(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Clear the saved selection — next click on Sync Gouti will re-open modal."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.sync_selection",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()


@router.post("/sync-selected", response_model=SyncResult)
async def sync_selected(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Import only the projects (and tasks) the user has selected.

    This is the endpoint the split-button's main click invokes when a
    selection already exists. When no selection is saved, the frontend
    opens the modal first instead of calling this endpoint.
    """
    selection = await _load_selection(db, entity_id)
    if not selection or not selection.get("projects"):
        raise HTTPException(
            status_code=400,
            detail="Aucune sélection sauvegardée. Ouvrez l'assistant d'import Gouti pour sélectionner les projets.",
        )

    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)
    all_projects = await connector.get_projects()

    selected_ids = {
        str(gid) for gid, entry in (selection.get("projects") or {}).items()
        if isinstance(entry, dict) and entry.get("include", True)
    }
    to_import = [
        gp for gp in all_projects
        if str(gp.get("_id") or gp.get("Ref") or "") in selected_ids
    ]

    created = 0
    updated = 0
    errors: list[str] = []
    for gp in to_import:
        try:
            _p, action = await _upsert_project_from_gouti(db, entity_id, gp)
            if action == "created":
                created += 1
            else:
                updated += 1
        except Exception as exc:
            gid = gp.get("_id") or gp.get("Ref") or "?"
            errors.append(f"Erreur projet {gid}: {str(exc)[:200]}")

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(500, f"Erreur sauvegarde: {str(exc)[:300]}")

    now_iso = datetime.now(timezone.utc).isoformat()
    await _save_setting(db, entity_id, f"{GOUTI_SETTINGS_PREFIX}.last_sync_at", now_iso)
    await _save_setting(db, entity_id, f"{GOUTI_SETTINGS_PREFIX}.last_sync_count", str(created + updated))
    await db.commit()

    logger.info(
        "Gouti sync-selected: created=%d, updated=%d, errors=%d (user=%s)",
        created, updated, len(errors), current_user.id,
    )
    return SyncResult(synced=created + updated, created=created, updated=updated, errors=errors)


@router.get("/debug/raw-projects")
async def debug_raw_projects(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Diagnostic: return the raw, untransformed Gouti /projects response
    alongside the first 3 keys/items so we can see exactly what shape and
    field names Gouti returns for this entity."""
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)
    raw = await connector.get_raw_projects_response()
    # Also do a parsed extract to show the first item's full keys
    import httpx
    base = gouti_settings.get("base_url", "https://apiprd.gouti.net/v1/client").rstrip("/")
    token = gouti_settings.get("token", "")
    headers = {
        "Authorization": f"Bearer {token}",
        "Client-Id": gouti_settings.get("client_id", ""),
        "Accept": "application/json",
    }
    if gouti_settings.get("entity_code"):
        headers["Entity-Code"] = gouti_settings["entity_code"]
    sample_full = None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{base}/projects", headers=headers)
            body = resp.json()
            if isinstance(body, dict):
                first_key = next(iter(body.keys()), None)
                if first_key is not None:
                    first_val = body[first_key]
                    if isinstance(first_val, dict):
                        sample_full = {"_id": first_key, **first_val}
            elif isinstance(body, list) and body:
                sample_full = body[0]
    except Exception as exc:
        sample_full = {"error": str(exc)[:300]}
    return {
        "shape_summary": raw,
        "first_item_all_keys": list(sample_full.keys()) if isinstance(sample_full, dict) else None,
        "first_item_sample": sample_full,
    }


@router.post("/sync/{project_id}", response_model=SingleProjectSyncResult)
async def sync_single_project(
    project_id: str,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync a single project (and its reports) from Gouti by Gouti project ID.

    This fetches the project detail and its reports from the Gouti API,
    upserts the project locally, and stores report data in the project description
    (appended as a summary section).
    """
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)

    errors: list[str] = []

    # Fetch the single project from Gouti
    try:
        gouti_data = await connector.get_project(project_id)
    except Exception as exc:
        logger.error("Gouti single sync — failed to fetch project %s: %s", project_id, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de récupérer le projet {project_id} depuis Gouti : {str(exc)[:300]}",
        )

    # Upsert the project
    try:
        project, action = await _upsert_project_from_gouti(db, entity_id, gouti_data)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Erreur lors du mapping du projet Gouti : {str(exc)[:300]}",
        )

    # Fetch and attach reports
    reports_synced = 0
    try:
        reports = await connector.get_project_reports(project_id)
        if reports:
            # Build a summary of reports and store as JSONB-compatible metadata
            report_summaries = []
            for r in reports:
                report_summaries.append({
                    "id": str(r.get("id", "")),
                    "title": r.get("title") or r.get("name") or r.get("titre") or "",
                    "date": r.get("date") or r.get("created_at") or "",
                    "status": r.get("status") or r.get("statut") or "",
                    "content_preview": (r.get("content") or r.get("contenu") or "")[:200],
                })
            reports_synced = len(report_summaries)

            # Store report count in a descriptive note appended to description
            report_note = (
                f"\n\n--- Rapports Gouti ({len(report_summaries)}) ---\n"
                + "\n".join(
                    f"- [{rs['title']}] ({rs['date']}) — {rs['status']}"
                    for rs in report_summaries
                )
            )
            # Only append if not already present (idempotent)
            base_desc = project.description or ""
            separator = "--- Rapports Gouti"
            if separator in base_desc:
                base_desc = base_desc[:base_desc.index(separator)].rstrip()
            project.description = base_desc + report_note

    except Exception as exc:
        msg = f"Erreur récupération rapports Gouti pour projet {project_id}: {str(exc)[:200]}"
        logger.warning("Gouti single sync — %s", msg)
        errors.append(msg)

    try:
        await db.commit()
        await db.refresh(project)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Erreur sauvegarde projet : {str(exc)[:300]}",
        )

    # Update last sync timestamp
    now_iso = datetime.now(timezone.utc).isoformat()
    await _save_setting(db, entity_id, f"{GOUTI_SETTINGS_PREFIX}.last_sync_at", now_iso)
    await db.commit()

    logger.info(
        "Gouti single sync — project=%s action=%s reports=%d (user=%s)",
        project_id, action, reports_synced, current_user.id,
    )

    return SingleProjectSyncResult(
        project_id=project_id,
        local_id=str(project.id),
        action=action,
        reports_synced=reports_synced,
        errors=errors,
    )
