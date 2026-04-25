"""RBAC utilities — 3-layer permission resolution, cache invalidation.

Resolution order (highest priority first):
  1. User permission overrides   (per-user grants/revokes)
  2. Role permissions             (via group → role → role_permissions)
  3. Group permission overrides   (per-group grants/revokes)

Permission mode (configurable per entity via setting `rbac.permission_mode`):
  - "restrictive" (default): higher-priority `granted=False` revokes lower layers
  - "additive": all `granted=True` across layers are unioned; `granted=False` is ignored
"""

from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.models.common import (
    GroupPermissionOverride,
    Permission,
    RolePermission,
    Setting,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    UserPermissionOverride,
)

PermissionSource = Literal["user", "role", "group"]
PermissionMode = Literal["additive", "restrictive"]


async def _get_permission_mode(entity_id: UUID, db: AsyncSession) -> PermissionMode:
    """Read the permission resolution mode for an entity.

    Falls back to tenant-level setting, then to "restrictive" default.
    """
    redis = get_redis()
    cache_key = f"rbac:mode:{entity_id}"

    cached = await redis.get(cache_key)
    if cached:
        return cached if cached in ("additive", "restrictive") else "restrictive"

    # Try entity-scoped setting first
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == "rbac.permission_mode",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        # Fallback to tenant-level
        result = await db.execute(
            select(Setting.value).where(
                Setting.key == "rbac.permission_mode",
                Setting.scope == "tenant",
            )
        )
        row = result.scalar_one_or_none()

    mode: PermissionMode = "restrictive"
    if row and isinstance(row, dict) and row.get("value") in ("additive", "restrictive"):
        mode = row["value"]
    elif row and isinstance(row, str) and row in ("additive", "restrictive"):
        mode = row

    # Cache for 5 minutes
    await redis.set(cache_key, mode, ex=300)
    return mode


async def _resolve_permissions(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> dict[str, PermissionSource]:
    """Resolve effective permissions with source tracking.

    Restrictive mode (default):
      Layer 1 – Group overrides: granted=True adds, granted=False remembered for revoke
      Layer 2 – Role permissions: standard grants
      Layer 3 – User overrides: granted=True adds, granted=False revokes from all layers

    Additive mode:
      All granted=True across all layers are unioned; granted=False is ignored.
    """
    mode = await _get_permission_mode(entity_id, db)

    # ── Fetch all 3 layers ────────────────────────────────────────────────

    # Layer 1: Group permission overrides
    group_overrides_stmt = (
        select(GroupPermissionOverride.permission_code, GroupPermissionOverride.granted)
        .join(UserGroup, UserGroup.id == GroupPermissionOverride.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    group_result = await db.execute(group_overrides_stmt)
    group_overrides = group_result.all()

    # Layer 2: Role permissions (via junction table)
    role_perms_stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    role_result = await db.execute(role_perms_stmt)
    role_codes = [row[0] for row in role_result.all()]

    # Layer 3: User permission overrides
    user_overrides_stmt = (
        select(UserPermissionOverride.permission_code, UserPermissionOverride.granted)
        .where(UserPermissionOverride.user_id == user_id)
    )
    user_result = await db.execute(user_overrides_stmt)
    user_overrides = user_result.all()

    # ── Merge according to mode ───────────────────────────────────────────

    if mode == "additive":
        return _merge_additive(group_overrides, role_codes, user_overrides)
    else:
        return _merge_restrictive(group_overrides, role_codes, user_overrides)


def _merge_additive(
    group_overrides: list[tuple[str, bool]],
    role_codes: list[str],
    user_overrides: list[tuple[str, bool]],
) -> dict[str, PermissionSource]:
    """Additive: union of all granted=True; granted=False is ignored."""
    effective: dict[str, PermissionSource] = {}

    for code, granted in group_overrides:
        if granted:
            effective[code] = "group"

    for code in role_codes:
        if code not in effective:
            effective[code] = "role"

    for code, granted in user_overrides:
        if granted:
            effective[code] = "user"

    return effective


def _merge_restrictive(
    group_overrides: list[tuple[str, bool]],
    role_codes: list[str],
    user_overrides: list[tuple[str, bool]],
) -> dict[str, PermissionSource]:
    """Restrictive: higher-priority granted=False revokes lower layers."""
    effective: dict[str, PermissionSource] = {}

    # Layer 1: Group overrides (lowest priority)
    group_revokes: set[str] = set()
    for code, granted in group_overrides:
        if granted:
            effective[code] = "group"
        else:
            group_revokes.add(code)

    # Layer 2: Role permissions
    for code in role_codes:
        if code in group_revokes:
            # Group explicitly revokes this role permission
            effective.pop(code, None)
        elif code not in effective:
            effective[code] = "role"

    # Layer 3: User overrides (highest priority)
    for code, granted in user_overrides:
        if granted:
            effective[code] = "user"
        else:
            effective.pop(code, None)

    return effective


async def get_user_permissions(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> set[str]:
    """Get effective permission codes for a user in an entity, with Redis cache."""
    redis = get_redis()
    cache_key = f"rbac:{user_id}:{entity_id}"

    # Check cache (codes only)
    cached = await redis.smembers(cache_key)
    if cached:
        return cached

    # Resolve from DB
    effective = await _resolve_permissions(user_id, entity_id, db)
    permissions = set(effective.keys())

    # Cache codes for 5 minutes
    if permissions:
        await redis.sadd(cache_key, *permissions)
        await redis.expire(cache_key, 300)

    return permissions


async def get_user_permissions_with_sources(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> dict[str, PermissionSource]:
    """Get effective permissions with their source layer. Used for UI badge display.

    Returns dict mapping permission_code → source ("user" | "role" | "group").
    Not cached (used only in admin views, not hot path).
    """
    return await _resolve_permissions(user_id, entity_id, db)


async def get_permission_mode(
    entity_id: UUID, db: AsyncSession
) -> PermissionMode:
    """Public accessor for the entity's permission mode (for admin UI)."""
    return await _get_permission_mode(entity_id, db)


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


async def invalidate_permission_mode_cache(entity_id: UUID | None = None) -> None:
    """Invalidate the permission mode cache when an admin changes the setting."""
    redis = get_redis()
    if entity_id:
        await redis.delete(f"rbac:mode:{entity_id}")
    else:
        keys = await redis.keys("rbac:mode:*")
        if keys:
            await redis.delete(*keys)
