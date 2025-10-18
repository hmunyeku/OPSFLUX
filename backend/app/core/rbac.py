"""
RBAC (Role-Based Access Control) utilities for OpsFlux.

This module provides permission checking and enforcement for the API.
"""
from functools import wraps
from typing import Callable
from fastapi import HTTPException, status
from sqlmodel import select, Session
from app.models import User, Permission, RolePermissionLink, UserRoleLink


async def has_permission(
    user: User,
    permission_code: str,
    session: Session
) -> bool:
    """
    Vérifie si un utilisateur a une permission donnée.

    Cette fonction vérifie si l'utilisateur possède une permission spécifique
    en vérifiant ses rôles et les permissions associées à ces rôles.

    Args:
        user: L'utilisateur à vérifier
        permission_code: Code de la permission (ex: "core.users.create")
        session: Session database asynchrone

    Returns:
        True si l'utilisateur a la permission, False sinon

    Examples:
        >>> has_permission(current_user, "core.email_templates.create", session)
        True

        >>> has_permission(current_user, "core.users.delete", session)
        False
    """
    # Superadmin a toutes les permissions
    if user.is_superuser:
        return True

    # Requête pour vérifier la permission via les rôles de l'utilisateur
    query = (
        select(Permission)
        .join(RolePermissionLink, Permission.id == RolePermissionLink.permission_id)
        .join(UserRoleLink, RolePermissionLink.role_id == UserRoleLink.role_id)
        .where(UserRoleLink.user_id == user.id)
        .where(Permission.code == permission_code)
        .where(Permission.is_active == True)
    )

    result = await session.execute(query)
    permission = result.scalar_one_or_none()

    return permission is not None


def require_permission(permission_code: str):
    """
    Décorateur FastAPI pour vérifier qu'un utilisateur a une permission.

    Ce décorateur doit être utilisé sur les routes FastAPI pour protéger
    l'accès aux endpoints qui nécessitent des permissions spécifiques.

    Usage:
        @router.post("/email-templates/")
        @require_permission("core.email_templates.create")
        async def create_template(
            template: TemplateCreate,
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_async_session)
        ):
            # Route protégée - accessible uniquement si l'utilisateur
            # a la permission "core.email_templates.create"
            ...

        @router.delete("/cache/")
        @require_permission("core.cache.clear")
        async def clear_cache(
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_async_session)
        ):
            # Accessible uniquement avec permission "core.cache.clear"
            ...

    Args:
        permission_code: Code de la permission requise (ex: "core.api_keys.create")

    Returns:
        Decorator function qui wrap la fonction FastAPI

    Raises:
        HTTPException 401: Si l'utilisateur n'est pas authentifié
        HTTPException 403: Si l'utilisateur n'a pas la permission requise
        HTTPException 500: Si la session database n'est pas disponible

    Notes:
        - Les superadmins (is_superuser=True) ont toujours accès
        - La vérification est effectuée à chaque appel (pas de cache)
        - Nécessite que current_user et session soient dans les kwargs
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extraire current_user et session des kwargs
            current_user = kwargs.get('current_user')
            session = kwargs.get('session')

            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )

            if not session:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database session not available"
                )

            # Vérifier la permission
            if not await has_permission(current_user, permission_code, session):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: {permission_code} required"
                )

            # Appeler la fonction originale
            return await func(*args, **kwargs)

        return wrapper
    return decorator


def require_any_permission(*permission_codes: str):
    """
    Décorateur pour vérifier qu'un utilisateur a AU MOINS UNE des permissions listées.

    Utile pour des endpoints qui peuvent être accessibles par plusieurs types
    de permissions différentes (ex: admin OU owner).

    Usage:
        @router.get("/resource/{id}")
        @require_any_permission("core.resource.read", "core.resource.read_all")
        async def get_resource(
            id: int,
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_async_session)
        ):
            # Accessible si l'utilisateur a "core.resource.read"
            # OU "core.resource.read_all"
            ...

    Args:
        *permission_codes: Liste de codes de permissions (au moins une requise)

    Returns:
        Decorator function

    Raises:
        HTTPException 401: Si l'utilisateur n'est pas authentifié
        HTTPException 403: Si l'utilisateur n'a AUCUNE des permissions requises
        HTTPException 500: Si la session database n'est pas disponible
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_user = kwargs.get('current_user')
            session = kwargs.get('session')

            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )

            if not session:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database session not available"
                )

            # Vérifier si l'utilisateur a au moins une des permissions
            for permission_code in permission_codes:
                if await has_permission(current_user, permission_code, session):
                    # Dès qu'une permission est trouvée, on autorise l'accès
                    return await func(*args, **kwargs)

            # Aucune permission trouvée
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: one of {', '.join(permission_codes)} required"
            )

        return wrapper
    return decorator


def require_all_permissions(*permission_codes: str):
    """
    Décorateur pour vérifier qu'un utilisateur a TOUTES les permissions listées.

    Utile pour des opérations sensibles qui nécessitent plusieurs permissions
    simultanément.

    Usage:
        @router.post("/admin/reset-system/")
        @require_all_permissions(
            "core.cache.clear",
            "core.queue.purge",
            "core.storage.delete"
        )
        async def reset_system(
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_async_session)
        ):
            # Accessible uniquement si l'utilisateur a LES TROIS permissions
            ...

    Args:
        *permission_codes: Liste de codes de permissions (toutes requises)

    Returns:
        Decorator function

    Raises:
        HTTPException 401: Si l'utilisateur n'est pas authentifié
        HTTPException 403: Si l'utilisateur n'a pas TOUTES les permissions
        HTTPException 500: Si la session database n'est pas disponible
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_user = kwargs.get('current_user')
            session = kwargs.get('session')

            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )

            if not session:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database session not available"
                )

            # Vérifier que l'utilisateur a TOUTES les permissions
            for permission_code in permission_codes:
                if not await has_permission(current_user, permission_code, session):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission denied: {permission_code} required (all permissions must be present)"
                    )

            # Toutes les permissions sont présentes
            return await func(*args, **kwargs)

        return wrapper
    return decorator
