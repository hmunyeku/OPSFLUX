"""Add archived column to main entity tables missing SoftDeleteMixin.

Revision ID: 032
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None

# Tables that need the `archived` boolean column for soft-delete support.
# Only main entities — junction, audit, cache, and lock tables are excluded.
TABLES = [
    # planner
    "planner_activities",
    "planner_conflicts",
    # report_editor
    "doc_types",
    "documents",
    "templates",
    "distribution_lists",
    "arborescence_nodes",
    # pid_pfd
    "pid_documents",
    "equipment",
    "dcs_tags",
    "process_lib_items",
    # messaging
    "announcements",
    "security_rules",
    # dashboard
    "dashboards",
    "dashboard_tabs",
    # core (workflow)
    "workflow_definitions",
    # sub-entities that may be configured for soft-delete
    "addresses",
    "phones",
    "tags",
    "notes",
    "attachments",
    "notifications",
    "email_templates",
    "pdf_templates",
]


def upgrade() -> None:
    for table in TABLES:
        # Skip if column already exists (idempotent)
        conn = op.get_bind()
        result = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = 'archived'"
            ),
            {"t": table},
        )
        if result.fetchone() is None:
            op.add_column(
                table,
                sa.Column(
                    "archived",
                    sa.Boolean(),
                    nullable=False,
                    server_default="false",
                ),
            )


def downgrade() -> None:
    for table in reversed(TABLES):
        try:
            op.drop_column(table, "archived")
        except Exception:
            pass  # Column may not exist if upgrade was partial
