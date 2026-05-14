"""Idempotent add of is_milestone column to project_tasks (repairs orphan branch 145).

Bug #37 detected during QA session 17 :
- Migration 145_project_task_is_milestone existait mais sa chaine
  (down_revision=144_password_history) etait dans une branche morte
  alembic (head principal passe par 158 -> 170 sans 144-145-146).
- La BDD prod n'a donc PAS la colonne project_tasks.is_milestone.
- Mais le schema Pydantic ProjectTaskCreate l'exposait, le frontend
  l'envoyait, et `ProjectTask(**body.model_dump())` plantait avec
  AttributeError -> 500 sur POST /projects/{id}/tasks.

Fix idempotent : si la colonne n'existe pas, on l'ajoute. Si elle
existe deja (cas ou un admin aurait deja stamp manuellement la
migration 145), on no-op.

Revision ID: 173_project_task_is_milestone_repair
Revises: 172_mfa_trusted_devices
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "173_project_task_is_milestone_repair"
down_revision: Union[str, None] = "172_mfa_trusted_devices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("project_tasks")}

    if "is_milestone" not in existing:
        op.add_column(
            "project_tasks",
            sa.Column(
                "is_milestone",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )
        # Index pour les requetes WHERE project_id=X AND is_milestone=true
        # (selecteur de jalons cote frontend).
        op.create_index(
            "idx_project_tasks_milestone",
            "project_tasks",
            ["project_id", "is_milestone"],
            postgresql_where=sa.text("is_milestone = true"),
            if_not_exists=True,
        )


def downgrade() -> None:
    op.drop_index("idx_project_tasks_milestone", table_name="project_tasks", if_exists=True)
    op.drop_column("project_tasks", "is_milestone")
