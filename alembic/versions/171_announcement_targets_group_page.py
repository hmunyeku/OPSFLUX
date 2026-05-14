"""Etend ck_announcement_target_type pour autoriser 'group' et 'page'.

SUP-0043 : annonces avec ciblage etendu (groupe d'utilisateurs / page route).
Le modele Announcement avait deja les valeurs all/entity/role/module/user.
On ajoute :
- 'group' : ciblage par UserGroup (equipe/departement)
- 'page'  : ciblage par route frontend, target_value = chemin URL
            (ex: '/projets', '/projets/uuid-xxx/tasks')

Revision ID: 171_announcement_targets_group_page
Revises: 170_papyrus_ext_created_at
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op


revision: str = "171_announcement_targets_group_page"
down_revision: Union[str, None] = "170_papyrus_ext_created_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import sqlalchemy as sa

    # 1. Etend la taille de target_value pour absorber les chemins de page longs
    op.alter_column(
        "announcements",
        "target_value",
        existing_type=sa.String(length=200),
        type_=sa.String(length=500),
        existing_nullable=True,
    )

    # 2. Drop ancien constraint, recree avec enum etendu
    op.drop_constraint(
        "ck_announcement_target_type",
        "announcements",
        type_="check",
    )
    op.create_check_constraint(
        "ck_announcement_target_type",
        "announcements",
        "target_type IN ('all','entity','role','module','user','group','page')",
    )


def downgrade() -> None:
    import sqlalchemy as sa

    # Nettoie d'abord les rows qui auraient utilise les nouvelles valeurs
    # pour eviter un fail du check constraint sur des donnees existantes.
    op.execute(
        "UPDATE announcements SET target_type = 'all', target_value = NULL "
        "WHERE target_type IN ('group','page')"
    )
    # Tronque les target_value > 200 chars avant de retrecir la colonne
    op.execute(
        "UPDATE announcements SET target_value = LEFT(target_value, 200) "
        "WHERE target_value IS NOT NULL AND LENGTH(target_value) > 200"
    )
    op.drop_constraint(
        "ck_announcement_target_type",
        "announcements",
        type_="check",
    )
    op.create_check_constraint(
        "ck_announcement_target_type",
        "announcements",
        "target_type IN ('all','entity','role','module','user')",
    )
    op.alter_column(
        "announcements",
        "target_value",
        existing_type=sa.String(length=500),
        type_=sa.String(length=200),
        existing_nullable=True,
    )
