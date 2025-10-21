"""
Script to populate all 65 core permissions from migration 767d66a8dd67.
This ensures the database has all permissions defined in the RBAC system.

Auto-assigns permissions:
- Permissions with default=True → user role
- All permissions → admin role
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models_rbac import Permission, Role
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# All 65 core permissions from migration 767d66a8dd67
CORE_PERMISSIONS = [
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


def main() -> None:
    logger.info("Starting population of all 65 core permissions...")
    logger.info(f"Total permissions to process: {len(CORE_PERMISSIONS)}")

    with Session(engine) as session:
        created = 0
        skipped = 0
        updated = 0

        # Create/update all permissions
        for perm_data in CORE_PERMISSIONS:
            existing = session.exec(
                select(Permission).where(Permission.code == perm_data["code"])
            ).first()

            if existing:
                # Update existing permission if needed
                needs_update = False
                if existing.name != perm_data["name"]:
                    existing.name = perm_data["name"]
                    needs_update = True
                if existing.description != perm_data["description"]:
                    existing.description = perm_data["description"]
                    needs_update = True
                if existing.module != perm_data["module"]:
                    existing.module = perm_data["module"]
                    needs_update = True

                if needs_update:
                    session.add(existing)
                    updated += 1
                    logger.info(f"Updated permission: {perm_data['code']}")
                else:
                    logger.info(f"Permission '{perm_data['code']}' already exists with correct values")
                    skipped += 1
                continue

            # Create new permission
            permission = Permission(
                code=perm_data["code"],
                name=perm_data["name"],
                description=perm_data["description"],
                module=perm_data["module"],
                is_default=perm_data["default"],
                is_active=True
            )
            session.add(permission)
            created += 1
            logger.info(f"Created permission: {perm_data['code']} - {perm_data['name']}")

        session.commit()

        # Get all core permissions from DB
        all_core_perms = session.exec(
            select(Permission).where(Permission.code.like("core.%"))
        ).all()

        # Get roles
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        user_role = session.exec(select(Role).where(Role.code == "user")).first()

        # Assign permissions to admin role (all core permissions)
        if admin_role:
            admin_assigned = 0
            for perm in all_core_perms:
                if perm not in admin_role.permissions:
                    admin_role.permissions.append(perm)
                    admin_assigned += 1

            if admin_assigned > 0:
                session.add(admin_role)
                session.commit()
                logger.info(f"Assigned {admin_assigned} new permissions to admin role")
            else:
                logger.info("Admin role already has all core permissions")

        # Assign default permissions to user role (only default=True)
        if user_role:
            default_perms = [p for p in all_core_perms if p.is_default]
            user_assigned = 0
            for perm in default_perms:
                if perm not in user_role.permissions:
                    user_role.permissions.append(perm)
                    user_assigned += 1

            if user_assigned > 0:
                session.add(user_role)
                session.commit()
                logger.info(f"Assigned {user_assigned} default permissions to user role")
            else:
                logger.info("User role already has all default permissions")

        logger.info("\n" + "="*60)
        logger.info("SUMMARY:")
        logger.info(f"  Created: {created}")
        logger.info(f"  Updated: {updated}")
        logger.info(f"  Skipped: {skipped}")
        logger.info(f"  Total core permissions in DB: {len(all_core_perms)}")
        logger.info("="*60)


if __name__ == "__main__":
    main()
