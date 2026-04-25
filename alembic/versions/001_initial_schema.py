"""Initial schema — Core tables, extensions, seed data.

Revision ID: 001
Revises: None
Create Date: 2026-03-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extensions ───────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS ltree")
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ── Entities ─────────────────────────────────────────────────
    op.create_table(
        "entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country", sa.String(100)),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Africa/Douala"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── Departments ──────────────────────────────────────────────
    op.create_table(
        "departments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_index("uq_department_entity_code", "departments", ["entity_id", "code"], unique=True)

    # ── Cost Centers ─────────────────────────────────────────────
    op.create_table(
        "cost_centers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_index("uq_cost_center_entity_code", "cost_centers", ["entity_id", "code"], unique=True)

    # ── Users ────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(200)),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("default_entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id")),
        sa.Column("intranet_id", sa.String(100), unique=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("language", sa.String(5), nullable=False, server_default="fr"),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_users_email", "users", ["email"])
    op.create_index("idx_users_intranet_id", "users", ["intranet_id"])

    # ── Roles ────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("code", sa.String(50), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("module", sa.String(50)),
    )

    # ── Permissions ──────────────────────────────────────────────
    op.create_table(
        "permissions",
        sa.Column("code", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("module", sa.String(50)),
        sa.Column("description", sa.Text()),
    )

    # ── Role Permissions ─────────────────────────────────────────
    op.create_table(
        "role_permissions",
        sa.Column("role_code", sa.String(50), sa.ForeignKey("roles.code"), primary_key=True),
        sa.Column("permission_code", sa.String(100), sa.ForeignKey("permissions.code"), primary_key=True),
    )

    # ── Assets ───────────────────────────────────────────────────
    op.create_table(
        "assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("assets.id")),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("path", sa.String(500)),
        sa.Column("latitude", sa.Numeric(9, 6)),
        sa.Column("longitude", sa.Numeric(9, 6)),
        sa.Column("allow_overlap", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("metadata", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_assets_entity", "assets", ["entity_id"])
    op.create_index("idx_assets_parent", "assets", ["parent_id"])
    op.create_index("idx_assets_type", "assets", ["entity_id", "type"])

    # ── User Groups ──────────────────────────────────────────────
    op.create_table(
        "user_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role_code", sa.String(50), sa.ForeignKey("roles.code"), nullable=False),
        sa.Column("asset_scope", UUID(as_uuid=True), sa.ForeignKey("assets.id")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
    )

    op.create_table(
        "user_group_members",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("user_groups.id"), primary_key=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── Refresh Tokens ───────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(200), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── Tiers ────────────────────────────────────────────────────
    op.create_table(
        "tiers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(50)),
        sa.Column("country", sa.String(100)),
        sa.Column("address", sa.Text()),
        sa.Column("phone", sa.String(50)),
        sa.Column("email", sa.String(255)),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("metadata", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "tier_contacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("phone", sa.String(50)),
        sa.Column("position", sa.String(100)),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── Reference Sequences ──────────────────────────────────────
    op.create_table(
        "reference_sequences",
        sa.Column("prefix", sa.String(20), primary_key=True),
        sa.Column("year", sa.SmallInteger(), primary_key=True),
        sa.Column("last_value", sa.Integer(), nullable=False, server_default="0"),
    )

    # ── Event Store ──────────────────────────────────────────────
    op.create_table(
        "event_store",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_name", sa.String(100), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("emitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("handler", sa.String(100)),
        sa.Column("retry_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text()),
    )
    op.create_index("idx_event_store_name", "event_store", ["event_name"])
    op.create_index("idx_event_store_emitted", "event_store", ["emitted_at"])

    # ── Audit Log ────────────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True)),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(36)),
        sa.Column("details", JSONB()),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("idx_audit_log_user", "audit_log", ["user_id"])
    op.create_index("idx_audit_log_resource", "audit_log", ["resource_type", "resource_id"])
    op.create_index("idx_audit_log_created", "audit_log", ["created_at"])

    # ── Notifications ────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("link", sa.String(500)),
        sa.Column("read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_notifications_user", "notifications", ["user_id", "read"])

    # ── Settings ─────────────────────────────────────────────────
    op.create_table(
        "settings",
        sa.Column("key", sa.String(200), primary_key=True),
        sa.Column("value", JSONB(), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False, server_default="tenant"),
        sa.Column("scope_id", sa.String(36)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── Workflow Definitions ─────────────────────────────────────
    op.create_table(
        "workflow_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("states", JSONB(), nullable=False),
        sa.Column("transitions", JSONB(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "workflow_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workflow_definition_id", UUID(as_uuid=True), sa.ForeignKey("workflow_definitions.id"), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id_ref", sa.String(36), nullable=False),
        sa.Column("current_state", sa.String(50), nullable=False),
        sa.Column("metadata", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "workflow_transitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("instance_id", UUID(as_uuid=True), sa.ForeignKey("workflow_instances.id"), nullable=False),
        sa.Column("from_state", sa.String(50), nullable=False),
        sa.Column("to_state", sa.String(50), nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )

    # ── User Delegations ─────────────────────────────────────────
    op.create_table(
        "user_delegations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("delegator_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("delegate_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("permissions", JSONB(), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── Seed: core roles ─────────────────────────────────────────
    op.execute("""
        INSERT INTO roles (code, name, description, module) VALUES
        ('SUPER_ADMIN', 'Super Administrator', 'Platform-level administrator', 'core'),
        ('TENANT_ADMIN', 'Tenant Administrator', 'Tenant-level administrator', 'core'),
        ('DO', 'Directeur des Opérations', 'Operations Director — top authority', 'core'),
        ('DPROD', 'Directeur de Production', 'Production Director', 'core'),
        ('HSE_ADMIN', 'HSE Administrator', 'Health, Safety & Environment admin', 'core'),
        ('SITE_MGR', 'Chef de Site', 'Site manager', 'core'),
        ('PROJ_MGR', 'Chef de Projet', 'Project manager', 'core'),
        ('MAINT_MGR', 'Responsable Maintenance', 'Maintenance manager', 'core'),
        ('LOG_COORD', 'Coordinateur Logistique', 'Logistics coordinator', 'core'),
        ('TRANSP_COORD', 'Coordinateur Transport', 'Transport coordinator', 'core'),
        ('PAX_ADMIN', 'PAX Administrator', 'Personnel mobilization admin', 'core'),
        ('READER', 'Lecteur', 'Read-only access', 'core')
        ON CONFLICT (code) DO NOTHING
    """)

    # ── Seed: core permissions ───────────────────────────────────
    op.execute("""
        INSERT INTO permissions (code, name, module) VALUES
        ('user.read', 'View users', 'core'),
        ('user.create', 'Create users', 'core'),
        ('user.update', 'Update users', 'core'),
        ('user.delete', 'Deactivate users', 'core'),
        ('role.manage', 'Manage roles and permissions', 'core'),
        ('entity.read', 'View entities', 'core'),
        ('entity.manage', 'Manage entities', 'core'),
        ('asset.read', 'View assets', 'core'),
        ('asset.create', 'Create assets', 'core'),
        ('asset.update', 'Update assets', 'core'),
        ('asset.delete', 'Archive assets', 'core'),
        ('tier.read', 'View companies', 'core'),
        ('tier.create', 'Create companies', 'core'),
        ('tier.update', 'Update companies', 'core'),
        ('tier.delete', 'Archive companies', 'core'),
        ('notification.read', 'View notifications', 'core'),
        ('setting.read', 'View settings', 'core'),
        ('setting.write', 'Modify settings', 'core'),
        ('audit.read', 'View audit logs', 'core'),
        ('workflow.definition.read', 'View workflow definitions', 'core'),
        ('workflow.definition.manage', 'Manage workflow definitions', 'core'),
        ('dashboard.read', 'View dashboards', 'core'),
        ('dashboard.customize', 'Customize dashboard', 'core')
        ON CONFLICT (code) DO NOTHING
    """)

    # ── Seed: SUPER_ADMIN gets all permissions ───────────────────
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'SUPER_ADMIN', code FROM permissions
        ON CONFLICT DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'TENANT_ADMIN', code FROM permissions
        ON CONFLICT DO NOTHING
    """)

    # ── updated_at trigger function ──────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    for table in ["entities", "users", "assets", "tiers", "tier_contacts",
                   "notifications", "workflow_definitions", "workflow_instances",
                   "user_delegations"]:
        op.execute(f"""
            CREATE TRIGGER trigger_update_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    tables = [
        "user_delegations", "workflow_transitions", "workflow_instances",
        "workflow_definitions", "settings", "notifications", "audit_log",
        "event_store", "reference_sequences", "tier_contacts", "tiers",
        "user_group_members", "user_groups", "refresh_tokens",
        "role_permissions", "permissions", "roles", "assets",
        "users", "cost_centers", "departments", "entities",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
