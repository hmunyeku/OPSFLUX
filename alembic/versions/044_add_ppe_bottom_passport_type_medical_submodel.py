"""Add ppe_clothing_size_bottom, passport_type, and user_medical_checks table.

Revision ID: 044
Revises: 043
"""

import sqlalchemy as sa
from alembic import op

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ppe_clothing_size_bottom to users
    op.add_column(
        "users",
        sa.Column("ppe_clothing_size_bottom", sa.String(20), nullable=True),
    )

    # Add passport_type to user_passports
    op.add_column(
        "user_passports",
        sa.Column("passport_type", sa.String(50), nullable=True),
    )

    # Create user_medical_checks table (replaces flat date fields)
    op.create_table(
        "user_medical_checks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("check_type", sa.String(50), nullable=False),  # general, international, subsidiary
        sa.Column("check_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),  # null = no expiry
        sa.Column("provider", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("document_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_medical_checks")
    op.drop_column("user_passports", "passport_type")
    op.drop_column("users", "ppe_clothing_size_bottom")
