"""RBAC utilities — permission checking, cache invalidation."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.models.common import (
    Permission,
    RolePermission,
    UserGroup,
    UserGroupMember,
)


async def get_user_permissions(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> set[str]:
    """Get all permissions for a user in a given entity, with Redis cache."""
    redis = get_redis()
    cache_key = f"rbac:{user_id}:{entity_id}"

    # Check cache
    cached = await redis.smembers(cache_key)
    if cached:
        return cached

    # Load from DB
    stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .join(UserGroup, UserGroup.role_code == RolePermission.role_code)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    result = await db.execute(stmt)
    permissions = {row[0] for row in result.all()}

    # Cache for 5 minutes
    if permissions:
        await redis.sadd(cache_key, *permissions)
        await redis.expire(cache_key, 300)

    return permissions


async def check_permission(
    user_id: UUID, entity_id: UUID, permission_code: str, db: AsyncSession
) -> bool:
    """Check if a user has a specific permission."""
    permissions = await get_user_permissions(user_id, entity_id, db)
    return permission_code in permissions or "*" in permissions


async def invalidate_rbac_cache(user_id: UUID | None = None) -> None:
    """Invalidate RBAC cache for a user or all users."""
    redis = get_redis()
    if user_id:
        keys = await redis.keys(f"rbac:{user_id}:*")
    else:
        keys = await redis.keys("rbac:*")

    if keys:
        await redis.delete(*keys)
