"""Add applicability column to compliance_rules.

Distinguishes permanent rules (always enforced) from contextual rules
(enforced only when context matches, e.g. site access request).

Revision ID: 055
"""

import sqlalchemy as sa
from alembic import op

revision = "055"
down_revision = "054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_rules",
        sa.Column("applicability", sa.String(20), server_default="permanent", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("compliance_rules", "applicability")
