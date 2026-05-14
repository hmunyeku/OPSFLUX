"""Seed atomic role × permission matrix for the 17 starter roles at startup.

Called from ``permission_sync.sync_permissions_and_roles()`` AFTER permissions
and roles have been upserted. Idempotent: every INSERT uses ON CONFLICT DO NOTHING.

Why a runtime service (not a migration):
- Alembic migrations run before the backend starts, BEFORE ``permission_sync``
  has upserted the dynamic module permissions. So a migration trying to link
  roles to those permissions would fail FK and SKIP silently.
- A startup service runs AFTER ``permission_sync`` has populated ``permissions``,
  so the linking actually happens.
- Idempotent: re-running on every startup is safe and self-healing if new
  permissions are added to module manifests.

Migration 177 (alembic) was a first attempt at this matrix but it's
ineffective at the alembic stage because the namespaced 3-segment codes
(``asset.asset.read`` etc.) don't yet exist in the DB at that time. This
service supersedes 177's intent and uses the actual codes seeded by
``permission_sync`` (which include both the legacy 2-segment codes from
module manifests and the new 3-segment codes from migration 175).

Spec reference: docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md §5
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Permission lists per role (explicit cross-cutting permissions)
#
# These reference codes that should be seeded by either:
# - migration 001 (legacy ``user.read``, ``asset.read``, etc.)
# - migration 175 (new ``core.delegation.*``, ``system.*``, ``asset.installation.*``)
# - permission_sync.py (dynamic codes from module manifests: ``moc.*``, ``paxlog.*``, etc.)
#
# Codes that turn out NOT to exist in the DB at run time will be silently
# skipped by the FK-protected INSERT SELECT pattern below — no FK violation.
# ─────────────────────────────────────────────────────────────────────────────

# DO (Directeur des Opérations): top-level approvals + read everything
DO_EXTRA = [
    # MOC top-level approval (covers both legacy and namespaced variants)
    "moc.promote", "moc.transition", "moc.production.validate", "moc.validate",
    "moc.change.approve", "moc.change.transition", "moc.change.production_validate",
    # PaxLog ADS approval
    "paxlog.ads.approve",
    # Planner top-level
    "planner.activity.validate",
    # Papyrus top-level
    "document.approve", "document.publish",
    "papyrus.document.approve", "papyrus.document.publish",
    # Delegations
    "core.delegation.read", "core.delegation.create",
]

# DPROD: under DO, production validation
DPROD_EXTRA = [
    "asset.update",
    "asset.installation.update",
    "moc.validate", "moc.production.validate", "moc.transition",
    "moc.change.validate", "moc.change.production_validate", "moc.change.transition",
    "paxlog.ads.approve",
    "planner.activity.validate",
    "document.approve",
    "papyrus.document.approve",
    "pid.validate_afc",
    "core.delegation.read", "core.delegation.create",
]

# SITE_MGR (Chef de Site): RWS on installation scope
SITE_MGR_EXTRA = [
    "asset.update",
    "asset.installation.update",
    "moc.create", "moc.update", "moc.delete",
    "moc.change.create", "moc.change.update", "moc.change.submit", "moc.change.delete",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "planner.activity.cancel",
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit",
    "paxlog.profile.create", "paxlog.profile.update",
    "document.create", "document.edit", "document.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "conformite.record.create", "conformite.record.update",
    "support.ticket.create", "support.ticket.update",
    "teams.member.manage",
    "core.delegation.read", "core.delegation.create",
]

# PROJ_MGR (Chef de Projet)
PROJ_MGR_EXTRA = [
    "moc.create", "moc.update", "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "planner.activity.cancel", "planner.activity.validate",
    "planner.capacity.update", "planner.conflict.resolve", "planner.priority.override",
    "document.create", "document.edit", "document.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "template.create", "template.edit",
    "papyrus.template.create", "papyrus.template.update",
    "project.create", "project.update",
    "project.task.create", "project.task.update", "project.task.assign",
    "project.milestone.create", "project.milestone.update",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# HSE_MGR (ex HSE_ADMIN): manages conformity & compliance
HSE_MGR_EXTRA = [
    "conformite.record.create", "conformite.record.update", "conformite.record.delete",
    "conformite.check", "conformite.verify",
    "conformite.rule.create", "conformite.rule.update", "conformite.rule.delete",
    "conformite.type.create", "conformite.type.update", "conformite.type.delete",
    "conformite.exemption.create", "conformite.exemption.update", "conformite.exemption.approve",
    "conformite.transfer.create",
    "conformite.jobposition.create", "conformite.jobposition.update", "conformite.jobposition.delete",
    "paxlog.compliance.manage",
    "paxlog.signalement.create",
    "paxlog.incident.create",
    "moc.create", "moc.update", "moc.change.create", "moc.change.update", "moc.change.submit",
    "document.create", "document.edit", "document.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "support.ticket.create", "support.ticket.update",
    "core.audit.read",
    "core.delegation.read", "core.delegation.create",
]

# MAINT_MGR (Responsable Maintenance)
MAINT_MGR_EXTRA = [
    "asset.update",
    "asset.installation.update",
    "pid.edit", "pid.equipment.edit", "pid.library.edit", "pid.tags.edit",
    "moc.create", "moc.update", "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "document.create", "document.edit", "document.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# DOC_CONTROLLER (Papyrus master)
DOC_CONTROLLER_EXTRA = [
    # Papyrus full except final approve
    "document.create", "document.edit", "document.delete",
    "document.submit", "document.reject", "document.publish",
    "document.share", "document.admin",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.delete",
    "papyrus.document.submit", "papyrus.document.reject", "papyrus.document.publish",
    "papyrus.document.share", "papyrus.document.manage",
    "template.create", "template.edit",
    "papyrus.template.create", "papyrus.template.update",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# PAX_COORD (ex PAX_ADMIN): paxlog full
PAX_COORD_EXTRA = [
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit", "paxlog.ads.cancel",
    "paxlog.profile.create", "paxlog.profile.update",
    "paxlog.credential.create", "paxlog.credential.validate",
    "paxlog.credtype.manage", "paxlog.credential_type.manage",
    "paxlog.compliance.manage",
    "paxlog.signalement.create",
    "paxlog.incident.create", "paxlog.incident.resolve",
    "paxlog.rotation.manage",
    "paxlog.stay.create", "paxlog.stay.approve",
    "travelwiz.boarding.manage",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# LOG_COORD (Logistique / Packlog)
LOG_COORD_EXTRA = [
    "packlog.cargo.create", "packlog.cargo.update", "packlog.cargo.receive",
    "tier.contact.manage",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# TRANSP_COORD (Transport / TravelWiz)
TRANSP_COORD_EXTRA = [
    "travelwiz.boarding.manage",
    "travelwiz.tracking.update",
    "travelwiz.voyage.create", "travelwiz.voyage.update", "travelwiz.voyage.validate",
    "travelwiz.manifest.create", "travelwiz.manifest.validate",
    "travelwiz.pickup.create", "travelwiz.pickup.update",
    "travelwiz.vector.create", "travelwiz.vector.update", "travelwiz.vector.delete",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# PLANNER (new role): planner full
PLANNER_EXTRA = [
    "planner.activity.create", "planner.activity.update", "planner.activity.delete",
    "planner.activity.submit", "planner.activity.validate", "planner.activity.cancel",
    "planner.capacity.update",
    "planner.conflict.resolve",
    "planner.priority.override",
    "workflow.instance.transition",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# MOC_VALIDATOR (new role): validate-only on MOC (segregation of duties)
MOC_VALIDATOR_EXTRA = [
    "moc.promote", "moc.validate", "moc.production.validate", "moc.transition",
    "moc.change.approve", "moc.change.validate", "moc.change.production_validate",
    "moc.change.transition",
    "moc.validator.invite",
    "core.delegation.read", "core.delegation.create",
]

# OPERATOR (new role): saisie / submission, no approve
OPERATOR_EXTRA = [
    "moc.create", "moc.update", "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "paxlog.profile.update",
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit",
    "paxlog.signalement.create",
    "document.create", "document.edit", "document.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "conformite.record.create", "conformite.record.update",
    "support.ticket.create", "support.ticket.update",
]

# PAX (new role, user_type=external): self-service (route-level OWN filter)
PAX_EXTRA = [
    "paxlog.profile.read", "paxlog.profile.update",
    "paxlog.ads.read",
    "paxlog.compliance.read",
    "paxlog.signalement.create",
    "travelwiz.tracking.read",
    "support.ticket.create", "support.ticket.update",
]

# TIER_CONTACT (new role, external company contact): very limited
TIER_CONTACT_EXTRA = [
    "tier.read",
    "packlog.cargo.read",
    "support.ticket.create",
]

# INTEGRATION_BOT (new role, system account): MCP + integration callbacks
INTEGRATION_BOT_EXTRA = [
    "mcp.gateway.manage", "mcp.token.create", "mcp.agent.execute",
    "workflow.instance.transition",
    "travelwiz.tracking.update",
    "paxlog.compliance.read",
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _grant_explicit(db: AsyncSession, role_code: str, codes: list[str]) -> int:
    """Grant a fixed list of permissions to a role (FK-safe via INSERT SELECT).

    Returns the number of liaisons inserted (rough — depends on conflicts).
    """
    if not codes:
        return 0
    # FK-safe pattern: only insert pairs where the permission exists.
    # The "SELECT … FROM permissions WHERE code IN (…)" filters silently.
    placeholders = ", ".join(f":code{i}" for i in range(len(codes)))
    params = {f"code{i}": c for i, c in enumerate(codes)}
    params["role_code"] = role_code
    sql = f"""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT :role_code, code FROM permissions
        WHERE code IN ({placeholders})
        ON CONFLICT DO NOTHING
    """
    result = await db.execute(text(sql), params)
    return result.rowcount or 0


async def _grant_all_reads(
    db: AsyncSession, role_code: str, exclude_namespaces: list[str] | None = None
) -> int:
    """Grant every non-deprecated, non-sensitive *.read permission to a role.

    Uses pattern matching on code suffix to cover both legacy 2-segment codes
    (``user.read``, ``asset.read``) AND new 3-segment namespaced codes
    (``asset.installation.read``, ``papyrus.document.read``).
    """
    # We use suffix matching ('.read' or '= read' if no dot at end) — the legacy
    # codes end in ``.read`` and the new ones too.
    base_where = "code LIKE '%%.read' AND COALESCE(deprecated, false) = false AND COALESCE(sensitive, false) = false"
    params = {"role_code": role_code}

    if exclude_namespaces:
        excl_clauses = " AND ".join(
            f"code NOT LIKE :ns{i}" for i in range(len(exclude_namespaces))
        )
        for i, ns in enumerate(exclude_namespaces):
            params[f"ns{i}"] = f"{ns}.%"
        sql = f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT :role_code, code FROM permissions
            WHERE {base_where} AND {excl_clauses}
            ON CONFLICT DO NOTHING
        """
    else:
        sql = f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT :role_code, code FROM permissions
            WHERE {base_where}
            ON CONFLICT DO NOTHING
        """
    result = await db.execute(text(sql), params)
    return result.rowcount or 0


async def _grant_namespace_reads(
    db: AsyncSession, role_code: str, namespaces: list[str]
) -> int:
    """Grant every *.read permission that belongs to one of the given namespaces."""
    if not namespaces:
        return 0
    ns_clauses = " OR ".join(f"code LIKE :ns{i}" for i in range(len(namespaces)))
    params = {"role_code": role_code}
    for i, ns in enumerate(namespaces):
        params[f"ns{i}"] = f"{ns}.%"
    sql = f"""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT :role_code, code FROM permissions
        WHERE code LIKE '%%.read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          AND ({ns_clauses})
        ON CONFLICT DO NOTHING
    """
    result = await db.execute(text(sql), params)
    return result.rowcount or 0


async def _clone_role_perms(
    db: AsyncSession, source_role: str, target_role: str
) -> int:
    """Copy all role_permissions from source_role into target_role (idempotent)."""
    sql = """
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT :target, permission_code FROM role_permissions
        WHERE role_code = :source
        ON CONFLICT DO NOTHING
    """
    result = await db.execute(text(sql), {"target": target_role, "source": source_role})
    return result.rowcount or 0


# ─────────────────────────────────────────────────────────────────────────────
# Main seed function
# ─────────────────────────────────────────────────────────────────────────────

async def seed_starter_role_matrix(db: AsyncSession) -> None:
    """Seed role × permission liaisons for the 17 starter roles + 3 aliases.

    Called at startup AFTER permission_sync has upserted all module permissions.
    Idempotent: every operation uses ON CONFLICT DO NOTHING.
    """
    total = 0

    # ── Aliases: clone perms from legacy roles ──
    total += await _clone_role_perms(db, "SUPER_ADMIN", "PLATFORM_ADMIN")
    total += await _clone_role_perms(db, "PAX_ADMIN", "PAX_COORD")
    total += await _clone_role_perms(db, "HSE_ADMIN", "HSE_MGR")

    # ── SECURITY_OFFICER: all reads (incl. sensitive) + key audit/export perms ──
    # all reads no exclusion
    sql_so_reads = """
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'SECURITY_OFFICER', code FROM permissions
        WHERE code LIKE '%.read'
          AND COALESCE(deprecated, false) = false
        ON CONFLICT DO NOTHING
    """
    r = await db.execute(text(sql_so_reads))
    total += r.rowcount or 0
    total += await _grant_explicit(db, "SECURITY_OFFICER", [
        "core.rbac.export",
        "core.user.audit_export",
        "core.delegation.read",
        "core.delegation.revoke",
        "core.audit.read",
        "audit.read",
    ])

    # ── DO: read everything tenant-scoped + top-level approvals ──
    total += await _grant_all_reads(db, "DO", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "DO", DO_EXTRA)

    # ── DPROD ──
    total += await _grant_all_reads(db, "DPROD", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "DPROD", DPROD_EXTRA)

    # ── SITE_MGR ──
    total += await _grant_all_reads(db, "SITE_MGR", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "SITE_MGR", SITE_MGR_EXTRA)

    # ── PROJ_MGR ──
    total += await _grant_all_reads(db, "PROJ_MGR", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "PROJ_MGR", PROJ_MGR_EXTRA)

    # ── HSE_MGR ──
    total += await _grant_all_reads(db, "HSE_MGR", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "HSE_MGR", HSE_MGR_EXTRA)

    # ── MAINT_MGR ──
    total += await _grant_all_reads(db, "MAINT_MGR", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "MAINT_MGR", MAINT_MGR_EXTRA)

    # ── DOC_CONTROLLER ──
    total += await _grant_all_reads(db, "DOC_CONTROLLER", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "DOC_CONTROLLER", DOC_CONTROLLER_EXTRA)

    # ── PAX_COORD (also cloned above) ──
    total += await _grant_all_reads(db, "PAX_COORD", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "PAX_COORD", PAX_COORD_EXTRA)

    # ── LOG_COORD ──
    total += await _grant_all_reads(db, "LOG_COORD", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "LOG_COORD", LOG_COORD_EXTRA)

    # ── TRANSP_COORD ──
    total += await _grant_all_reads(db, "TRANSP_COORD", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "TRANSP_COORD", TRANSP_COORD_EXTRA)

    # ── PLANNER ──
    total += await _grant_all_reads(db, "PLANNER", exclude_namespaces=["system"])
    total += await _grant_explicit(db, "PLANNER", PLANNER_EXTRA)

    # ── MOC_VALIDATOR: read MOC + workflow only, plus approve/validate ──
    total += await _grant_namespace_reads(db, "MOC_VALIDATOR", ["moc", "workflow", "dashboard"])
    total += await _grant_explicit(db, "MOC_VALIDATOR", MOC_VALIDATOR_EXTRA)

    # ── OPERATOR: read ops modules + saisie/submission ──
    total += await _grant_namespace_reads(db, "OPERATOR", [
        "asset", "tier", "moc", "planner", "paxlog", "packlog", "travelwiz",
        "pid", "conformite", "imputation", "dashboard", "workflow",
        "messaging", "support", "teams", "papyrus", "report", "document",
    ])
    total += await _grant_explicit(db, "OPERATOR", OPERATOR_EXTRA)

    # ── PAX (self-service): limited reads + own profile actions ──
    total += await _grant_namespace_reads(db, "PAX", [
        "paxlog", "travelwiz", "dashboard", "messaging",
    ])
    total += await _grant_explicit(db, "PAX", PAX_EXTRA)

    # ── TIER_CONTACT: external limited ──
    total += await _grant_namespace_reads(db, "TIER_CONTACT", [
        "tier", "packlog", "dashboard", "messaging",
    ])
    total += await _grant_explicit(db, "TIER_CONTACT", TIER_CONTACT_EXTRA)

    # ── INTEGRATION_BOT: no reads, just integration callbacks ──
    total += await _grant_explicit(db, "INTEGRATION_BOT", INTEGRATION_BOT_EXTRA)

    # ── Mirror legacy code liaisons to their namespaced replacement ──
    # PR-E pre-requisite: for each (role, legacy_code) pair, ensure
    # (role, new_namespaced_code) is also granted. Routes refactored to use the
    # new code (`require_permission("asset.asset.read")`) then succeed.
    # Reads from permissions.deprecated_for (filled by permission_sync) so we
    # don't duplicate the mapping table here.
    mirror_sql = """
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT rp.role_code, p.deprecated_for
        FROM role_permissions rp
        JOIN permissions p ON p.code = rp.permission_code
        WHERE p.deprecated = true
          AND p.deprecated_for IS NOT NULL
        ON CONFLICT DO NOTHING
    """
    mirror_result = await db.execute(text(mirror_sql))
    mirrored = mirror_result.rowcount or 0
    total += mirrored

    await db.commit()
    logger.info(
        "Starter role matrix seeded: ~%d role-permission liaisons total "
        "(of which %d mirrored from legacy → namespaced via deprecated_for, idempotent)",
        total,
        mirrored,
    )
