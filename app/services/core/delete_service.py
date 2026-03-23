"""Centralized delete policy service.

Supports three delete modes per entity type, configurable by admin via Settings:
  - "soft"       : archived=True (default for main entities)
  - "soft_purge"  : archived=True + auto-purge after retention_days
  - "hard"       : physical DELETE (default for child/junction records)

Settings key convention: delete_policy.{entity_type}
Settings value (JSONB): {"mode": "soft"|"soft_purge"|"hard", "retention_days": 90}

The registry is built automatically from SQLAlchemy models at import time:
  - Models with SoftDeleteMixin → category "main", default mode "soft"
  - All other models → category "child", default mode "hard"
  - Models can override via __delete_policy__ class attribute
"""

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.models.common import Setting

logger = logging.getLogger(__name__)


# ─── Auto-discovery helpers ───────────────────────────────────────────────────

def _camel_to_snake(name: str) -> str:
    """Convert CamelCase to snake_case. E.g. 'PaxProfile' → 'pax_profile'."""
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def _humanize(snake: str) -> str:
    """Convert snake_case to a human label. E.g. 'pax_profile' → 'Pax profile'."""
    return snake.replace("_", " ").capitalize()


# Tables to exclude from the registry (system/internal tables)
_EXCLUDE_TABLES = frozenset({
    "alembic_version",
})

# Models that should never be managed by the delete service
_EXCLUDE_MODELS = frozenset({
    "Setting",         # configuration — never deleted via this service
    "AuditLog",        # immutable audit trail
    "RefreshToken",    # handled by auth service (TTL-based)
    "Permission",      # RBAC definition — seeded, not user-deletable
    "Role",            # RBAC definition
    "RolePermission",  # RBAC junction
})

# Optional manual label overrides (entity_type → label)
_LABEL_OVERRIDES: dict[str, str] = {
    "asset": "Assets",
    "tier": "Tiers",
    "project": "Projets",
    "ads": "Avis de séjour",
    "pax_profile": "Profils PAX",
    "transport_vector": "Vecteurs",
    "voyage": "Voyages",
    "planner_activity": "Activités Planner",
    "pid_document": "Documents PID",
    "equipment": "Équipements",
    "dcs_tag": "Tags DCS",
    "doc_type": "Types de document",
    "document": "Documents",
    "template": "Modèles",
    "announcement": "Annonces",
    "dashboard": "Dashboards",
    "dashboard_tab": "Onglets dashboard",
    "address": "Adresses",
    "phone": "Téléphones",
    "contact_email": "Emails contact",
    "tag": "Tags",
    "note": "Notes",
    "attachment": "Pièces jointes",
    "notification": "Notifications",
    "legal_identifier": "Identifiants légaux",
    "medical_check": "Visites médicales",
    "external_reference": "Références ext.",
    "user_passport": "Passeports",
    "user_visa": "Visas",
    "emergency_contact": "Contacts urgence",
    "social_security": "Sécu sociale",
    "user_vaccine": "Vaccins",
    "user_language": "Langues",
    "driving_license": "Permis conduire",
    "compliance_rule": "Règles conformité",
    "compliance_type": "Types conformité",
    "compliance_record": "Enregistrements conformité",
    "compliance_exemption": "Exemptions",
    "job_position": "Fiches de poste",
}


def _build_registry() -> dict[str, dict[str, Any]]:
    """Auto-discover all SQLAlchemy models and build the entity type registry.

    Detection rules:
      - Models with SoftDeleteMixin → category="main", default_mode="soft"
      - All other models → category="child", default_mode="hard"
      - Models can override via __delete_policy__ = {"category": ..., "default_mode": ...}
    """
    from app.models.base import Base, SoftDeleteMixin

    registry: dict[str, dict[str, Any]] = {}

    for mapper in Base.registry.mappers:
        cls = mapper.class_
        class_name = cls.__name__

        # Skip excluded models
        if class_name in _EXCLUDE_MODELS:
            continue

        # Skip models without __tablename__ (abstract or mixin)
        table_name = getattr(cls, "__tablename__", None)
        if not table_name or table_name in _EXCLUDE_TABLES:
            continue

        entity_type = _camel_to_snake(class_name)

        # Check for SoftDeleteMixin
        has_soft_delete = issubclass(cls, SoftDeleteMixin)

        # Default category/mode based on mixin
        category = "main" if has_soft_delete else "child"
        default_mode = "soft" if has_soft_delete else "hard"

        # Allow per-model override via class attribute
        override = getattr(cls, "__delete_policy__", None)
        if override:
            category = override.get("category", category)
            default_mode = override.get("default_mode", default_mode)

        label = _LABEL_OVERRIDES.get(entity_type, _humanize(entity_type))

        registry[entity_type] = {
            "table": table_name,
            "label": label,
            "category": category,
            "default_mode": default_mode,
        }

    logger.debug("Delete registry: auto-discovered %d entity types (%d main, %d child)",
                 len(registry),
                 sum(1 for v in registry.values() if v["category"] == "main"),
                 sum(1 for v in registry.values() if v["category"] == "child"))

    return registry


# Build at import time (after all models are loaded via app.models.common import above)
ENTITY_TYPE_REGISTRY: dict[str, dict[str, Any]] = {}


def _ensure_registry() -> dict[str, dict[str, Any]]:
    """Lazily build the registry on first use to avoid circular imports."""
    global ENTITY_TYPE_REGISTRY
    if not ENTITY_TYPE_REGISTRY:
        ENTITY_TYPE_REGISTRY = _build_registry()
    return ENTITY_TYPE_REGISTRY


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
    registry = _ensure_registry()
    reg = registry.get(entity_type)
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
    registry = _ensure_registry()
    reg = registry.get(entity_type)
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
    registry = _ensure_registry()
    counts: dict[str, int] = {}
    for entity_type, reg in registry.items():
        if reg["category"] != "main":
            continue  # Only main entities support soft-delete / archived
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
    registry = _ensure_registry()
    if entity_type not in registry:
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
