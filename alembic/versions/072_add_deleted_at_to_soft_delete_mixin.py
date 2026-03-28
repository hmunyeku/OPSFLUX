"""Add deleted_at column to all tables using SoftDeleteMixin.

Revision ID: 072_deleted_at
Revises: 071_todos
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa


revision = "072_deleted_at"
down_revision = "071_todos"
branch_labels = None
depends_on = None

# All tables that use SoftDeleteMixin
SOFT_DELETE_TABLES = [
    "announcements",
    "security_rules",
    "transport_vectors",
    "voyages",
    "cargo_items",
    "dashboard_tabs",
    "dashboards",
    "tiers",
    "compliance_rules",
    "import_mappings",
    "support_tickets",
    "oil_fields",
    "oil_sites",
    "installations",
    "registry_equipments",
    "registry_pipelines",
    "pid_documents",
    "equipments",
    "dcs_tags",
    "process_lib_items",
    "planner_activities",
    "planner_conflicts",
    "doc_types",
    "documents",
    "templates",
    "arborescence_nodes",
    "distribution_lists",
    "pax_profiles",
    "ads",
]


def upgrade() -> None:
    conn = op.get_bind()
    for table in SOFT_DELETE_TABLES:
        # Only add column if table exists in the database
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :t"
        ), {"t": table})
        if result.fetchone():
            # Check column doesn't already exist
            col_check = conn.execute(sa.text(
                "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = 'deleted_at'"
            ), {"t": table})
            if not col_check.fetchone():
                op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    for table in SOFT_DELETE_TABLES:
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = 'deleted_at'"
        ), {"t": table})
        if result.fetchone():
            op.drop_column(table, "deleted_at")
