"""Add created_at / updated_at columns to tables that gained TimestampMixin.

Revision ID: 033
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None

# Tables that need BOTH created_at and updated_at added.
TABLES_NEED_BOTH = [
    # paxlog
    "pax_groups",
    "compliance_matrix",
    "ads_pax",
    "mission_programs",
    "mission_program_pax",
    "mission_stakeholders",
    "pax_profile_types",
    "profile_habilitation_matrix",
    # common
    "departments",
    "cost_centers",
    "user_groups",
    "email_template_links",
    "external_references",
    # dashboard
    "dashboard_permissions",
    # travelwiz
    "voyage_stops",
    "captain_logs",
    "vector_positions",
    "voyage_events",
    "trip_kpis",
    "package_elements",
    "deck_layout_items",
    # report_editor
    "doc_types",
    "template_fields",
    "document_sequences",
    "document_signatures",
    "document_access_grants",
    # pid_pfd
    "pid_locks",
    # messaging
    "announcement_receipts",
    # planner
    "planner_activity_dependencies",
]

# Tables that already have created_at — only need updated_at.
TABLES_NEED_UPDATED_AT = [
    # paxlog
    "credential_types",
    "pax_incidents",
    "external_access_links",
    "profile_types",
    "pax_company_groups",
    # travelwiz
    "trip_code_access",
    "deck_layouts",
    # report_editor
    "revisions",
    "templates",
    "arborescence_nodes",
    "share_links",
    # pid_pfd
    "pid_revisions",
    "process_lines",
    "pid_connections",
    "tag_naming_rules",
    "process_lib_items",
    # messaging
    "login_events",
    # planner
    "planner_conflicts",
]

# Tables that already have updated_at — only need created_at.
TABLES_NEED_CREATED_AT = [
    # common
    "notification_preferences",
    # dashboard
    "home_page_settings",
]


def _has_column(table: str, column: str) -> bool:
    """Check if a column already exists (idempotent)."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    for table in TABLES_NEED_BOTH:
        if not _has_column(table, "created_at"):
            op.add_column(
                table,
                sa.Column(
                    "created_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            )
        if not _has_column(table, "updated_at"):
            op.add_column(
                table,
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            )

    for table in TABLES_NEED_UPDATED_AT:
        if not _has_column(table, "updated_at"):
            op.add_column(
                table,
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            )

    for table in TABLES_NEED_CREATED_AT:
        if not _has_column(table, "created_at"):
            op.add_column(
                table,
                sa.Column(
                    "created_at",
                    sa.DateTime(timezone=True),
                    nullable=False,
                    server_default=sa.func.now(),
                ),
            )


def downgrade() -> None:
    for table in reversed(TABLES_NEED_BOTH):
        try:
            op.drop_column(table, "updated_at")
        except Exception:
            pass
        try:
            op.drop_column(table, "created_at")
        except Exception:
            pass

    for table in reversed(TABLES_NEED_UPDATED_AT):
        try:
            op.drop_column(table, "updated_at")
        except Exception:
            pass

    for table in reversed(TABLES_NEED_CREATED_AT):
        try:
            op.drop_column(table, "created_at")
        except Exception:
            pass
