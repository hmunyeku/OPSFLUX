"""Permission sync — upsert module permissions and roles into DB at startup.

Called from lifespan after all modules are registered in the ModuleRegistry.
Idempotent: safe to call on every startup (D-021).
"""

import logging

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import async_session_factory
from app.core.module_registry import ModuleRegistry
from app.models.common import Permission, Role, RolePermission

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Deprecation mapping (legacy → new namespaced code) — Spec Annexe A
# ─────────────────────────────────────────────────────────────────────────────
# Codes flagged here are still seeded and functional (routes still use them),
# but admins see them as "deprecated" in the UI/export. A future PR-G migration
# will sweep route code + remove the legacy codes entirely.
DEPRECATED_PERMISSION_MAPPING: dict[str, str] = {
    # Role / RBAC consolidation
    "role.manage": "core.rbac.manage",
    "audit.read": "core.audit.read",
    # User legacy → core.user.*
    "user.read": "core.user.read",
    "user.create": "core.user.create",
    "user.update": "core.user.update",
    "user.delete": "core.user.delete",
    # Entity legacy → core.entity.*
    "entity.read": "core.entity.read",
    "entity.manage": "core.entity.update",
    # Setting legacy → core.setting.*
    "setting.read": "core.setting.read",
    "setting.write": "core.setting.update",
    # Notification legacy → core.notification.*
    "notification.read": "core.notification.read",
    # Asset legacy → asset.asset.*
    "asset.read": "asset.asset.read",
    "asset.create": "asset.asset.create",
    "asset.update": "asset.asset.update",
    "asset.delete": "asset.asset.delete",
    # Tier legacy → tier.tier.*
    "tier.read": "tier.tier.read",
    "tier.create": "tier.tier.create",
    "tier.update": "tier.tier.update",
    "tier.delete": "tier.tier.delete",
    # Papyrus (document.* → papyrus.document.*)
    "document.read": "papyrus.document.read",
    "document.create": "papyrus.document.create",
    "document.edit": "papyrus.document.update",
    "document.delete": "papyrus.document.delete",
    "document.submit": "papyrus.document.submit",
    "document.approve": "papyrus.document.approve",
    "document.reject": "papyrus.document.reject",
    "document.publish": "papyrus.document.publish",
    "document.share": "papyrus.document.share",
    "document.admin": "papyrus.document.manage",
    "template.create": "papyrus.template.create",
    "template.edit": "papyrus.template.update",
    # MOC legacy 2-segment → moc.change.*
    "moc.read": "moc.change.read",
    "moc.create": "moc.change.create",
    "moc.update": "moc.change.update",
    "moc.delete": "moc.change.delete",
    "moc.transition": "moc.change.transition",
    "moc.validate": "moc.change.validate",
    "moc.promote": "moc.change.approve",
    "moc.manage": "moc.change.manage",
    # PaxLog renames
    "paxlog.credtype.manage": "paxlog.credential_type.manage",
    "paxlog.stay.create": "paxlog.stay_program.create",
    # PID legacy 2-segment → pid.diagram.*
    "pid.read": "pid.diagram.read",
    "pid.create": "pid.diagram.create",
    "pid.edit": "pid.diagram.update",
    "pid.admin": "pid.diagram.manage",
    "pid.export": "pid.diagram.export",
    "pid.validate_afc": "pid.diagram.validate_afc",
    "pid.equipment.edit": "pid.equipment.update",
    "pid.library.edit": "pid.library.update",
    "pid.tags.edit": "pid.tag.update",
    "pid.tags.read": "pid.tag.read",
    # Conformite legacy
    "conformite.check": "conformite.record.check",
    "conformite.verify": "conformite.record.verify",
    "conformite.jobposition.read": "conformite.job_position.read",
    "conformite.jobposition.create": "conformite.job_position.create",
    "conformite.jobposition.update": "conformite.job_position.update",
    "conformite.jobposition.delete": "conformite.job_position.delete",
    # Teams legacy 2-segment → teams.team.*
    "teams.read": "teams.team.read",
    "teams.create": "teams.team.create",
    "teams.update": "teams.team.update",
    "teams.delete": "teams.team.delete",
    # Cost-center / department legacy → imputation.*
    "cost_center.create": "imputation.cost_center.create",
    "cost_center.update": "imputation.cost_center.update",
    "cost_center.delete": "imputation.cost_center.delete",
    "department.create": "imputation.department.create",
    "department.update": "imputation.department.update",
    "department.delete": "imputation.department.delete",
    # Dashboard legacy 2-segment
    "dashboard.read": "dashboard.dashboard.read",
    "dashboard.customize": "dashboard.dashboard.customize",
    "dashboard.admin": "dashboard.dashboard.manage",
    # Admin legacy → system.*
    "admin.system": "system.platform.admin",
    "admin.users.read": "system.user.read",
    "admin.users.create": "system.user.create",
}


