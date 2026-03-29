"""Polymorphic cost imputations — replace ads_imputations with core cost_imputations.

1. Create cost_imputations table (owner_type + owner_id pattern)
2. Migrate data from ads_imputations
3. Drop ads_imputations

Revision ID: 075_polymorphic_cost_imputations
Revises: 074_paxlog_phase2b_gaps
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "075_polymorphic_cost_imputations"
down_revision = "074_paxlog_phase2b_gaps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create cost_imputations table
    op.create_table(
        "cost_imputations",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("wbs_id", UUID(as_uuid=True), nullable=True),
        sa.Column("cost_center_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id"), nullable=True),
        sa.Column("percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("cross_imputation", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_cost_imp_pct"),
    )
    op.create_index("idx_cost_imp_owner", "cost_imputations", ["owner_type", "owner_id"])
    op.create_index("idx_cost_imp_project", "cost_imputations", ["project_id"])
    op.create_index("idx_cost_imp_cost_center", "cost_imputations", ["cost_center_id"])

    # 2. Migrate data from ads_imputations → cost_imputations
    # ads_imputations has: id, ads_id, project_id, wbs_id, cost_center_id, percentage, cross_imputation, notes
    # We need to look up ads.requester_id as created_by
    op.execute(
        """
        INSERT INTO cost_imputations (id, owner_type, owner_id, project_id, wbs_id, cost_center_id,
                                      percentage, cross_imputation, notes, created_by, created_at, updated_at)
        SELECT ai.id, 'ads', ai.ads_id, ai.project_id, ai.wbs_id, ai.cost_center_id,
               ai.percentage, ai.cross_imputation, ai.notes, a.requester_id, NOW(), NOW()
        FROM ads_imputations ai
        JOIN ads a ON a.id = ai.ads_id
        """
    )

    # 3. Drop old table
    op.drop_index("idx_ads_imp_ads", table_name="ads_imputations")
    op.drop_index("idx_ads_imp_project", table_name="ads_imputations")
    op.drop_table("ads_imputations")


def downgrade() -> None:
    # Recreate ads_imputations
    op.create_table(
        "ads_imputations",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("wbs_id", UUID(as_uuid=True), nullable=True),
        sa.Column("cost_center_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id"), nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("cross_imputation", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_ads_imp_pct"),
    )
    op.create_index("idx_ads_imp_ads", "ads_imputations", ["ads_id"])
    op.create_index("idx_ads_imp_project", "ads_imputations", ["project_id"])

    # Migrate data back
    op.execute(
        """
        INSERT INTO ads_imputations (id, ads_id, project_id, wbs_id, cost_center_id, percentage, cross_imputation, notes)
        SELECT id, owner_id, project_id, wbs_id, cost_center_id, percentage, cross_imputation, notes
        FROM cost_imputations
        WHERE owner_type = 'ads'
        """
    )

    # Drop cost_imputations
    op.drop_index("idx_cost_imp_owner", table_name="cost_imputations")
    op.drop_index("idx_cost_imp_project", table_name="cost_imputations")
    op.drop_index("idx_cost_imp_cost_center", table_name="cost_imputations")
    op.drop_table("cost_imputations")
