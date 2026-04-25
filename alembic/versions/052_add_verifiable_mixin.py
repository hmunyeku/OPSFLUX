"""Add VerifiableMixin columns to compliance_records, user_passports, user_visas, etc.

Revision ID: 052_add_verifiable
Revises: 051_add_job_position
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "052_add_verifiable"
down_revision = "051_add_job_position"
branch_labels = None
depends_on = None

TABLES = [
    "compliance_records",
    "user_passports",
    "user_visas",
    "social_securities",
    "user_vaccines",
    "medical_checks",
    "driving_licenses",
]


def upgrade() -> None:
    for table in TABLES:
        # Skip verified_by on compliance_records — it already exists
        if table != "compliance_records":
            op.add_column(table, sa.Column("verified_by", UUID(as_uuid=True), nullable=True))
            op.create_foreign_key(
                f"fk_{table}_verified_by", table, "users", ["verified_by"], ["id"],
            )

        op.add_column(
            table,
            sa.Column("verification_status", sa.String(20), server_default="pending", nullable=False),
        )
        op.add_column(table, sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("rejection_reason", sa.String(500), nullable=True))


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "rejection_reason")
        op.drop_column(table, "verified_at")
        op.drop_column(table, "verification_status")
        if table != "compliance_records":
            op.drop_constraint(f"fk_{table}_verified_by", table, type_="foreignkey")
            op.drop_column(table, "verified_by")