async def _seed_namespaced_aliases(db) -> None:
    """Create the new namespaced codes (`asset.asset.read` etc.) in the permissions table.

    For each (old, new) entry in ``DEPRECATED_PERMISSION_MAPPING``, ensures the
    NEW code exists with parsed namespace/resource/action. Without this, routes
    refactored to use the new code would 403 (FK on role_permissions would skip
    the link silently).

    Idempotent: ON CONFLICT DO NOTHING — never overwrites existing codes.
    """
    if not DEPRECATED_PERMISSION_MAPPING:
        return
    rows: list[dict[str, str | None]] = []
    for old_code, new_code in DEPRECATED_PERMISSION_MAPPING.items():
        parts = new_code.split(".")
        if len(parts) == 3:
            namespace, resource, action = parts
        elif len(parts) == 2:
            namespace, resource, action = parts[0], None, parts[1]
        else:
            # Unexpected shape; skip gracefully
            continue
        # Auto-derive a human-readable name
        name = new_code.replace(".", " › ").replace("_", " ").title()
        rows.append({
            "code": new_code,
            "name": name,
            "namespace": namespace,
            "resource": resource,
            "action": action,
            # module field is filled best-effort from the namespace
            "module": namespace,
        })
    if not rows:
        return
    # Bulk upsert via pg_insert ... ON CONFLICT DO NOTHING (preserves any
    # admin customisation on existing rows)
    stmt = pg_insert(Permission).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["code"])
    result = await db.execute(stmt)
    logger.info(
        "Permission sync: seeded %d namespaced alias codes (%d in mapping)",
        result.rowcount or 0,
        len(DEPRECATED_PERMISSION_MAPPING),
    )


async def _mark_deprecated_permissions(db) -> None:
    """Flag legacy permission codes as deprecated, pointing to their replacement.

    Idempotent: only updates rows where deprecated is currently false or
    deprecated_for differs from the current target. Codes that don't exist in
    the permissions table are silently ignored.
    """
    if not DEPRECATED_PERMISSION_MAPPING:
        return
    # Single bulk UPDATE using CASE for efficiency
    cases = " ".join(
        f"WHEN code = :old{i} THEN :new{i}"
        for i in range(len(DEPRECATED_PERMISSION_MAPPING))
    )
    codes_in = ", ".join(f":old{i}" for i in range(len(DEPRECATED_PERMISSION_MAPPING)))
    params: dict[str, str] = {}
    for i, (old, new) in enumerate(DEPRECATED_PERMISSION_MAPPING.items()):
        params[f"old{i}"] = old
        params[f"new{i}"] = new
    sql = f"""
        UPDATE permissions
        SET deprecated = true,
            deprecated_for = CASE {cases} END
        WHERE code IN ({codes_in})
          AND (COALESCE(deprecated, false) = false
               OR deprecated_for IS DISTINCT FROM (CASE {cases} END))
    """
    result = await db.execute(text(sql), params)
    logger.info(
        "Permission sync: flagged %d legacy codes as deprecated (mapping table has %d entries)",
        result.rowcount or 0,
        len(DEPRECATED_PERMISSION_MAPPING),
    )


