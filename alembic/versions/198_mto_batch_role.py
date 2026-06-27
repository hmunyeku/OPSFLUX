"""mto import batch role — design | revise | unique (croisement de 2 MTO)

Revision ID: 198_mto_batch_role
Revises: 197_mto_module_tables

Migration ecrite a la main (alembic --autogenerate echoue sur un FK pre-existant
cost_centers.department_id -> departments hors metadata). Ajoute la colonne role
sur mto_import_batches pour distinguer les MTO design / revise (P1 croisement).
"""

import sqlalchemy as sa
from alembic import op

revision = "198_mto_batch_role"
down_revision = "197_mto_module_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mto_import_batches",
        sa.Column("role", sa.String(20), nullable=False, server_default="design"),
    )


def downgrade() -> None:
    op.drop_column("mto_import_batches", "role")
