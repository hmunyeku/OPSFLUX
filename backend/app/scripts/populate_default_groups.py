"""
Script to populate default groups in the database.
Run this script to create standard organizational groups.
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models_rbac import Group
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_GROUPS = [
    {
        "code": "direction",
        "name": "Direction",
        "description": "Équipe de direction et management exécutif",
        "parent_id": None
    },
    {
        "code": "it",
        "name": "Département IT",
        "description": "Département informatique et systèmes d'information",
        "parent_id": None
    },
    {
        "code": "hr",
        "name": "Ressources Humaines",
        "description": "Département des ressources humaines",
        "parent_id": None
    },
    {
        "code": "finance",
        "name": "Finance & Comptabilité",
        "description": "Département financier et comptable",
        "parent_id": None
    },
    {
        "code": "operations",
        "name": "Opérations",
        "description": "Équipe des opérations quotidiennes",
        "parent_id": None
    },
    {
        "code": "support",
        "name": "Support Client",
        "description": "Équipe de support et assistance client",
        "parent_id": None
    },
    {
        "code": "sales",
        "name": "Ventes & Commercial",
        "description": "Équipe commerciale et ventes",
        "parent_id": None
    },
    {
        "code": "marketing",
        "name": "Marketing",
        "description": "Département marketing et communication",
        "parent_id": None
    },
    {
        "code": "production",
        "name": "Production",
        "description": "Équipe de production et fabrication",
        "parent_id": None
    },
    {
        "code": "qhse",
        "name": "Qualité, Hygiène, Sécurité, Environnement",
        "description": "Département QHSE",
        "parent_id": None
    }
]


def main() -> None:
    logger.info("Starting default groups population...")

    with Session(engine) as session:
        created = 0
        skipped = 0

        for group_data in DEFAULT_GROUPS:
            # Check if group already exists
            existing = session.exec(
                select(Group).where(Group.code == group_data["code"])
            ).first()

            if existing:
                logger.info(f"Group '{group_data['code']}' already exists, skipping...")
                skipped += 1
                continue

            # Create new group
            group = Group(
                code=group_data["code"],
                name=group_data["name"],
                description=group_data["description"],
                parent_id=group_data["parent_id"],
                is_active=True
            )
            session.add(group)
            created += 1
            logger.info(f"Created group: {group_data['code']} - {group_data['name']}")

        session.commit()

        logger.info(f"\nCompleted! Created: {created}, Skipped: {skipped}")
        logger.info(f"Total groups in database: {created + skipped}")


if __name__ == "__main__":
    main()
