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
    tasks_synced: int = 0
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
    # Gouti uses several date formats across endpoints:
    # Projects: "2024-05-01" (YYYY-MM-DD)
    # Tasks:    "2024-11-19 00:00:00" (YYYY-MM-DD HH:MM:SS, space separator)
    # Also handle ISO with T separator and timezone variants.
    for fmt in (
        "%Y-%m-%d %H:%M:%S",      # Gouti tasks
        "%Y-%m-%dT%H:%M:%S%z",    # ISO with timezone
        "%Y-%m-%dT%H:%M:%SZ",     # ISO with Z
        "%Y-%m-%dT%H:%M:%S",      # ISO without timezone
        "%Y-%m-%d",                # Date only
        "%d/%m/%Y",                # French
        "%d/%m/%Y %H:%M:%S",      # French with time
    ):
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
    # Compose a rich description: project description + context/situation
    # blocks that Gouti surfaces separately — and sanitise HTML.
    description_parts: list[str] = []
    for key in ("Description", "description_pr", "description"):
        v = gouti_data.get(key)
        if v:
            description_parts.append(_html_to_text(v) or "")
    for label, key in (
        ("Contexte", "Context"),
        ("Justification métier", "Business_justification"),
        ("Contraintes", "Constraints"),
        ("Exclusions", "Exclusions"),
        ("Situation globale", "General_situation"),
        ("Situation détaillée", "Detailed_situation"),
    ):
        v = gouti_data.get(key)
        cleaned = _html_to_text(v) if v else None
        if cleaned:
            description_parts.append(f"### {label}\n{cleaned}")
    description = "\n\n".join(p for p in description_parts if p).strip() or None
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


# ── Tasks of a single Gouti project (lazy-load for modal expansion) ──────


def _html_to_text(raw: str | None) -> str | None:
    """Convert Gouti HTML descriptions to clean plain text.

    Gouti stores rich text as HTML (``<div>...</div><br><a href=...>``).
    Rendering that as plain text in OpsFlux shows the tags literally,
    so we normalise at import time:
    - Replace ``<br>``, ``<br/>``, closing ``</div>``, ``</p>`` with ``\n``
    - Inline ``<a href="X">Y</a>`` as ``Y (X)``
    - Strip every remaining tag
    - Unescape HTML entities (``&amp;``, ``&nbsp;``, ...)
    - Collapse 3+ consecutive newlines down to 2
    """
    if raw is None:
        return None
    import re
    from html import unescape
    s = str(raw)
    if not s.strip():
        return None
    # <a href="X">Y</a> -> Y (X)
    s = re.sub(
        r'<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>(.*?)</a>',
        lambda m: f"{m.group(2)} ({m.group(1)})",
        s,
        flags=re.IGNORECASE | re.DOTALL,
    )
    s = re.sub(
        r"<a\s+[^>]*href\s*=\s*'([^']+)'[^>]*>(.*?)</a>",
        lambda m: f"{m.group(2)} ({m.group(1)})",
        s,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Line-break producing tags
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"</\s*(div|p|li|h[1-6]|tr)\s*>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<\s*li[^>]*>", "\n- ", s, flags=re.IGNORECASE)
    # Strip all remaining tags
    s = re.sub(r"<[^>]+>", "", s)
    # Decode entities
    s = unescape(s)
    # Collapse whitespace
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip() or None


def _gouti_task_name(t: dict) -> str:
    """Best-effort Gouti task title with sensible fallbacks.

    Gouti tasks sometimes have an empty ``name_ta`` for macro/grouping
    rows (``macro_ta == "1"``). In that case we try other text fields
    and finally fall back to the ref.
    """
    for key in ("name_ta", "name", "Name", "title"):
        v = t.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    # Macro rows are Gouti grouping headers — try description as fallback
    desc = t.get("description_ta") or t.get("description")
    if isinstance(desc, str) and desc.strip():
        return desc.strip()[:100]
    # Last resort: use the ref as identifier
    tid = t.get("ref_ta") or t.get("_id") or "?"
    if str(t.get("macro_ta") or "").strip() == "1":
        return f"▸ Groupe {tid}"
    return f"Tâche {tid}"


