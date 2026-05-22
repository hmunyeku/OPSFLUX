"""Add accreditation period to compliance authorized centers.

Revision ID: 191_compliance_authorized_center_accreditation
Revises: 190_attachment_hash_duplicate_guard
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa


revision = "191_compliance_authorized_center_accreditation"
down_revision = "190_attachment_hash_duplicate_guard"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_type_authorized_centers",
        sa.Column("accreditation_starts_at", sa.Date(), nullable=True),
    )
    op.add_column(
        "compliance_type_authorized_centers",
        sa.Column("accreditation_ends_at", sa.Date(), nullable=True),
    )
    op.create_index(
        "idx_compliance_authorized_centers_validity",
        "compliance_type_authorized_centers",
        ["compliance_type_id", "active", "accreditation_starts_at", "accreditation_ends_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_compliance_authorized_centers_validity", table_name="compliance_type_authorized_centers")
    op.drop_column("compliance_type_authorized_centers", "accreditation_ends_at")
    op.drop_column("compliance_type_authorized_centers", "accreditation_starts_at")
