"""Add archived column to compliance_rules for SoftDeleteMixin.

Enables configurable delete policy (soft archive vs hard delete).
Draft rules (v1, unused) can still be hard-deleted per policy.

Revision ID: 054
"""

import sqlalchemy as sa
from alembic import op

revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_rules",
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("compliance_rules", "archived")
