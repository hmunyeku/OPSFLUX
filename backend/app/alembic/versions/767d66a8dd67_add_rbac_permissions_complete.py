"""Add RBAC permissions complete

Revision ID: 767d66a8dd67
Revises: p1q2r3s4t5u6
Create Date: 2025-10-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
from datetime import datetime
import uuid

# revision identifiers, used by Alembic.
revision = '767d66a8dd67'
down_revision = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Créer 65 permissions complètes pour OpsFlux RBAC system.
    Auto-assign permissions par défaut au rôle 'user'.
    Auto-assign toutes permissions aux rôles 'admin' et 'superadmin'.
    """

    # Tables temporaires pour insert
    permission_table = table(
        'permission',
        column('id', sa.Uuid),
        column('code', sa.String),
        column('name', sa.String),
        column('description', sa.String),
        column('module', sa.String),
        column('is_active', sa.Boolean),
        column('created_at', sa.DateTime),
        column('updated_at', sa.DateTime),
    )

    role_permission_link = table(
        'role_permission_link',
        column('role_id', sa.Uuid),
        column('permission_id', sa.Uuid),
    )

    # Définition des 65 permissions
    permissions = [
        # ===== API KEYS (5) =====
        {
            "code": "core.api_keys.create",
            "name": "Create API Key",
            "description": "Ability to create new API keys",
            "module": "core",
            "default": False
        },
        {
            "code": "core.api_keys.read",
            "name": "Read API Keys",
            "description": "Ability to view API keys (list and detail)",
            "module": "core",
            "default": True
        },
        {
            "code": "core.api_keys.update",
            "name": "Update API Key",
            "description": "Ability to update API key details (name, scopes, etc.)",
            "module": "core",
            "default": False
        },
        {
            "code": "core.api_keys.delete",
            "name": "Delete API Key",
            "description": "Ability to delete/revoke API keys",
            "module": "core",
            "default": False
        },
        {
            "code": "core.api_keys.revoke",
            "name": "Revoke API Key",
            "description": "Ability to revoke API keys (soft delete)",
            "module": "core",
            "default": False
        },

        # ===== WEBHOOKS (5) =====
        {
            "code": "core.webhooks.create",
            "name": "Create Webhook",
            "description": "Ability to create new webhooks",
            "module": "core",
            "default": False
        },
        {
            "code": "core.webhooks.read",
            "name": "Read Webhooks",
            "description": "Ability to view webhooks (list and detail)",
            "module": "core",
            "default": True
        },
        {
            "code": "core.webhooks.update",
            "name": "Update Webhook",
            "description": "Ability to update webhook configuration",
            "module": "core",
            "default": False
        },
        {
            "code": "core.webhooks.delete",
            "name": "Delete Webhook",
            "description": "Ability to delete webhooks",
            "module": "core",
            "default": False
        },
        {
            "code": "core.webhooks.test",
            "name": "Test Webhook",
            "description": "Ability to send test webhook deliveries",
            "module": "core",
            "default": False
        },

        # ===== EMAIL TEMPLATES (5) =====
        {
            "code": "core.email_templates.create",
            "name": "Create Email Template",
            "description": "Ability to create new email templates",
            "module": "core",
            "default": False
        },
        {
            "code": "core.email_templates.read",
            "name": "Read Email Templates",
            "description": "Ability to view email templates",
            "module": "core",
            "default": True
        },
        {
            "code": "core.email_templates.update",
            "name": "Update Email Template",
            "description": "Ability to update email templates",
            "module": "core",
            "default": False
        },
        {
            "code": "core.email_templates.delete",
            "name": "Delete Email Template",
            "description": "Ability to delete email templates",
            "module": "core",
            "default": False
        },
        {
            "code": "core.email_templates.send_test",
            "name": "Send Test Email",
            "description": "Ability to send test emails using templates",
            "module": "core",
            "default": False
        },

        # ===== CACHE (5) =====
        {
            "code": "core.cache.read",
            "name": "Read Cache Stats",
            "description": "Ability to view cache statistics and info",
            "module": "core",
            "default": True
        },
        {
            "code": "core.cache.clear",
            "name": "Clear Cache",
            "description": "Ability to clear cache (flush all)",
            "module": "core",
            "default": False
        },
        {
            "code": "core.cache.delete_key",
            "name": "Delete Cache Key",
            "description": "Ability to delete specific cache keys",
            "module": "core",
            "default": False
        },
        {
            "code": "core.cache.search",
            "name": "Search Cache Keys",
            "description": "Ability to search and list cache keys",
            "module": "core",
            "default": True
        },
        {
            "code": "core.cache.set",
            "name": "Set Cache Key",
            "description": "Ability to manually set cache values",
            "module": "core",
            "default": False
        },

        # ===== STORAGE (5) =====
        {
            "code": "core.storage.upload",
            "name": "Upload File",
            "description": "Ability to upload files to storage",
            "module": "core",
            "default": True
        },
        {
            "code": "core.storage.read",
            "name": "Read Storage",
            "description": "Ability to list and view storage buckets/files",
            "module": "core",
            "default": True
        },
        {
            "code": "core.storage.delete",
            "name": "Delete File",
            "description": "Ability to delete files from storage",
            "module": "core",
            "default": False
        },
        {
            "code": "core.storage.configure",
            "name": "Configure Storage",
            "description": "Ability to configure storage settings (buckets, providers)",
            "module": "core",
            "default": False
        },
        {
            "code": "core.storage.manage_buckets",
            "name": "Manage Buckets",
            "description": "Ability to create/delete storage buckets",
            "module": "core",
            "default": False
        },

        # ===== QUEUE (5) =====
        {
            "code": "core.queue.read",
            "name": "Read Queue Stats",
            "description": "Ability to view queue statistics and jobs",
            "module": "core",
            "default": True
        },
        {
            "code": "core.queue.enqueue",
            "name": "Enqueue Job",
            "description": "Ability to add jobs to queue",
            "module": "core",
            "default": True
        },
        {
            "code": "core.queue.cancel",
            "name": "Cancel Job",
            "description": "Ability to cancel queued jobs",
            "module": "core",
            "default": False
        },
        {
            "code": "core.queue.retry",
            "name": "Retry Job",
            "description": "Ability to retry failed jobs",
            "module": "core",
            "default": False
        },
        {
            "code": "core.queue.purge",
            "name": "Purge Queue",
            "description": "Ability to purge entire queue",
            "module": "core",
            "default": False
        },

        # ===== METRICS (4) =====
        {
            "code": "core.metrics.read",
            "name": "Read Metrics",
            "description": "Ability to view system metrics and analytics",
            "module": "core",
            "default": True
        },
        {
            "code": "core.metrics.export",
            "name": "Export Metrics",
            "description": "Ability to export metrics data (CSV, JSON, Prometheus)",
            "module": "core",
            "default": False
        },
        {
            "code": "core.metrics.configure",
            "name": "Configure Metrics",
            "description": "Ability to configure metrics collection settings",
            "module": "core",
            "default": False
        },
        {
            "code": "core.metrics.delete",
            "name": "Delete Metrics",
            "description": "Ability to delete historical metrics data",
            "module": "core",
            "default": False
        },

        # ===== HOOKS (5) =====
        {
            "code": "core.hooks.create",
            "name": "Create Hook",
            "description": "Ability to create lifecycle hooks",
            "module": "core",
            "default": False
        },
        {
            "code": "core.hooks.read",
            "name": "Read Hooks",
            "description": "Ability to view hooks configuration",
            "module": "core",
            "default": True
        },
        {
            "code": "core.hooks.update",
            "name": "Update Hook",
            "description": "Ability to update hook configuration",
            "module": "core",
            "default": False
        },
        {
            "code": "core.hooks.delete",
            "name": "Delete Hook",
            "description": "Ability to delete hooks",
            "module": "core",
            "default": False
        },
        {
            "code": "core.hooks.execute",
            "name": "Execute Hook",
            "description": "Ability to manually trigger hooks",
            "module": "core",
            "default": False
        },

        # ===== SEARCH (4) =====
        {
            "code": "core.search.query",
            "name": "Query Search",
            "description": "Ability to perform search queries",
            "module": "core",
            "default": True
        },
        {
            "code": "core.search.index",
            "name": "Index Documents",
            "description": "Ability to index documents for search",
            "module": "core",
            "default": False
        },
        {
            "code": "core.search.reindex",
            "name": "Reindex All",
            "description": "Ability to trigger full reindexing",
            "module": "core",
            "default": False
        },
        {
            "code": "core.search.configure",
            "name": "Configure Search",
            "description": "Ability to configure search engine settings",
            "module": "core",
            "default": False
        },

        # ===== AUDIT (4) =====
        {
            "code": "core.audit.read",
            "name": "Read Audit Logs",
            "description": "Ability to view audit logs",
            "module": "core",
            "default": True
        },
        {
            "code": "core.audit.export",
            "name": "Export Audit Logs",
            "description": "Ability to export audit logs",
            "module": "core",
            "default": False
        },
        {
            "code": "core.audit.delete",
            "name": "Delete Audit Logs",
            "description": "Ability to delete old audit logs",
            "module": "core",
            "default": False
        },
        {
            "code": "core.audit.configure",
            "name": "Configure Audit",
            "description": "Ability to configure audit logging settings",
            "module": "core",
            "default": False
        },

        # ===== BOOKMARKS (4) =====
        {
            "code": "core.bookmarks.create",
            "name": "Create Bookmark",
            "description": "Ability to create bookmarks",
            "module": "core",
            "default": True
        },
        {
            "code": "core.bookmarks.read",
            "name": "Read Bookmarks",
            "description": "Ability to view own bookmarks",
            "module": "core",
            "default": True
        },
        {
            "code": "core.bookmarks.update",
            "name": "Update Bookmark",
            "description": "Ability to update bookmarks",
            "module": "core",
            "default": True
        },
        {
            "code": "core.bookmarks.delete",
            "name": "Delete Bookmark",
            "description": "Ability to delete bookmarks",
            "module": "core",
            "default": True
        },

        # ===== TASKS (4) =====
        {
            "code": "core.tasks.create",
            "name": "Create Task",
            "description": "Ability to create background tasks",
            "module": "core",
            "default": True
        },
        {
            "code": "core.tasks.read",
            "name": "Read Tasks",
            "description": "Ability to view task status and results",
            "module": "core",
            "default": True
        },
        {
            "code": "core.tasks.cancel",
            "name": "Cancel Task",
            "description": "Ability to cancel running tasks",
            "module": "core",
            "default": False
        },
        {
            "code": "core.tasks.retry",
            "name": "Retry Task",
            "description": "Ability to retry failed tasks",
            "module": "core",
            "default": False
        },

        # ===== USERS (5) =====
        {
            "code": "core.users.create",
            "name": "Create User",
            "description": "Ability to create new users",
            "module": "core",
            "default": False
        },
        {
            "code": "core.users.read",
            "name": "Read Users",
            "description": "Ability to view user information",
            "module": "core",
            "default": True
        },
        {
            "code": "core.users.update",
            "name": "Update User",
            "description": "Ability to update user details",
            "module": "core",
            "default": False
        },
        {
            "code": "core.users.delete",
            "name": "Delete User",
            "description": "Ability to delete users",
            "module": "core",
            "default": False
        },
        {
            "code": "core.users.manage_roles",
            "name": "Manage User Roles",
            "description": "Ability to assign/remove roles from users",
            "module": "core",
            "default": False
        },

        # ===== ROLES (5) =====
        {
            "code": "core.roles.create",
            "name": "Create Role",
            "description": "Ability to create new roles",
            "module": "core",
            "default": False
        },
        {
            "code": "core.roles.read",
            "name": "Read Roles",
            "description": "Ability to view roles",
            "module": "core",
            "default": True
        },
        {
            "code": "core.roles.update",
            "name": "Update Role",
            "description": "Ability to update role configuration",
            "module": "core",
            "default": False
        },
        {
            "code": "core.roles.delete",
            "name": "Delete Role",
            "description": "Ability to delete roles",
            "module": "core",
            "default": False
        },
        {
            "code": "core.roles.manage_permissions",
            "name": "Manage Role Permissions",
            "description": "Ability to assign/remove permissions from roles",
            "module": "core",
            "default": False
        },
    ]

    # Insérer les permissions
    now = datetime.utcnow()
    conn = op.get_bind()

    # Créer un mapping permission_code -> uuid
    permission_ids = {}
    for perm in permissions:
        perm_id = uuid.uuid4()
        permission_ids[perm["code"]] = perm_id
        conn.execute(
            permission_table.insert().values(
                id=perm_id,
                code=perm["code"],
                name=perm["name"],
                description=perm["description"],
                module=perm["module"],
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )

    # Récupérer les IDs des rôles
    role_table = table('role', column('id', sa.Uuid), column('code', sa.String))

    result = conn.execute(sa.select(role_table.c.id).where(role_table.c.code == 'user'))
    user_role_id = result.scalar_one_or_none()

    result = conn.execute(sa.select(role_table.c.id).where(role_table.c.code == 'admin'))
    admin_role_id = result.scalar_one_or_none()

    result = conn.execute(sa.select(role_table.c.id).where(role_table.c.code == 'superadmin'))
    superadmin_role_id = result.scalar_one_or_none()

    # Auto-assign permissions au rôle 'user' (seulement celles avec default=True)
    if user_role_id:
        for perm in permissions:
            if perm["default"]:
                conn.execute(
                    role_permission_link.insert().values(
                        role_id=user_role_id,
                        permission_id=permission_ids[perm["code"]],
                    )
                )

    # Auto-assign TOUTES les permissions aux rôles 'admin' et 'superadmin'
    if admin_role_id:
        for perm in permissions:
            conn.execute(
                role_permission_link.insert().values(
                    role_id=admin_role_id,
                    permission_id=permission_ids[perm["code"]],
                )
            )

    if superadmin_role_id:
        for perm in permissions:
            conn.execute(
                role_permission_link.insert().values(
                    role_id=superadmin_role_id,
                    permission_id=permission_ids[perm["code"]],
                )
            )


def downgrade() -> None:
    """
    Supprimer toutes les permissions créées.
    """
    conn = op.get_bind()

    # Supprimer les liens role-permission pour ces permissions
    conn.execute(
        sa.text("""
            DELETE FROM role_permission_link
            WHERE permission_id IN (
                SELECT id FROM permission
                WHERE code LIKE 'core.%'
            )
        """)
    )

    # Supprimer les permissions
    conn.execute(
        sa.text("""
            DELETE FROM permission
            WHERE code LIKE 'core.%'
        """)
    )
