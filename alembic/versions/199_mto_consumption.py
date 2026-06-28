"""mto consumption — consommation reelle pour reconciliation (P4 reliquat PERENCO)

Revision ID: 199_mto_consumption
Revises: 198_mto_batch_role

Migration ecrite a la main (alembic --autogenerate echoue sur un FK pre-existant
cost_centers.department_id -> departments hors metadata). Cree la table
mto_consumption : consommation reelle par article, rattachee a un projet et/ou un
batch MTO, pour le rapprochement commande/fourni vs consomme.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "199_mto_consumption"
down_revision = "198_mto_batch_role"
branch_labels = None
depends_on = None


def _id():
    return sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def _entity():
    return sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "mto_consumption",
        _id(), *_ts(), _entity(),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("mto_import_batches.id", ondelete="SET NULL")),
        sa.Column("code_article", sa.String(50), nullable=False),
        sa.Column("designation", sa.String(500)),
        sa.Column("qte", sa.Float(), nullable=False, server_default="0"),
    )
    op.create_index("idx_mto_conso_entity_project", "mto_consumption", ["entity_id", "project_id"])
    op.create_index("idx_mto_conso_entity_batch", "mto_consumption", ["entity_id", "batch_id"])
    op.create_index("idx_mto_conso_code", "mto_consumption", ["code_article"])


def downgrade() -> None:
    op.drop_table("mto_consumption")
