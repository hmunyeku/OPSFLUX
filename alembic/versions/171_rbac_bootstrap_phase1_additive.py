"""RBAC bootstrap phase 1 — additive (extend Permission, create RbacAuditEvent, seed new perms/roles/settings).

Revision ID: 171_rbac_bootstrap_phase1
Revises: 170_papyrus_ext_created_at
Create Date: 2026-05-13 12:00:00

This migration is ADDITIVE: no existing code path is broken. Old permission codes coexist
with new ones until PR-G (cleanup).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "171_rbac_bootstrap_phase1"
down_revision = "170_papyrus_ext_created_at"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Extend permissions table with namespace/resource/action/deprecated/sensitive
    op.add_column("permissions", sa.Column("namespace", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("resource", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("action", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("deprecated", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("permissions", sa.Column("deprecated_for", sa.String(100), nullable=True))
    op.add_column("permissions", sa.Column("sensitive", sa.Boolean(), server_default="false", nullable=False))
    op.create_index("ix_permissions_namespace", "permissions", ["namespace"])

    # NOTE: Entity.logo_url already exists in the schema — no DDL needed.

    # 2. Create rbac_audit_events table
    op.create_table(
        "rbac_audit_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("target", sa.String(500)),  # bumped from 200 per code review
        sa.Column("params", JSONB()),
        sa.Column("result_summary", JSONB()),
        sa.Column("file_hash_sha256", sa.String(64)),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("client_ip", sa.String(45)),
        sa.Column("user_agent", sa.Text()),
        sa.Column("status", sa.String(20), server_default="success", nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.Column("error_detail", sa.Text()),
        sa.CheckConstraint("status IN ('success', 'failure', 'pending', 'partial')", name="ck_rbac_audit_status"),
    )
    op.create_index("ix_rbac_audit_tenant_time", "rbac_audit_events", ["tenant_id", "occurred_at"])
    op.create_index("ix_rbac_audit_event_type", "rbac_audit_events", ["event_type"])
    op.create_index("ix_rbac_audit_actor", "rbac_audit_events", ["actor_user_id"])

    # 3. Seed new permissions (continued in task 2.2)
    # 4. Seed new roles (continued in task 2.3)
    # 5. Rename existing roles (continued in task 2.4)
    # 6. Seed tenant settings (continued in task 2.5)


def downgrade():
    op.drop_index("ix_rbac_audit_actor", table_name="rbac_audit_events")
    op.drop_index("ix_rbac_audit_event_type", table_name="rbac_audit_events")
    op.drop_index("ix_rbac_audit_tenant_time", table_name="rbac_audit_events")
    op.drop_table("rbac_audit_events")
    # Note: Entity.logo_url is NOT dropped — it existed before this migration.
    op.drop_index("ix_permissions_namespace", table_name="permissions")
    op.drop_column("permissions", "sensitive")
    op.drop_column("permissions", "deprecated_for")
    op.drop_column("permissions", "deprecated")
    op.drop_column("permissions", "action")
    op.drop_column("permissions", "resource")
    op.drop_column("permissions", "namespace")
