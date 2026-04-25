"""Project progress weighting — choose how project % is computed.

Adds:
  - Project.progress_weight_method (varchar(20), nullable)
      One of: 'equal' | 'effort' | 'duration' | 'manual'
      NULL  → fallback to the entity-scoped admin default setting
              `projets.default_progress_weight_method` (then to 'equal').
  - ProjectTask.weight (numeric(10,2), nullable)
      Manual weight, only used when the project's method is 'manual'.

The fields are nullable so the migration is non-breaking on production
(no backfill needed). Existing projects keep behaving as before until
their owner picks a method.

Revision ID: 122_project_progress_weight
Revises: 121_add_entity_id_to_article_catalog
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa


revision = "122_project_progress_weight"
down_revision = "121_add_entity_id_to_article_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("progress_weight_method", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "project_tasks",
        sa.Column("weight", sa.Numeric(precision=10, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_tasks", "weight")
    op.drop_column("projects", "progress_weight_method")
