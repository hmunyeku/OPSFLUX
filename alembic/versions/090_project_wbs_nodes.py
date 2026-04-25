"""Add ProjectWBSNode table + project_tasks.wbs_node_id FK

Introduces a hierarchical Work Breakdown Structure for projects, with an
optional backlink from project_tasks so tasks can be grouped under a WBS
node. This also unblocks CostImputation.wbs_id which until now pointed to
a non-existent table (no FK enforced — still left as-is intentionally).

Revision ID: 090_project_wbs_nodes
Revises: 089_e2e_audit_fixes
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "090_project_wbs_nodes"
down_revision = "089_e2e_audit_fixes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_wbs_nodes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("project_wbs_nodes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cost_center_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("budget", sa.Float(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("project_id", "code", name="uq_wbs_project_code"),
    )
    op.create_index("idx_wbs_project", "project_wbs_nodes", ["project_id"])
    op.create_index("idx_wbs_parent", "project_wbs_nodes", ["parent_id"])

    # Add wbs_node_id FK on project_tasks
    op.add_column(
        "project_tasks",
        sa.Column(
            "wbs_node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("project_wbs_nodes.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_project_tasks_wbs", "project_tasks", ["wbs_node_id"])


def downgrade() -> None:
    op.drop_index("idx_project_tasks_wbs", table_name="project_tasks")
    op.drop_column("project_tasks", "wbs_node_id")
    op.drop_index("idx_wbs_parent", table_name="project_wbs_nodes")
    op.drop_index("idx_wbs_project", table_name="project_wbs_nodes")
    op.drop_table("project_wbs_nodes")
