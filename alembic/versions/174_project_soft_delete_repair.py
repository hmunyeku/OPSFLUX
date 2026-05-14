"""Idempotent add of deleted_at column to projects + SoftDeleteMixin alignment.

Bug #54 detecté en audit statique QA v3 phase 0 :
- La classe Project (app/models/common.py:1674) redéclarait `archived`
  localement mais N'HÉRITAIT PAS de SoftDeleteMixin → pas de colonne
  `deleted_at` côté BDD. Conséquence : l'archivage d'un projet ne laissait
  AUCUNE trace temporelle (only `archived=true` + `updated_at` qui peut
  changer pour mille autres raisons). Cassait l'audit ISO 9001/27001 pour
  la traçabilité des suppressions logiques.

Fix :
1. Modèle : Project hérite désormais de SoftDeleteMixin (donne archived
   + deleted_at gratuitement, server_default false + None).
2. BDD : cette migration ajoute la colonne `deleted_at` si elle n'existe
   pas (cas standard) ou no-op (cas où un admin l'aurait stamp avant).

Revision ID: 174_project_soft_delete_repair
Revises: 173_project_task_is_milestone_repair
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "174_project_soft_delete_repair"
down_revision: Union[str, None] = "173_project_task_is_milestone_repair"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("projects")}

    if "deleted_at" not in existing:
        op.add_column(
            "projects",
            sa.Column(
                "deleted_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=None,
            ),
        )
        # Index utile pour les requêtes WHERE archived=true ORDER BY deleted_at
        # (consultation des projets archivés récents).
        op.create_index(
            "idx_projects_deleted_at",
            "projects",
            ["deleted_at"],
            postgresql_where=sa.text("deleted_at IS NOT NULL"),
            if_not_exists=True,
        )


def downgrade() -> None:
    op.drop_index("idx_projects_deleted_at", table_name="projects", if_exists=True)
    op.drop_column("projects", "deleted_at")
