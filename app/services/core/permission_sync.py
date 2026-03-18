"""Permission sync — upsert module permissions and roles into DB at startup.

Called from lifespan after all modules are registered in the ModuleRegistry.
Idempotent: safe to call on every startup (D-021).
"""

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import async_session_factory
from app.core.module_registry import ModuleRegistry
from app.models.common import Permission, Role, RolePermission

logger = logging.getLogger(__name__)


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
            {"code": "core.rbac.manage", "name": "Manage RBAC", "module": "core"},
            {"code": "core.rbac.read", "name": "Read RBAC", "module": "core"},
            {"code": "core.users.read", "name": "Read Users", "module": "core"},
            {"code": "core.users.manage", "name": "Manage Users", "module": "core"},
            {"code": "core.audit.read", "name": "Read Audit Log", "module": "core"},
            {"code": "core.settings.manage", "name": "Manage Settings", "module": "core"},
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
        role_permissions_map["SUPER_ADMIN"] = ["*"]
        role_permissions_map["READER"] = [
            p["code"] for p in all_permissions if p["code"].endswith(".read")
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

        await db.commit()
        logger.info("Permission sync: completed successfully")
