"""
Script to populate RBAC permissions (roles, groups, users.invite) in the database.
These permissions are required by the frontend to access RBAC pages.
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models_rbac import Permission, Role
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RBAC_PERMISSIONS = [
    # ROLES PERMISSIONS
    {
        "code": "roles.read",
        "name": "Voir les rôles",
        "description": "Permet de consulter la liste des rôles et leurs permissions",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "roles.create",
        "name": "Créer des rôles",
        "description": "Permet de créer de nouveaux rôles",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "roles.update",
        "name": "Modifier des rôles",
        "description": "Permet de modifier les rôles et leurs permissions",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "roles.delete",
        "name": "Supprimer des rôles",
        "description": "Permet de supprimer des rôles personnalisés",
        "module": "rbac",
        "is_default": False
    },
    # GROUPS PERMISSIONS
    {
        "code": "groups.read",
        "name": "Voir les groupes",
        "description": "Permet de consulter la liste des groupes et leurs membres",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "groups.create",
        "name": "Créer des groupes",
        "description": "Permet de créer de nouveaux groupes",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "groups.update",
        "name": "Modifier des groupes",
        "description": "Permet de modifier les groupes et leurs permissions",
        "module": "rbac",
        "is_default": False
    },
    {
        "code": "groups.delete",
        "name": "Supprimer des groupes",
        "description": "Permet de supprimer des groupes",
        "module": "rbac",
        "is_default": False
    },
    # USERS.INVITE PERMISSION
    {
        "code": "users.invite",
        "name": "Inviter des utilisateurs",
        "description": "Permet d'inviter de nouveaux utilisateurs via email",
        "module": "users",
        "is_default": False
    },
]


def main() -> None:
    logger.info("Starting RBAC permissions population...")

    with Session(engine) as session:
        created = 0
        skipped = 0

        for perm_data in RBAC_PERMISSIONS:
            # Check if permission already exists
            existing = session.exec(
                select(Permission).where(Permission.code == perm_data["code"])
            ).first()

            if existing:
                logger.info(f"Permission '{perm_data['code']}' already exists, skipping...")
                skipped += 1
                continue

            # Create new permission
            permission = Permission(
                code=perm_data["code"],
                name=perm_data["name"],
                description=perm_data["description"],
                module=perm_data["module"],
                is_default=perm_data["is_default"],
                is_active=True
            )
            session.add(permission)
            created += 1
            logger.info(f"Created permission: {perm_data['code']} - {perm_data['name']}")

        session.commit()

        # Assign all RBAC permissions to admin role
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        if admin_role:
            # Get all RBAC permissions
            rbac_perms = session.exec(
                select(Permission).where(
                    (Permission.module == "rbac") | (Permission.code == "users.invite")
                )
            ).all()

            for perm in rbac_perms:
                if perm not in admin_role.permissions:
                    admin_role.permissions.append(perm)

            session.add(admin_role)
            session.commit()
            logger.info(f"Assigned {len(rbac_perms)} RBAC permissions to admin role")

        logger.info(f"\nCompleted! Created: {created}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
