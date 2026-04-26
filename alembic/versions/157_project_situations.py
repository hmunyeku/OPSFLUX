"""Add project_situations snapshot table.

Powers the project detail panel's "Métriques" tab — each save records
a point-in-time capture of the project's headline metrics so the team
can:

  - Audit qualitative read (situation_text + weather + trend) at any
    given moment.
  - Compute deltas (progress last week / 4 weeks) for the dashboard.
  - Plot historical charts of how the project evolved over time.

The "current" weather/trend lives on the Project row itself and is
updated independently. Situations are append-only; we never UPDATE,
only INSERT.

The `metrics` JSONB column carries computed counts (tasks_total,
tasks_done, members, milestones, hours_*, …) so we don't pay extra
queries on read AND so we can extend the schema without migrations.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "157_project_situations"
down_revision = "156_agent_run_attachments_manifest"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_situations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("captured_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weather", sa.String(length=20), nullable=True),
        sa.Column("trend", sa.String(length=10), nullable=True),
        sa.Column("situation_text", sa.Text(), nullable=True),
        sa.Column("metrics", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index(
        "idx_project_situations_project_captured",
        "project_situations",
        ["project_id", "captured_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_project_situations_project_captured", table_name="project_situations")
    op.drop_table("project_situations")
