"""
Script to populate core permissions in the database.
Run this script to ensure all core permissions are created.
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models_rbac import Permission, Role
from uuid import UUID
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CORE_PERMISSIONS = [
    # CACHE
    {
        "code": "core.cache.read",
        "name": "Read Cache Stats",
        "description": "Ability to view cache statistics and info",
        "module": "core"
    },
    {
        "code": "core.cache.clear",
        "name": "Clear Cache",
        "description": "Ability to clear cache (flush all)",
        "module": "core"
    },
    {
        "code": "core.cache.delete_key",
        "name": "Delete Cache Key",
        "description": "Ability to delete specific cache keys",
        "module": "core"
    },
    {
        "code": "core.cache.search",
        "name": "Search Cache Keys",
        "description": "Ability to search and list cache keys",
        "module": "core"
    },
    # API KEYS
    {
        "code": "core.api_keys.create",
        "name": "Create API Key",
        "description": "Ability to create new API keys",
        "module": "core"
    },
    {
        "code": "core.api_keys.read",
        "name": "Read API Keys",
        "description": "Ability to view API keys (list and detail)",
        "module": "core"
    },
    {
        "code": "core.api_keys.update",
        "name": "Update API Key",
        "description": "Ability to update API key details",
        "module": "core"
    },
    {
        "code": "core.api_keys.delete",
        "name": "Delete API Key",
        "description": "Ability to delete/revoke API keys",
        "module": "core"
    },
]


def main() -> None:
    logger.info("Starting core permissions population...")

    with Session(engine) as session:
        created = 0
        skipped = 0

        for perm_data in CORE_PERMISSIONS:
            # Check if permission already exists
            existing = session.exec(
                select(Permission).where(Permission.code == perm_data["code"])
            ).first()

            if existing:
                logger.info(f"Permission {perm_data['code']} already exists, skipping...")
                skipped += 1
                continue

            # Create new permission
            permission = Permission(
                code=perm_data["code"],
                name=perm_data["name"],
                description=perm_data["description"],
                module=perm_data["module"],
                is_active=True
            )
            session.add(permission)
            created += 1
            logger.info(f"Created permission: {perm_data['code']}")

        session.commit()

        # Assign all permissions to admin and superadmin roles
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        if admin_role:
            # Get all core permissions
            core_perms = session.exec(
                select(Permission).where(Permission.module == "core")
            ).all()

            for perm in core_perms:
                if perm not in admin_role.permissions:
                    admin_role.permissions.append(perm)

            session.add(admin_role)
            session.commit()
            logger.info(f"Assigned {len(core_perms)} core permissions to admin role")

        logger.info(f"\nCompleted! Created: {created}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
