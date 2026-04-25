"""add ads allowed companies

Revision ID: 092_add_ads_allowed_companies
Revises: 091_add_travel_profile_fields_to_tier_contacts
Create Date: 2026-04-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "092_add_ads_allowed_companies"
down_revision = "091_add_travel_profile_fields_to_tier_contacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ads_allowed_companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ads_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ads_id"], ["ads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["tiers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ads_id", "company_id", name="uq_ads_allowed_company"),
    )
    op.create_index("idx_ads_allowed_companies_ads", "ads_allowed_companies", ["ads_id"], unique=False)
    op.create_index("idx_ads_allowed_companies_company", "ads_allowed_companies", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ads_allowed_companies_company", table_name="ads_allowed_companies")
    op.drop_index("idx_ads_allowed_companies_ads", table_name="ads_allowed_companies")
    op.drop_table("ads_allowed_companies")
