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
    """Map Gouti project status to local Project status enum."""
    if not gouti_status:
        return "draft"
    mapping = {
        "draft": "draft",
        "brouillon": "draft",
        "planned": "planned",
        "planifié": "planned",
        "planifie": "planned",
        "active": "active",
        "actif": "active",
        "en_cours": "active",
        "en cours": "active",
        "on_hold": "on_hold",
        "en_attente": "on_hold",
        "en attente": "on_hold",
        "completed": "completed",
        "terminé": "completed",
        "termine": "completed",
        "cancelled": "cancelled",
        "annulé": "cancelled",
        "annule": "cancelled",
    }
    return mapping.get(gouti_status.lower().strip(), "draft")


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
    gouti_id = str(
        gouti_data.get("id")
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

    # Extract fields from Gouti payload (defensive — keys vary by Gouti version)
    name = (
        gouti_data.get("name")
        or gouti_data.get("title")
        or gouti_data.get("nom")
        or f"Gouti Project {gouti_id}"
    )
    code = (
        gouti_data.get("code")
        or gouti_data.get("reference")
        or gouti_data.get("ref")
        or f"GOU-{gouti_id[:8]}"
    )
    description = (
        gouti_data.get("description")
        or gouti_data.get("desc")
        or gouti_data.get("summary")
    )
    status = _map_gouti_status(
        gouti_data.get("status") or gouti_data.get("statut")
    )
    priority = _map_gouti_priority(
        gouti_data.get("priority") or gouti_data.get("priorité") or gouti_data.get("priorite")
    )
    progress = gouti_data.get("progress") or gouti_data.get("avancement") or 0
    if isinstance(progress, str):
        try:
            progress = int(float(progress))
        except (ValueError, TypeError):
            progress = 0
    start_date = _parse_gouti_date(
        gouti_data.get("start_date") or gouti_data.get("date_debut") or gouti_data.get("startDate")
    )
    end_date = _parse_gouti_date(
        gouti_data.get("end_date") or gouti_data.get("date_fin") or gouti_data.get("endDate")
    )
    budget_raw = gouti_data.get("budget")
    budget = None
    if budget_raw is not None:
        try:
            budget = float(budget_raw)
        except (ValueError, TypeError):
            budget = None

    if existing:
        # Update existing project
        existing.name = name
        existing.code = code
        existing.description = description
        existing.status = status
        existing.priority = priority
        existing.progress = progress
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

    return SyncStatus(
        last_sync_at=last_sync_at,
        project_count=project_count,
        connector_configured=connector_configured,
    )


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
