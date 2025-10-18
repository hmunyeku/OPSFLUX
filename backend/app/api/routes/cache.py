"""
Routes API pour le Cache Service.
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Body

from app.api.deps import CurrentUser, SessionDep
from app.core.cache_service import cache_service
from app.core.rbac import require_permission
from app.models import User


router = APIRouter(prefix="/cache", tags=["cache"])


@router.get("/stats")
@require_permission("core.cache.read")
async def get_cache_stats(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Récupère les statistiques du cache.

    Requiert la permission: core.cache.read
    """
    stats = await cache_service.get_stats()
    return stats


@router.post("/clear")
@require_permission("core.cache.clear")
async def clear_cache(
    current_user: CurrentUser,
    session: SessionDep,
    namespace: Optional[str] = Body(None, description="Namespace à vider (None = tout)"),
) -> Any:
    """
    Vide le cache.

    Args:
        namespace: Namespace spécifique à vider, ou None pour tout vider

    Requiert la permission: core.cache.clear
    """
    if namespace:
        count = await cache_service.clear_namespace(namespace)
        return {
            "success": True,
            "message": f"Cache cleared for namespace: {namespace}",
            "keys_deleted": count,
        }
    else:
        # Vider tout le cache (dangereux!)
        count = await cache_service.delete_pattern("*")
        return {
            "success": True,
            "message": "All cache cleared",
            "keys_deleted": count,
        }


@router.get("/health")
@require_permission("core.cache.read")
async def check_cache_health(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Vérifie que Redis est accessible.

    Requiert la permission: core.cache.read
    """
    is_healthy = await cache_service.ping()

    if not is_healthy:
        raise HTTPException(status_code=503, detail="Redis is not accessible")

    return {
        "healthy": True,
        "backend": "redis",
    }


@router.get("/get/{key}")
@require_permission("core.cache.search")
async def get_cache_value(
    key: str,
    namespace: Optional[str] = None,
    current_user: CurrentUser = None,
    session: SessionDep,
) -> Any:
    """
    Récupère une valeur du cache (debug).

    Requiert la permission: core.cache.search
    """
    value = await cache_service.get(key, namespace=namespace)

    if value is None:
        raise HTTPException(status_code=404, detail="Key not found")

    return {
        "key": key,
        "namespace": namespace,
        "value": value,
    }


@router.delete("/delete/{key}")
@require_permission("core.cache.delete_key")
async def delete_cache_key(
    key: str,
    namespace: Optional[str] = None,
    current_user: CurrentUser = None,
    session: SessionDep,
) -> Any:
    """
    Supprime une clé du cache (debug).

    Requiert la permission: core.cache.delete_key
    """
    deleted = await cache_service.delete(key, namespace=namespace)

    if not deleted:
        raise HTTPException(status_code=404, detail="Key not found")

    return {
        "success": True,
        "key": key,
        "namespace": namespace,
    }
