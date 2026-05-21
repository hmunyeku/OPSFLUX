"""Add external certificate verification metadata.

Revision ID: 189_compliance_external_certificate_verification
Revises: 188_compliance_authorization_centers
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "189_compliance_external_certificate_verification"
down_revision = "188_compliance_authorization_centers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("compliance_records", sa.Column("title", sa.String(length=300), nullable=True))
    op.add_column("compliance_records", sa.Column("external_verification_provider", sa.String(length=50), nullable=True))
    op.add_column("compliance_records", sa.Column("external_verification_id", sa.String(length=200), nullable=True))
    op.add_column("compliance_records", sa.Column("external_verification_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("compliance_records", sa.Column("external_verification_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("compliance_records", "external_verification_payload")
    op.drop_column("compliance_records", "external_verification_checked_at")
    op.drop_column("compliance_records", "external_verification_id")
    op.drop_column("compliance_records", "external_verification_provider")
    op.drop_column("compliance_records", "title")
