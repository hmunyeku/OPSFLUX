"""Add external compliance source fields to compliance_types.

Allows each compliance type to be sourced from OpsFlux, an external system,
or both (cumulative check).

Revision ID: 057
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_types",
        sa.Column("compliance_source", sa.String(20), nullable=False, server_default="opsflux"),
    )
    op.add_column(
        "compliance_types",
        sa.Column("external_provider", sa.String(50), nullable=True),
    )
    op.add_column(
        "compliance_types",
        sa.Column("external_mapping", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("compliance_types", "external_mapping")
    op.drop_column("compliance_types", "external_provider")
    op.drop_column("compliance_types", "compliance_source")
