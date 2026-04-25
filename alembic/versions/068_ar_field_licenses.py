"""Add ar_field_licenses table — polymorphic licence sub-model for fields.

Each field can have multiple licences (PSC, Concession, JOA, etc.)
with type, number, expiry, renewal tracking and document attachment.

Revision ID: 068
Revises: 067
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "068"
down_revision = "067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ar_field_licenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ar_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("license_type", sa.String(50), nullable=False),
        sa.Column("license_number", sa.String(100), nullable=False),
        sa.Column("authority", sa.String(200)),
        sa.Column("issue_date", sa.Date),
        sa.Column("expiry_date", sa.Date),
        sa.Column("working_interest_pct", sa.Numeric(5, 2)),
        sa.Column("status", sa.String(30), server_default="ACTIVE"),
        sa.Column("notes", sa.Text),
        sa.Column("document_url", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("idx_ar_field_licenses_field", "ar_field_licenses", ["field_id"])


def downgrade() -> None:
    op.drop_index("idx_ar_field_licenses_field")
    op.drop_table("ar_field_licenses")
