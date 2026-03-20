"""Centralized delete policy service.

Supports three delete modes per entity type, configurable by admin via Settings:
  - "soft"       : archived=True (default for main entities)
  - "soft_purge"  : archived=True + auto-purge after retention_days
  - "hard"       : physical DELETE (default for child/junction records)

Settings key convention: delete_policy.{entity_type}
Settings value (JSONB): {"mode": "soft"|"soft_purge"|"hard", "retention_days": 90}
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.models.common import Setting

logger = logging.getLogger(__name__)


# ─── Entity Type Registry ────────────────────────────────────────────────────
# Maps entity_type keys to their table name, display label, category, and
# default delete mode. The model class is resolved lazily to avoid circular imports.

ENTITY_TYPE_REGISTRY: dict[str, dict[str, Any]] = {
    # ── Main entities (default: soft delete) ──
    "asset": {"table": "assets", "label": "Assets", "category": "main", "default_mode": "soft"},
    "tier": {"table": "tiers", "label": "Tiers", "category": "main", "default_mode": "soft"},
    "project": {"table": "projects", "label": "Projets", "category": "main", "default_mode": "soft"},
    "workflow_definition": {"table": "workflow_definitions", "label": "Workflows", "category": "main", "default_mode": "soft"},
    "pax_profile": {"table": "pax_profiles", "label": "Profils PAX", "category": "main", "default_mode": "soft"},
    "ads": {"table": "ads", "label": "Avis de séjour", "category": "main", "default_mode": "soft"},
    "transport_vector": {"table": "transport_vectors", "label": "Vecteurs", "category": "main", "default_mode": "soft"},
    "voyage": {"table": "voyages", "label": "Voyages", "category": "main", "default_mode": "soft"},
    "planner_activity": {"table": "planner_activities", "label": "Activités Planner", "category": "main", "default_mode": "soft"},
    "pid_document": {"table": "pid_documents", "label": "Documents PID", "category": "main", "default_mode": "soft"},
    "equipment": {"table": "equipment", "label": "Équipements", "category": "main", "default_mode": "soft"},
    "dcs_tag": {"table": "dcs_tags", "label": "Tags DCS", "category": "main", "default_mode": "soft"},
    "doc_type": {"table": "doc_types", "label": "Types de document", "category": "main", "default_mode": "soft"},
    "document": {"table": "documents", "label": "Documents", "category": "main", "default_mode": "soft"},
    "template": {"table": "templates", "label": "Modèles", "category": "main", "default_mode": "soft"},
    "announcement": {"table": "announcements", "label": "Annonces", "category": "main", "default_mode": "soft"},
    "dashboard": {"table": "dashboards", "label": "Dashboards", "category": "main", "default_mode": "soft"},
    "dashboard_tab": {"table": "dashboard_tabs", "label": "Onglets dashboard", "category": "main", "default_mode": "soft"},
    # ── Child / sub-entities (default: hard delete) ──
    "address": {"table": "addresses", "label": "Adresses", "category": "child", "default_mode": "hard"},
    "phone": {"table": "phones", "label": "Téléphones", "category": "child", "default_mode": "hard"},
    "contact_email": {"table": "contact_emails", "label": "Emails contact", "category": "child", "default_mode": "hard"},
    "tag": {"table": "tags", "label": "Tags", "category": "child", "default_mode": "hard"},
    "note": {"table": "notes", "label": "Notes", "category": "child", "default_mode": "hard"},
    "attachment": {"table": "attachments", "label": "Pièces jointes", "category": "child", "default_mode": "hard"},
    "notification": {"table": "notifications", "label": "Notifications", "category": "child", "default_mode": "hard"},
    "user_email": {"table": "user_emails", "label": "Emails utilisateur", "category": "child", "default_mode": "hard"},
    "user_group_member": {"table": "user_group_members", "label": "Membres groupe", "category": "child", "default_mode": "hard"},
    "email_template": {"table": "email_templates", "label": "Modèles email", "category": "child", "default_mode": "hard"},
    "pdf_template": {"table": "pdf_templates", "label": "Modèles PDF", "category": "child", "default_mode": "hard"},
    "tier_identifier": {"table": "tier_identifiers", "label": "Identifiants tiers", "category": "child", "default_mode": "hard"},
    "external_reference": {"table": "external_references", "label": "Références ext.", "category": "child", "default_mode": "hard"},
    "asset_type_config": {"table": "asset_type_configs", "label": "Config types assets", "category": "child", "default_mode": "hard"},
    "planner_dependency": {"table": "planner_activity_dependencies", "label": "Dépendances planner", "category": "child", "default_mode": "hard"},
}

# Default policy when no Setting exists
DEFAULT_POLICY = {"mode": "soft", "retention_days": 0}
DEFAULT_CHILD_POLICY = {"mode": "hard", "retention_days": 0}


async def get_delete_policy(
    entity_type: str,
    db: AsyncSession,
    entity_id: UUID | None = None,
) -> dict[str, Any]:
    """Fetch the delete policy for a given entity type.

    Lookup order: entity-scoped Setting → tenant-scoped Setting → registry default.
    """
    setting_key = f"delete_policy.{entity_type}"

    # Try entity-scoped first
    if entity_id:
        result = await db.execute(
            select(Setting).where(
                Setting.key == setting_key,
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
            )
        )
        setting = result.scalar_one_or_none()
        if setting:
            return setting.value

    # Fallback to tenant-scoped
    result = await db.execute(
        select(Setting).where(
            Setting.key == setting_key,
            Setting.scope == "tenant",
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value

    # Fallback to registry default
    reg = ENTITY_TYPE_REGISTRY.get(entity_type)
    if reg:
        default_mode = reg.get("default_mode", "soft")
        return {"mode": default_mode, "retention_days": 0}

    return DEFAULT_POLICY


async def delete_entity(
    entity: Any,
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID | None = None,
    user_id: UUID | None = None,
) -> dict[str, str]:
    """Delete an entity according to the configured policy.

    Returns a dict with the action taken: {"action": "archived"|"deleted"}.
    """
    policy = await get_delete_policy(entity_type, db, entity_id)
    mode = policy.get("mode", "soft")

    resource_id = str(entity.id) if hasattr(entity, "id") else "unknown"

    if mode in ("soft", "soft_purge"):
        # Soft delete: set archived=True
        if hasattr(entity, "archived"):
            entity.archived = True
        if hasattr(entity, "active"):
            entity.active = False
        await db.flush()

        if user_id:
            await record_audit(
                db,
                action="archive",
                resource_type=entity_type,
                resource_id=resource_id,
                user_id=user_id,
                entity_id=entity_id,
                details={"policy_mode": mode},
            )

        logger.debug("Soft-deleted %s id=%s (mode=%s)", entity_type, resource_id, mode)
        return {"action": "archived"}

    else:
        # Hard delete
        await db.delete(entity)
        await db.flush()

        if user_id:
            await record_audit(
                db,
                action="delete",
                resource_type=entity_type,
                resource_id=resource_id,
                user_id=user_id,
                entity_id=entity_id,
                details={"policy_mode": "hard"},
            )

        logger.debug("Hard-deleted %s id=%s", entity_type, resource_id)
        return {"action": "deleted"}


async def purge_archived(
    entity_type: str,
    retention_days: int,
    db: AsyncSession,
) -> int:
    """Physically delete archived records older than retention_days.

    Returns the number of purged records.
    """
    reg = ENTITY_TYPE_REGISTRY.get(entity_type)
    if not reg:
        logger.warning("purge_archived: unknown entity type %s", entity_type)
        return 0

    table_name = reg["table"]
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    # Use raw SQL for performance — we don't need ORM here
    result = await db.execute(
        text(
            f"DELETE FROM {table_name} "  # noqa: S608 — table_name is from registry, not user input
            "WHERE archived = true AND updated_at < :cutoff "
            "RETURNING id"
        ),
        {"cutoff": cutoff},
    )
    purged = len(result.fetchall())
    await db.commit()

    if purged > 0:
        logger.info("Purged %d archived %s records (retention=%d days)", purged, entity_type, retention_days)

    return purged


async def get_archived_counts(db: AsyncSession) -> dict[str, int]:
    """Return count of archived records per entity type (for admin stats).

    Uses SAVEPOINTs so that a failed COUNT on a table without the archived
    column does not abort the entire transaction.
    """
    counts: dict[str, int] = {}
    for entity_type, reg in ENTITY_TYPE_REGISTRY.items():
        table_name = reg["table"]
        try:
            async with db.begin_nested():
                result = await db.execute(
                    text(f"SELECT COUNT(*) FROM {table_name} WHERE archived = true")  # noqa: S608
                )
                counts[entity_type] = result.scalar() or 0
        except Exception:
            # Table may not have archived column — savepoint rolled back
            counts[entity_type] = 0
    return counts


async def upsert_delete_policy(
    entity_type: str,
    mode: str,
    retention_days: int,
    db: AsyncSession,
    entity_id: UUID | None = None,
) -> None:
    """Create or update a delete policy Setting."""
    if entity_type not in ENTITY_TYPE_REGISTRY:
        raise ValueError(f"Unknown entity type: {entity_type}")
    if mode not in ("soft", "soft_purge", "hard"):
        raise ValueError(f"Invalid delete mode: {mode}")

    setting_key = f"delete_policy.{entity_type}"
    scope = "entity" if entity_id else "tenant"
    scope_id = str(entity_id) if entity_id else None

    result = await db.execute(
        select(Setting).where(
            Setting.key == setting_key,
            Setting.scope == scope,
            Setting.scope_id == scope_id if scope_id else Setting.scope_id.is_(None),
        )
    )
    setting = result.scalar_one_or_none()

    value = {"mode": mode, "retention_days": retention_days}

    if setting:
        setting.value = value
    else:
        db.add(Setting(
            key=setting_key,
            value=value,
            scope=scope,
            scope_id=scope_id,
        ))

    await db.commit()
