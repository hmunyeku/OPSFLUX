"""
Script pour assigner les permissions orphelines au rôle admin.
Les permissions orphelines sont celles qui ne sont assignées à aucun rôle.
"""

from sqlmodel import Session, select
from sqlalchemy import text
from app.core.db import engine
from app.models_rbac import Permission, Role
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Recherche des permissions orphelines...")

    with Session(engine) as session:
        # Trouver toutes les permissions orphelines
        orphan_perms = session.exec(
            text("""
                SELECT p.id, p.code, p.module
                FROM permission p
                LEFT JOIN role_permission_link rpl ON p.id = rpl.permission_id
                WHERE rpl.role_id IS NULL
                ORDER BY p.module, p.code
            """)
        ).all()

        if not orphan_perms:
            logger.info("✓ Aucune permission orpheline trouvée")
            return

        logger.info(f"Trouvé {len(orphan_perms)} permissions orphelines:")
        for perm in orphan_perms:
            logger.info(f"  - {perm.code} ({perm.module})")

        # Récupérer le rôle admin
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        if not admin_role:
            logger.error("✗ Rôle admin introuvable!")
            return

        # Assigner toutes les permissions orphelines au rôle admin
        assigned = 0
        for perm_data in orphan_perms:
            perm = session.exec(
                select(Permission).where(Permission.id == perm_data.id)
            ).first()

            if perm and perm not in admin_role.permissions:
                admin_role.permissions.append(perm)
                assigned += 1
                logger.info(f"✓ Assigné '{perm.code}' au rôle admin")

        if assigned > 0:
            session.add(admin_role)
            session.commit()
            logger.info(f"\n✅ {assigned} permissions assignées au rôle admin")
        else:
            logger.info("Aucune nouvelle assignation nécessaire")


if __name__ == "__main__":
    main()
