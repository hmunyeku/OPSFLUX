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
    for table in SOFT_DELETE_TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for table in SOFT_DELETE_TABLES:
        op.drop_column(table, "deleted_at")
