"""Add preferred_messaging_channel to users.

User can choose their preferred messaging channel (auto, whatsapp, sms, email).
Admin sets defaults via settings, user overrides in profile.

Revision ID: 056
"""

import sqlalchemy as sa
from alembic import op

revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_messaging_channel",
            sa.String(20),
            nullable=False,
            server_default="auto",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferred_messaging_channel")
