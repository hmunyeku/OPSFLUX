"""Add asset capacity, planner rejection fields, and inter-module FK links.

Covers:
- Assets table: max_pax, permanent_ops_quota (capacity tracking)
- Planner activities: rejected_by, rejected_at, rejection_reason (rejection workflow)
- AdS table: planner_activity_id, project_id (inter-module links)
- Manifest passengers: ads_pax_id (link manifest PAX to AdS PAX entry)

Revision ID: 017_add_capacity_and_inter_module_links
Revises: 016_add_auth_security_planner_travelwiz
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "017_add_capacity_and_inter_module_links"
down_revision: Union[str, None] = "016_add_auth_security_planner_travelwiz"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # Asset capacity columns
    # ══════════════════════════════════════════════════════════════
    op.add_column(
        "assets",
        sa.Column("max_pax", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column(
            "permanent_ops_quota",
            sa.Integer(),
            nullable=True,
            server_default="0",
        ),
    )

    # ══════════════════════════════════════════════════════════════
    # Planner activity rejection fields — already created in 016 create_table
    # ══════════════════════════════════════════════════════════════
    # (rejected_by, rejected_at, rejection_reason included in 016)

    # ══════════════════════════════════════════════════════════════
    # AdS inter-module links
    # ══════════════════════════════════════════════════════════════
    op.add_column(
        "ads",
        sa.Column("planner_activity_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ads_planner_activity_id",
        "ads",
        "planner_activities",
        ["planner_activity_id"],
        ["id"],
    )
    op.add_column(
        "ads",
        sa.Column("project_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ads_project_id",
        "ads",
        "projects",
        ["project_id"],
        ["id"],
    )

    # ══════════════════════════════════════════════════════════════
    # ManifestPassenger link to AdS PAX
    # ══════════════════════════════════════════════════════════════
    op.add_column(
        "manifest_passengers",
        sa.Column("ads_pax_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_manifest_passengers_ads_pax_id",
        "manifest_passengers",
        "ads_pax",
        ["ads_pax_id"],
        ["id"],
    )

    # ══════════════════════════════════════════════════════════════
    # Indexes for FK columns used in lookups / joins
    # ══════════════════════════════════════════════════════════════
    op.create_index("idx_ads_planner_activity", "ads", ["planner_activity_id"])
    op.create_index("idx_ads_project", "ads", ["project_id"])
    op.create_index("idx_manifest_pax_ads", "manifest_passengers", ["ads_pax_id"])


def downgrade() -> None:
    # Indexes
    op.drop_index("idx_manifest_pax_ads", table_name="manifest_passengers")
    op.drop_index("idx_ads_project", table_name="ads")
    op.drop_index("idx_ads_planner_activity", table_name="ads")

    # ManifestPassenger -> AdS PAX
    op.drop_constraint("fk_manifest_passengers_ads_pax_id", "manifest_passengers", type_="foreignkey")
    op.drop_column("manifest_passengers", "ads_pax_id")

    # AdS inter-module links
    op.drop_constraint("fk_ads_project_id", "ads", type_="foreignkey")
    op.drop_column("ads", "project_id")
    op.drop_constraint("fk_ads_planner_activity_id", "ads", type_="foreignkey")
    op.drop_column("ads", "planner_activity_id")

    # Planner rejection fields — created in 016, not here

    # Asset capacity
    op.drop_column("assets", "permanent_ops_quota")
    op.drop_column("assets", "max_pax")