def _parse_gouti_status_task(raw: str | int | None) -> str:
    """Map Gouti task status codes to OpsFlux task status enum.

    Gouti ``status_ta`` is a numeric code: "0" = not started (todo),
    "1" = in progress, "2" = done. Also accept the French labels we
    saw in /projects for future-proofing.
    """
    if raw is None:
        return "todo"
    s = str(raw).lower().strip()
    if s in {"2", "done", "termin\u00e9", "closed", "complete"}:
        return "done"
    if s in {"1", "in_progress", "progress", "en_cours", "cours"}:
        return "in_progress"
    if s in {"3", "review", "revue"}:
        return "review"
    if s in {"4", "cancelled", "annul\u00e9"}:
        return "cancelled"
    return "todo"


def _as_int(v, default: int = 0) -> int:
    if v in (None, ""):
        return default
    try:
        return int(float(str(v).replace("%", "").strip()))
    except (ValueError, TypeError):
        return default


def _as_float(v) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(str(v).strip())
    except (ValueError, TypeError):
        return None


def _build_task_tree_metadata(raw_tasks: list[dict]) -> list[dict]:
    """Enrich a flat Gouti task list with synthesized parent ref and level.

    Gouti's ``/projects/{id}/tasks`` endpoint already returns tasks in
    **depth-first traversal order**: parents come before their children
    and siblings preserve their visual order. ``order_ta`` is only a
    **local** index within a parent group, not a global sequence, so
    sorting by order_ta globally scrambles the tree.

    We therefore walk the list in its original order and maintain a
    simple level stack: at level N, the parent is the last task pushed
    at level N-1.
    """
    stack: list[tuple[int, str]] = []  # list of (level, ref_ta)
    out: list[dict] = []
    for idx, t in enumerate(raw_tasks):
        if not isinstance(t, dict):
            continue
        level = _as_int(t.get("level_ta"), 1)
        ref = str(t.get("ref_ta") or t.get("_id") or "")
        # Pop stack until the top has a strictly shallower level
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent_ref = stack[-1][1] if stack else None
        enriched = dict(t)
        enriched["_level"] = level
        enriched["_order"] = _as_int(t.get("order_ta"), idx)
        enriched["_parent_ref"] = parent_ref
        out.append(enriched)
        if ref:
            stack.append((level, ref))
    return out


