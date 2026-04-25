"""Add body measurements (height, weight) to users and user_health_conditions table.

Revision ID: 041
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Body measurements on users
    op.add_column("users", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("weight", sa.Float(), nullable=True))

    # User health conditions
    op.create_table(
        "user_health_conditions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("condition_code", sa.String(100), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_health_conditions_user_id", "user_health_conditions", ["user_id"])
    op.create_index("ix_user_health_conditions_unique", "user_health_conditions", ["user_id", "condition_code"], unique=True)


def downgrade() -> None:
    op.drop_table("user_health_conditions")
    op.drop_column("users", "weight")
    op.drop_column("users", "height")
