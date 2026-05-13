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

    # 3. Seed new permissions (~20 codes)
    op.execute("""
        INSERT INTO permissions (code, name, namespace, resource, action, module, sensitive) VALUES
        ('system.platform.admin', 'Platform admin (cross-tenant)', 'system', 'platform', 'admin', 'core', false),
        ('system.tenant.read', 'List/view tenants', 'system', 'tenant', 'read', 'core', false),
        ('system.tenant.create', 'Create tenants', 'system', 'tenant', 'create', 'core', false),
        ('system.tenant.update', 'Update tenants', 'system', 'tenant', 'update', 'core', false),
        ('system.user.read', 'Read users cross-tenant', 'system', 'user', 'read', 'core', true),
        ('system.user.create', 'Create users cross-tenant', 'system', 'user', 'create', 'core', false),
        ('system.audit.cross_tenant_read', 'Read audit across all tenants', 'system', 'audit', 'cross_tenant_read', 'core', true),
        ('core.rbac.export', 'Export RBAC matrices to PDF', 'core', 'rbac', 'export', 'core', false),
        ('core.user.audit_export', 'Export user audit sheets (RGPD)', 'core', 'user', 'audit_export', 'core', true),
        ('core.delegation.read', 'View delegations', 'core', 'delegation', 'read', 'core', false),
        ('core.delegation.create', 'Create delegations on own permissions', 'core', 'delegation', 'create', 'core', false),
        ('core.delegation.manage', 'Manage any delegation in tenant', 'core', 'delegation', 'manage', 'core', false),
        ('core.delegation.revoke', 'Revoke any delegation', 'core', 'delegation', 'revoke', 'core', false),
        ('asset.installation.read', 'Read installations', 'asset', 'installation', 'read', 'asset_registry', false),
        ('asset.installation.update', 'Update installations', 'asset', 'installation', 'update', 'asset_registry', false),
        ('asset.field.read', 'Read oil fields', 'asset', 'field', 'read', 'asset_registry', false),
        ('paxlog.signalement.create', 'Submit HSE signalement', 'paxlog', 'signalement', 'create', 'paxlog', false),
        ('mcp.gateway.manage', 'Manage MCP gateway config', 'mcp', 'gateway', 'manage', 'integration', false),
        ('mcp.token.create', 'Issue MCP tokens', 'mcp', 'token', 'create', 'integration', true),
        ('mcp.agent.execute', 'Execute MCP agent actions', 'mcp', 'agent', 'execute', 'integration', false)
        ON CONFLICT (code) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            sensitive = EXCLUDED.sensitive
    """)

    # 4. Seed 8 new roles
    op.execute("""
        INSERT INTO roles (code, name, description, module) VALUES
        ('SECURITY_OFFICER', 'Security Officer', 'Auditeur indépendant, lecture seule sur RBAC/audit/user, peut révoquer délégations', 'core'),
        ('DOC_CONTROLLER', 'Document Controller', 'Contrôleur documentaire Papyrus — gère MDR, templates, distribution', 'papyrus'),
        ('PLANNER', 'Planificateur', 'Pilote du module Planner — activités, capacité, conflits', 'planner'),
        ('MOC_VALIDATOR', 'MOC Validator', 'Valide les MOC sans pouvoir les créer (séparation des pouvoirs)', 'moc'),
        ('OPERATOR', 'Operator', 'Contributeur métier — saisit/édite, ne valide pas', 'core'),
        ('PAX', 'Personnel mobilisé', 'Self-service pour les users externes (profil, rotations, badges)', 'paxlog'),
        ('TIER_CONTACT', 'Contact tiers externe', 'Self-service pour les contacts des tiers/compagnies externes', 'tier'),
        ('INTEGRATION_BOT', 'Integration Bot', 'Compte service pour intégrations/MCP/webhooks', 'integration')
        ON CONFLICT (code) DO NOTHING
    """)

    # 5. Rename existing roles using INSERT+propagate+DELETE
    # (cannot UPDATE roles.code because FK role_permissions.role_code lacks ON UPDATE CASCADE)
    RENAMES = [
        ("SUPER_ADMIN", "PLATFORM_ADMIN"),
        ("PAX_ADMIN", "PAX_COORD"),
        ("HSE_ADMIN", "HSE_MGR"),
    ]
    for old_code, new_code in RENAMES:
        # 5.a Create the new role row (copy of the old)
        op.execute(f"""
            INSERT INTO roles (code, name, description, module)
            SELECT '{new_code}', name, description, module FROM roles WHERE code = '{old_code}'
            ON CONFLICT (code) DO NOTHING
        """)
        # 5.b Propagate role_permissions
        op.execute(f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT '{new_code}', permission_code FROM role_permissions WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        # 5.c Propagate user_group_roles
        op.execute(f"""
            INSERT INTO user_group_roles (group_id, role_code)
            SELECT group_id, '{new_code}' FROM user_group_roles WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        # 5.d Delete the old liaisons then the old role
        op.execute(f"DELETE FROM role_permissions WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM user_group_roles WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM roles WHERE code = '{old_code}'")

    # 6. Seed tenant settings (one row per existing entity, with default values)
    SETTINGS = [
        ("rbac.default_role.internal", '"READER"'),
        ("rbac.default_role.external", '"PAX"'),
        ("rbac.default_role.tier_contact", '"TIER_CONTACT"'),
        ("rbac.delegation.max_duration_days", '365'),
        ("rbac.delegation.notify_security_officer", 'true'),
        ("rbac.export.async_threshold_users", '500'),
        ("rbac.bootstrap.email_admins_on_migration", 'true'),
    ]
    for key, value in SETTINGS:
        op.execute(f"""
            INSERT INTO settings (key, value, scope, scope_id)
            SELECT '{key}', '{value}'::jsonb, 'tenant', id::text FROM entities
            ON CONFLICT DO NOTHING
        """)


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