async def sync_permissions_and_roles() -> None:
    """Sync all module permissions and roles to the database.

    For each registered module:
    - Upsert Permission rows from manifest.permissions
    - Upsert Role rows from manifest.roles
    - Upsert RolePermission associations from manifest.roles[].permissions
    """
    registry = ModuleRegistry()
    modules = registry.get_all_modules()

    async with async_session_factory() as db:
        # ── Collect all permissions across all modules ──
        all_permissions: list[dict] = []
        for module in modules:
            for perm_code in module.permissions:
                # Derive a human-readable name from the code
                name = perm_code.replace(".", " › ").replace("_", " ").title()
                all_permissions.append({
                    "code": perm_code,
                    "name": name,
                    "module": module.slug,
                })

        # Add core RBAC permissions (not declared by any module)
        core_permissions = [
            {"code": "admin.system", "name": "Admin System", "module": "core"},
            {"code": "admin.users.read", "name": "Admin Read Users", "module": "core"},
            {"code": "admin.users.create", "name": "Admin Create Users", "module": "core"},
            {"code": "core.rbac.manage", "name": "Manage RBAC", "module": "core"},
            {"code": "core.rbac.read", "name": "Read RBAC", "module": "core"},
            {"code": "core.users.read", "name": "Read Users", "module": "core"},
            {"code": "core.users.manage", "name": "Manage Users", "module": "core"},
            {"code": "core.audit.read", "name": "Read Audit Log", "module": "core"},
            {"code": "core.settings.manage", "name": "Manage Settings", "module": "core"},
            {"code": "core.integrations.manage", "name": "Manage Integrations", "module": "core"},
            {"code": "core.entity.read", "name": "Read Entities", "module": "core"},
            {"code": "core.entity.create", "name": "Create Entity", "module": "core"},
            {"code": "core.entity.update", "name": "Update Entity", "module": "core"},
            {"code": "core.entity.delete", "name": "Delete Entity", "module": "core"},
            {"code": "user.read", "name": "Read Users", "module": "core"},
            {"code": "user.create", "name": "Create Users", "module": "core"},
            {"code": "user.update", "name": "Update Users", "module": "core"},
            {"code": "department.create", "name": "Create Business Units", "module": "core"},
            {"code": "department.update", "name": "Update Business Units", "module": "core"},
            {"code": "department.delete", "name": "Delete Business Units", "module": "core"},
            {"code": "cost_center.create", "name": "Create Cost Centers", "module": "core"},
            {"code": "cost_center.update", "name": "Update Cost Centers", "module": "core"},
            {"code": "cost_center.delete", "name": "Delete Cost Centers", "module": "core"},
            {"code": "imputation.read", "name": "Read Imputations", "module": "core"},
            {"code": "imputation.create", "name": "Create Imputations", "module": "core"},
            {"code": "imputation.update", "name": "Update Imputations", "module": "core"},
            {"code": "imputation.delete", "name": "Delete Imputations", "module": "core"},
            {"code": "imputation.template.manage", "name": "Manage Imputation OTP Templates", "module": "core"},
            {"code": "imputation.assignment.manage", "name": "Manage Imputation Assignments", "module": "core"},
            {"code": "*", "name": "All Permissions (Super Admin)", "module": "core"},
        ]
        all_permissions.extend(core_permissions)

        # Upsert permissions
        if all_permissions:
            stmt = pg_insert(Permission).values(all_permissions)
            stmt = stmt.on_conflict_do_update(
                index_elements=["code"],
                set_={"name": stmt.excluded.name, "module": stmt.excluded.module},
            )
            await db.execute(stmt)
            logger.info("Permission sync: upserted %d permissions", len(all_permissions))

        # ── Collect all roles across all modules ──
        all_roles: list[dict] = []
        role_permissions_map: dict[str, list[str]] = {}

        for module in modules:
            for role_def in module.roles:
                code = role_def["code"]
                all_roles.append({
                    "code": code,
                    "name": role_def.get("name", code),
                    "description": role_def.get("description"),
                    "module": module.slug,
                })
                if "permissions" in role_def:
                    role_permissions_map[code] = role_def["permissions"]

        # Add core system roles (always present)
        system_roles = [
            {
                "code": "SUPER_ADMIN",
                "name": "Super Administrator",
                "description": "Full platform access — all permissions",
                "module": "core",
            },
            {
                "code": "TENANT_ADMIN",
                "name": "Tenant Administrator",
                "description": "Full tenant configuration access",
                "module": "core",
            },
            {
                "code": "SYS_ADMIN",
                "name": "System Administrator",
                "description": "User and group management",
                "module": "core",
            },
            {
                "code": "READER",
                "name": "Reader",
                "description": "Read-only access across all modules",
                "module": "core",
            },
        ]
        all_roles.extend(system_roles)

        # SUPER_ADMIN gets wildcard, READER gets all .read permissions
        # EXCEPT admin.* perms (Bug #67 QA v3 : IDOR) - admin.users.read
        # otherwise leaked PII (passport, medical, addresses) of all users to
        # any reader. admin.* perms are by nature admin-only and must remain in
        # SUPER_ADMIN / TENANT_ADMIN scope.
        # rbac.* and audit.* are also pulled out for the same reason.
        READER_DENYLIST_PREFIXES = ("admin.", "rbac.", "audit.", "core.rbac.")
        role_permissions_map["SUPER_ADMIN"] = ["*"]
        role_permissions_map["READER"] = [
            p["code"] for p in all_permissions
            if p["code"].endswith(".read")
            and not any(p["code"].startswith(prefix) for prefix in READER_DENYLIST_PREFIXES)
        ]

        # Upsert roles
        if all_roles:
            stmt = pg_insert(Role).values(all_roles)
            stmt = stmt.on_conflict_do_update(
                index_elements=["code"],
                set_={
                    "name": stmt.excluded.name,
                    "description": stmt.excluded.description,
                    "module": stmt.excluded.module,
                },
            )
            await db.execute(stmt)
            logger.info("Permission sync: upserted %d roles", len(all_roles))

        # ── Sync role → permission associations ──
        all_role_perms: list[dict] = []
        for role_code, perm_codes in role_permissions_map.items():
            for perm_code in perm_codes:
                all_role_perms.append({
                    "role_code": role_code,
                    "permission_code": perm_code,
                })

        if all_role_perms:
            stmt = pg_insert(RolePermission).values(all_role_perms)
            stmt = stmt.on_conflict_do_nothing()
            await db.execute(stmt)
            logger.info(
                "Permission sync: upserted %d role-permission associations",
                len(all_role_perms),
            )

        # ── Seed new namespaced alias codes (PR-E pre-requisite) ──
        # Creates rows like asset.asset.read alongside asset.read so routes
        # refactored to use the new code can find the perm in DB.
        try:
            await _seed_namespaced_aliases(db)
        except Exception as exc:
            logger.exception("Failed to seed namespaced aliases (non-fatal): %s", exc)

        # ── Flag deprecated legacy permission codes (PR-G prep) ──
        # Idempotent: marks codes like `asset.read` as deprecated_for=`asset.asset.read`.
        # Routes that still call require_permission("asset.read") keep working;
        # admins see the deprecation warning in the UI/export.
        try:
            await _mark_deprecated_permissions(db)
        except Exception as exc:
            logger.exception("Failed to flag deprecated permissions (non-fatal): %s", exc)

        await db.commit()
        logger.info("Permission sync: completed successfully")

        # ── Seed the starter role × permission matrix (PR-D runtime variant) ──
        # Runs AFTER permissions are upserted, so it can actually link the codes
        # added dynamically by module manifests. Idempotent (ON CONFLICT DO NOTHING).
        try:
            from app.services.core.seed_starter_role_matrix import seed_starter_role_matrix
            await seed_starter_role_matrix(db)
        except Exception as exc:
            # Don't block app startup if the seed fails — log and continue.
            logger.exception("Starter role matrix seed failed (non-fatal): %s", exc)
