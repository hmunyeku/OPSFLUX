from fastapi import APIRouter

from app.api.routes import (
    addresses,
    address_types,
    auth,
    groups,
    items,
    login,
    permissions,
    private,
    roles,
    security,
    twofa,
    user_permissions,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(auth.router)  # Nouvelle auth avec refresh token
api_router.include_router(login.router)  # Ancienne auth (rétrocompatibilité)
api_router.include_router(users.router)
api_router.include_router(security.router)  # Security and password policy
api_router.include_router(twofa.router, prefix="/2fa", tags=["2FA"])  # Two-Factor Authentication
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(addresses.router)  # Address management
api_router.include_router(address_types.router)  # Address type configuration
api_router.include_router(permissions.router)  # RBAC permissions
api_router.include_router(roles.router)  # RBAC roles
api_router.include_router(groups.router)  # RBAC groups
api_router.include_router(user_permissions.router)  # User permissions with sources


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
