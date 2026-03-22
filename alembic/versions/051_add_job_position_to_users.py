"""Add job_position_id to users table.

Revision ID: 051_add_job_position
Revises: 050
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "051_add_job_position"
down_revision = "050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("job_position_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_job_position_id",
        "users",
        "job_positions",
        ["job_position_id"],
        ["id"],
    )
    op.create_index("ix_users_job_position_id", "users", ["job_position_id"])


def downgrade() -> None:
    op.drop_index("ix_users_job_position_id", table_name="users")
    op.drop_constraint("fk_users_job_position_id", "users", type_="foreignkey")
    op.drop_column("users", "job_position_id")
