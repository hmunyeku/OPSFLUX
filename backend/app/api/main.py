from fastapi import APIRouter

from app.api.routes import (
    addresses,
    address_types,
    api_keys,
    audit,
    auth,
    bookmarks,
    email_templates,
    groups,
    hooks,
    items,
    languages,
    login,
    modules,
    notifications,
    permissions,
    private,
    roles,
    security,
    settings as settings_routes,
    tasks,
    twofa,
    user_permissions,
    users,
    utils,
    webhooks,
    websocket,
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
api_router.include_router(api_keys.router)  # API Keys management
api_router.include_router(webhooks.router)  # Webhooks management
api_router.include_router(hooks.router)  # Hooks & Triggers system
api_router.include_router(tasks.router)  # Tasks management
api_router.include_router(bookmarks.router)  # Bookmarks management
api_router.include_router(audit.router, prefix="/audit", tags=["Audit"])  # Audit logs
api_router.include_router(modules.router)  # Module management system
api_router.include_router(languages.router)  # Multilingual (i18n) system
api_router.include_router(email_templates.router)  # Email templates management


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