@router.get("/catalog/projects/{gouti_project_id}/tasks")
async def get_catalog_project_tasks(
    gouti_project_id: str,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the live task list for a Gouti project without importing.

    Returns the full tree with ``parent_ref`` / ``level`` / ``order`` /
    ``is_milestone`` / ``is_macro`` so the frontend can render a
    treegrid with expand/collapse that mirrors Gouti's own hierarchy.
    """
    gouti_settings = await _get_gouti_settings(db, entity_id)
    connector = _build_connector(gouti_settings)
    try:
        raw_tasks = await connector.get_project_tasks(gouti_project_id)
    except Exception as exc:
        logger.warning("Gouti catalog task fetch failed for %s: %s", gouti_project_id, exc)
        raise HTTPException(502, f"Erreur récupération tâches Gouti: {str(exc)[:200]}")

    enriched = _build_task_tree_metadata(raw_tasks)

    items: list[dict] = []
    for t in enriched:
        ref = str(t.get("ref_ta") or t.get("_id") or "")
        if not ref:
            continue
        items.append({
            "gouti_id": ref,
            "code": ref,
            "name": _gouti_task_name(t),
            "status_raw": t.get("status_ta"),
            "status": _parse_gouti_status_task(t.get("status_ta")),
            "progress": _as_int(t.get("progress_ta"), 0),
            "start_date": t.get("initial_start_date_ta") or t.get("actual_start_date_ta") or None,
            "end_date": t.get("initial_end_date_ta") or t.get("actual_end_date_ta") or None,
            "actual_start_date": t.get("actual_start_date_ta") or None,
            "actual_end_date": t.get("actual_end_date_ta") or None,
            "workload": _as_float(t.get("workload_ta")),
            "actual_workload": _as_float(t.get("actual_workload_ta")),
            "duration_days": _as_int(t.get("duration_ta"), 0),
            "description": t.get("description_ta") or None,
            "is_milestone": str(t.get("milestone_ta") or "0").strip() == "1",
            "is_macro": str(t.get("macro_ta") or "0").strip() == "1",
            "level": t.get("_level", 1),
            "order": t.get("_order", 0),
            "parent_ref": t.get("_parent_ref"),
        })
    return {"gouti_project_id": gouti_project_id, "count": len(items), "items": items}


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


async def _import_project_tasks(
    db: AsyncSession,
    entity_id: UUID,
    local_project_id: UUID,
    gouti_project_id: str,
    connector,
    task_selection: dict,
    current_user_id: UUID,
) -> int:
    """Fetch and import tasks for a project preserving Gouti's hierarchy.

    - Rebuilds the parent/child tree from ``level_ta`` + ``order_ta``.
    - Upserts each task by ``(project_id, code)`` and stores the
      parent_id FK pointing to the local parent task that was upserted
      earlier in the same pass (walking in order).
    - Gouti tasks flagged with ``milestone_ta == 1`` are imported as
      ``ProjectMilestone`` rows instead of tasks.
    - Task selection ``mode`` drives filtering: "all" / "none" /
      "some" (task_ids subset).
    """
    mode = str(task_selection.get("mode") or "all").lower()
    if mode == "none":
        return 0

    try:
        raw_tasks = await connector.get_project_tasks(gouti_project_id)
    except Exception as exc:
        logger.warning("Gouti tasks fetch failed for %s: %s", gouti_project_id, exc)
        return 0

    # Enrich with level/order/parent_ref
    tree_tasks = _build_task_tree_metadata(raw_tasks)

    wanted_ids = set(task_selection.get("task_ids") or [])

    from app.models.common import ProjectTask, ProjectMilestone

    # Map Gouti ref → local ProjectTask.id so children can point to parents
    gouti_to_local_id: dict[str, UUID] = {}
    touched = 0

    for gt in tree_tasks:
        tid = str(gt.get("ref_ta") or gt.get("_id") or "")
        if not tid:
            continue
        if mode == "some" and tid not in wanted_ids:
            continue

        is_milestone = str(gt.get("milestone_ta") or "0").strip() == "1"
        title = _gouti_task_name(gt)
        description = _html_to_text(gt.get("description_ta") or gt.get("description"))
        progress = max(0, min(100, _as_int(gt.get("progress_ta"), 0)))
        status = _parse_gouti_status_task(gt.get("status_ta"))
        start_date = _parse_gouti_date(
            gt.get("initial_start_date_ta") or gt.get("actual_start_date_ta")
        )
        end_date = _parse_gouti_date(
            gt.get("initial_end_date_ta") or gt.get("actual_end_date_ta")
        )
        code = tid
        order_val = gt.get("_order", 0)

        # ── Milestones: import as ProjectMilestone, not ProjectTask ──
        if is_milestone:
            try:
                existing_ms = (await db.execute(
                    select(ProjectMilestone).where(
                        ProjectMilestone.project_id == local_project_id,
                        ProjectMilestone.name == title,
                    )
                )).scalar_one_or_none()
                if existing_ms:
                    existing_ms.description = description
                    existing_ms.due_date = end_date or start_date
                    existing_ms.status = "completed" if status == "done" else "pending"
                else:
                    db.add(ProjectMilestone(
                        project_id=local_project_id,
                        name=title,
                        description=description,
                        due_date=end_date or start_date,
                        status="completed" if status == "done" else "pending",
                    ))
                touched += 1
            except Exception as exc:
                logger.warning("Milestone upsert failed for %s: %s", tid, exc)
            continue

        # ── Regular task upsert ──
        workload = _as_float(gt.get("workload_ta"))
        actual_workload = _as_float(gt.get("actual_workload_ta"))

        # Resolve parent_id locally using the parent_ref surfaced by the
        # tree builder. The parent must have been upserted earlier (we
        # iterate in order), except in partial-import mode where the
        # parent might be skipped — in that case we leave parent_id=None
        # so the task becomes a root.
        parent_ref = gt.get("_parent_ref")
        parent_id: UUID | None = gouti_to_local_id.get(parent_ref) if parent_ref else None

        existing = (await db.execute(
            select(ProjectTask).where(
                ProjectTask.project_id == local_project_id,
                ProjectTask.code == code,
            )
        )).scalar_one_or_none()

        if existing:
            existing.title = title
            existing.description = description
            existing.status = status
            existing.progress = progress
            existing.estimated_hours = workload
            existing.actual_hours = actual_workload
            existing.start_date = start_date
            existing.due_date = end_date
            existing.order = order_val
            existing.parent_id = parent_id
            gouti_to_local_id[tid] = existing.id
        else:
            task = ProjectTask(
                project_id=local_project_id,
                parent_id=parent_id,
                code=code,
                title=title,
                description=description,
                status=status,
                progress=progress,
                estimated_hours=workload,
                actual_hours=actual_workload,
                start_date=start_date,
                due_date=end_date,
                order=order_val,
            )
            db.add(task)
            # Flush so task.id is populated and children can reference it
            await db.flush()
            gouti_to_local_id[tid] = task.id
        touched += 1

    return touched


@router.post("/sync-selected", response_model=SyncResult)
async def sync_selected(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Import only the projects (and per-project task selection) the user has saved.

    Applies the stored ``integration.gouti.sync_selection`` selection:
      - Each project with include=true is upserted from its Gouti record.
      - Its ``tasks.mode`` drives task import: "all" fetches & upserts
        every Gouti task, "some" only the task_ids listed, "none" skips
        task import for that project.
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

    selection_projects = selection.get("projects") or {}
    selected_ids = {
        str(gid) for gid, entry in selection_projects.items()
        if isinstance(entry, dict) and entry.get("include", True)
    }
    to_import = [
        gp for gp in all_projects
        if str(gp.get("_id") or gp.get("Ref") or "") in selected_ids
    ]

    created = 0
    updated = 0
    tasks_touched = 0
    errors: list[str] = []
    for gp in to_import:
        try:
            local_project, action = await _upsert_project_from_gouti(db, entity_id, gp)
            if action == "created":
                created += 1
            else:
                updated += 1

            # Flush so local_project has an id for task FK
            await db.flush()

            gid = str(gp.get("_id") or gp.get("Ref") or "")
            entry = selection_projects.get(gid) or {}
            task_sel = entry.get("tasks") or {"mode": "all", "task_ids": []}
            try:
                tasks_touched += await _import_project_tasks(
                    db, entity_id, local_project.id, gid, connector, task_sel, current_user.id,
                )
            except Exception as exc:
                errors.append(f"Tâches {gid}: {str(exc)[:200]}")
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
        "Gouti sync-selected: projects created=%d updated=%d tasks=%d errors=%d (user=%s)",
        created, updated, tasks_touched, len(errors), current_user.id,
    )
    return SyncResult(synced=created + updated, created=created, updated=updated, errors=errors)


@router.get("/debug/raw-tasks/{gouti_project_id}")
async def debug_raw_tasks(
    gouti_project_id: str,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Diagnostic: return one full task from a Gouti project with every key."""
    gouti_settings = await _get_gouti_settings(db, entity_id)
    base = gouti_settings.get("base_url", "https://apiprd.gouti.net/v1/client").rstrip("/")
    headers = {
        "Authorization": f"Bearer {gouti_settings.get('token', '')}",
        "Client-Id": gouti_settings.get("client_id", ""),
        "Accept": "application/json",
    }
    if gouti_settings.get("entity_code"):
        headers["Entity-Code"] = gouti_settings["entity_code"]

    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{base}/projects/{gouti_project_id}/tasks", headers=headers)
        body = resp.json()
    top_level_keys = list(body.keys())[:5] if isinstance(body, dict) else None
    first_key = next(iter(body.keys()), None) if isinstance(body, dict) else None
    first_item = None
    if isinstance(body, dict) and first_key is not None:
        first_val = body[first_key]
        if isinstance(first_val, dict):
            first_item = {"_id": first_key, **first_val}
    elif isinstance(body, list) and body:
        first_item = body[0]
    return {
        "http_status": resp.status_code,
        "shape": type(body).__name__,
        "top_level_keys_sample": top_level_keys,
        "total_count": len(body) if isinstance(body, (dict, list)) else None,
        "first_item_all_keys": sorted(first_item.keys()) if isinstance(first_item, dict) else None,
        "first_item_full": first_item,
    }


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

    # ── Also re-import tasks (hierarchy, milestones, dates) ──
    tasks_synced = 0
    try:
        tasks_synced = await _import_project_tasks(
            db, entity_id, project.id, project_id, connector,
            task_selection={"mode": "all", "task_ids": []},
            current_user_id=current_user.id,
        )
    except Exception as exc:
        msg = f"Erreur import tâches Gouti pour projet {project_id}: {str(exc)[:200]}"
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
        "Gouti single sync — project=%s action=%s reports=%d tasks=%d (user=%s)",
        project_id, action, reports_synced, tasks_synced, current_user.id,
    )

    return SingleProjectSyncResult(
        project_id=project_id,
        local_id=str(project.id),
        action=action,
        reports_synced=reports_synced,
        tasks_synced=tasks_synced,
        errors=errors,
    )
