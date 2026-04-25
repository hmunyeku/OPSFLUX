"""Add attachment_required to compliance_rules.

When true, verification cannot proceed without at least one attachment.
Defaults to true (PJ required).

Revision ID: 059
"""

import sqlalchemy as sa
from alembic import op

revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_rules",
        sa.Column("attachment_required", sa.Boolean(), server_default="true", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("compliance_rules", "attachment_required")
