"""Add created_by / updated_by audit columns to most tables.

Revision ID: 024_add_audit_user_columns
Revises: 023_add_project_external_ref
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "024_add_audit_user_columns"
down_revision = "023_add_project_external_ref"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Tables that need BOTH created_by AND updated_by
    # (these don't already have either column)
    # ------------------------------------------------------------------
    both_tables = [
        # common.py
        "departments",
        "cost_centers",
        "user_groups",
        "settings",
        "assets",
        "tiers",
        "tier_contacts",
        "tier_identifiers",
        "user_delegations",
        "personal_access_tokens",
        "user_emails",
        "oauth_applications",
        "oauth_authorizations",
        "addresses",
        "phones",
        "contact_emails",
        "email_templates",
        "compliance_types",
        "compliance_rules",
        "job_positions",
        "projects",
        "project_members",
        "project_tasks",
        "project_milestones",
        "task_deliverables",
        "task_actions",
        "pdf_templates",
        "notification_preferences",
        "email_template_links",
        # paxlog.py
        "pax_groups",
        "pax_profiles",
        "credential_types",
        "pax_credentials",
        "ads",
        # travelwiz.py
        "transport_vectors",
        "transport_vector_zones",
        "transport_rotations",
        "voyage_manifests",
        "manifest_passengers",
        # planner.py
        "planner_conflicts",
        # report_editor.py
        "template_fields",
        "document_sequences",
        "arborescence_nodes",
        # pid_pfd.py
        "equipment",
        "process_lines",
        "pid_connections",
        # dashboard.py
        "user_dashboard_tabs",
    ]

    for tbl in both_tables:
        op.add_column(tbl, sa.Column("created_by", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{tbl}_created_by", tbl, "users", ["created_by"], ["id"]
        )
        op.add_column(tbl, sa.Column("updated_by", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{tbl}_updated_by", tbl, "users", ["updated_by"], ["id"]
        )

    # ------------------------------------------------------------------
    # Tables that ONLY need updated_by (already have created_by or equiv)
    # ------------------------------------------------------------------
    updated_only_tables = [
        # common.py
        "workflow_definitions",
        "workflow_instances",
        "tags",
        "notes",
        "attachments",
        "compliance_records",
        "planning_revisions",
        "email_template_versions",
        "pdf_template_versions",
        # travelwiz.py
        "voyages",
        # planner.py
        "planner_activities",
        # report_editor.py
        "doc_types",
        "documents",
        "revisions",
        "templates",
        "distribution_lists",
        "share_links",
        # pid_pfd.py
        "pid_documents",
        "pid_revisions",
        "dcs_tags",
        "tag_naming_rules",
        "process_lib_items",
        # dashboard.py
        "dashboard_tabs",
    ]

    for tbl in updated_only_tables:
        op.add_column(tbl, sa.Column("updated_by", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{tbl}_updated_by", tbl, "users", ["updated_by"], ["id"]
        )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # Tables that had ONLY updated_by added  (reverse order)
    # ------------------------------------------------------------------
    updated_only_tables = [
        "dashboard_tabs",
        "process_lib_items",
        "tag_naming_rules",
        "dcs_tags",
        "pid_revisions",
        "pid_documents",
        "share_links",
        "distribution_lists",
        "templates",
        "revisions",
        "documents",
        "doc_types",
        "planner_activities",
        "voyages",
        "pdf_template_versions",
        "email_template_versions",
        "planning_revisions",
        "compliance_records",
        "attachments",
        "notes",
        "tags",
        "workflow_instances",
        "workflow_definitions",
    ]

    for tbl in updated_only_tables:
        op.drop_constraint(f"fk_{tbl}_updated_by", tbl, type_="foreignkey")
        op.drop_column(tbl, "updated_by")

    # ------------------------------------------------------------------
    # Tables that had BOTH created_by + updated_by added  (reverse order)
    # ------------------------------------------------------------------
    both_tables = [
        "user_dashboard_tabs",
        "pid_connections",
        "process_lines",
        "equipment",
        "arborescence_nodes",
        "document_sequences",
        "template_fields",
        "planner_conflicts",
        "manifest_passengers",
        "voyage_manifests",
        "transport_rotations",
        "transport_vector_zones",
        "transport_vectors",
        "ads",
        "pax_credentials",
        "credential_types",
        "pax_profiles",
        "pax_groups",
        "email_template_links",
        "notification_preferences",
        "pdf_templates",
        "task_actions",
        "task_deliverables",
        "project_milestones",
        "project_tasks",
        "project_members",
        "projects",
        "job_positions",
        "compliance_rules",
        "compliance_types",
        "email_templates",
        "contact_emails",
        "phones",
        "addresses",
        "oauth_authorizations",
        "oauth_applications",
        "user_emails",
        "personal_access_tokens",
        "user_delegations",
        "tier_identifiers",
        "tier_contacts",
        "tiers",
        "assets",
        "settings",
        "user_groups",
        "cost_centers",
        "departments",
    ]

    for tbl in both_tables:
        op.drop_constraint(f"fk_{tbl}_updated_by", tbl, type_="foreignkey")
        op.drop_column(tbl, "updated_by")
        op.drop_constraint(f"fk_{tbl}_created_by", tbl, type_="foreignkey")
        op.drop_column(tbl, "created_by")
