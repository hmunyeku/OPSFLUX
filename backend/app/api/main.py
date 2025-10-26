from fastapi import APIRouter

from app.api.routes import (
    addresses,
    address_types,
    ai,
    api_keys,
    audit,
    auth,
    backups,
    bookmarks,
    cache,
    dashboards,
    database,
    developer_analytics,
    email_templates,
    error_tracking,
    groups,
    hooks,
    items,
    languages,
    login,
    metrics,
    modules,
    notifications,
    permissions,
    private,
    queue,
    roles,
    scheduled_tasks,
    search,
    security,
    settings as settings_routes,
    storage,
    system_health,
    tasks,
    twofa,
    user_api_keys,
    user_invitations,
    user_permissions,
    user_preferences,
    users,
    utils,
    webhooks,
    websocket,
    widgets,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(auth.router)  # Nouvelle auth avec refresh token
api_router.include_router(login.router)  # Ancienne auth (rétrocompatibilité)
api_router.include_router(users.router)
api_router.include_router(security.router)  # Security and password policy
api_router.include_router(settings_routes.router)  # Application settings
api_router.include_router(twofa.router, prefix="/2fa", tags=["2FA"])  # Two-Factor Authentication
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(addresses.router)  # Address management
api_router.include_router(address_types.router)  # Address type configuration
api_router.include_router(permissions.router)  # RBAC permissions
api_router.include_router(roles.router)  # RBAC roles
api_router.include_router(groups.router)  # RBAC groups
api_router.include_router(user_permissions.router)  # User permissions with sources
api_router.include_router(notifications.router)  # Real-time notifications
api_router.include_router(websocket.router)  # WebSocket for notifications
api_router.include_router(api_keys.router)  # API Keys management (legacy)
api_router.include_router(user_api_keys.router)  # User API Keys management (personal)
api_router.include_router(user_invitations.router)  # User invitations management
api_router.include_router(webhooks.router)  # Webhooks management
api_router.include_router(hooks.router)  # Hooks & Triggers system
api_router.include_router(tasks.router)  # Tasks management
api_router.include_router(bookmarks.router)  # Bookmarks management
api_router.include_router(audit.router, prefix="/audit", tags=["Audit"])  # Audit logs
api_router.include_router(modules.router)  # Module management system with upload & hot reload
api_router.include_router(languages.router)  # Multilingual (i18n) system
api_router.include_router(email_templates.router)  # Email templates management
api_router.include_router(user_preferences.router)  # User preferences (UI + modules)
api_router.include_router(dashboards.router)  # Dashboards & Widgets system
api_router.include_router(widgets.router)  # Widget catalog

# CORE Services API
api_router.include_router(storage.router)  # File storage service
api_router.include_router(cache.router)  # Cache service (Redis)
api_router.include_router(queue.router)  # Queue service (Celery)
api_router.include_router(scheduled_tasks.router)  # Scheduled tasks (Celery Beat)
api_router.include_router(metrics.router)  # Metrics service (Prometheus)
api_router.include_router(search.router)  # Search service (PostgreSQL FTS)
api_router.include_router(backups.router)  # Backup & Restore service
api_router.include_router(database.router)  # Database management & monitoring
api_router.include_router(system_health.router)  # System health monitoring
api_router.include_router(error_tracking.router)  # Error tracking & monitoring
api_router.include_router(ai.router, prefix="/ai", tags=["AI"])  # AI Assistant service
api_router.include_router(developer_analytics.router)  # Developer analytics & overview


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
