"""FastAPI dependencies — auth, entity scoping, permissions."""

from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.security import JWTError, decode_token
from app.models.common import (
    Permission,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_current_entity(
    request: Request,
    x_entity_id: str | None = Header(None, alias="X-Entity-ID"),
    current_user: User = Depends(get_current_user),
) -> UUID:
    """Resolve the current entity from header or user default."""
    if x_entity_id:
        try:
            return UUID(x_entity_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Entity-ID header",
            )

    if current_user.default_entity_id:
        return current_user.default_entity_id

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No entity context. Set X-Entity-ID header or user default entity.",
    )


def require_permission(permission_code: str):
    """Factory returning a dependency that checks user has a specific permission."""

    async def _check_permission(
        current_user: User = Depends(get_current_user),
        entity_id: UUID = Depends(get_current_entity),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        redis = get_redis()
        cache_key = f"rbac:{current_user.id}:{entity_id}"

        # Check Redis cache first
        cached = await redis.smembers(cache_key)
        if cached:
            if permission_code in cached or "*" in cached:
                return
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_code}",
            )

        # Load from DB: get all permissions for this user in this entity
        stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_code == Permission.code)
            .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
            .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(
                UserGroupMember.user_id == current_user.id,
                UserGroup.entity_id == entity_id,
                UserGroup.active == True,
            )
        )
        result = await db.execute(stmt)
        user_permissions = {row[0] for row in result.all()}

        # Cache for 5 minutes
        if user_permissions:
            await redis.sadd(cache_key, *user_permissions)
            await redis.expire(cache_key, 300)

        if permission_code not in user_permissions and "*" not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_code}",
            )

    return Depends(_check_permission)


async def has_user_permission(
    user: User,
    entity_id: UUID,
    permission_code: str,
    db: AsyncSession,
) -> bool:
    """Check if user has a specific permission (non-raising).

    Returns True if user has the permission or wildcard '*'.
    Used for conditional query scoping (e.g., read_all vs own data).
    """
    redis = get_redis()
    cache_key = f"rbac:{user.id}:{entity_id}"

    cached = await redis.smembers(cache_key)
    if cached:
        return permission_code in cached or "*" in cached

    stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user.id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    result = await db.execute(stmt)
    user_permissions = {row[0] for row in result.all()}

    if user_permissions:
        await redis.sadd(cache_key, *user_permissions)
        await redis.expire(cache_key, 300)

    return permission_code in user_permissions or "*" in user_permissions


# Permission mapping for polymorphic owner types
_OWNER_PERMISSION_MAP: dict[str, tuple[str, str]] = {
    # owner_type: (read_permission, write_permission)
    "tier": ("tiers.read", "tiers.update"),
    "tier_contact": ("tiers.read", "tiers.update"),
    "entity": ("core.entity.read", "core.entity.update"),
    "asset": ("assets.read", "assets.update"),
    "compliance_rule": ("conformite.rule.read", "conformite.rule.update"),
    "compliance_type": ("conformite.type.read", "conformite.type.update"),
    "compliance_record": ("conformite.record.read", "conformite.record.update"),
    "compliance_exemption": ("conformite.exemption.read", "conformite.exemption.approve"),
    "job_position": ("conformite.jobposition.read", "conformite.jobposition.update"),
}


async def check_polymorphic_owner_access(
    owner_type: str,
    owner_id: UUID,
    current_user: User,
    db: AsyncSession,
    request: Request | None = None,
    *,
    write: bool = False,
) -> None:
    """Validate current user has access to the polymorphic parent object.

    For user-owned data: self-service or core.users.manage.
    For other owner types: maps to the appropriate module permission.
    """
    if owner_type == "user":
        await check_user_data_access(owner_id, current_user, db, request)
        return

    perms = _OWNER_PERMISSION_MAP.get(owner_type)
    if not perms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported owner type: {owner_type}",
        )

    permission_code = perms[1] if write else perms[0]

    # Resolve entity context
    entity_id: UUID | None = None
    if request:
        raw = request.headers.get("X-Entity-ID")
        if raw:
            try:
                entity_id = UUID(raw)
            except ValueError:
                pass
    if not entity_id and current_user.default_entity_id:
        entity_id = current_user.default_entity_id

    if not entity_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No entity context for permission check",
        )

    if not await has_user_permission(current_user, entity_id, permission_code, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )


async def check_user_data_access(
    user_id: UUID,
    current_user: User,
    db: AsyncSession,
    request: Request | None = None,
) -> None:
    """Ensure current user can access target user's personal data.

    Self-service (user_id == current_user.id) is always allowed.
    Managing another user's data requires core.users.manage permission.
    """
    if current_user.id == user_id:
        return  # self-service always allowed

    # Resolve entity context for RBAC check
    entity_id: UUID | None = None
    if request:
        raw = request.headers.get("X-Entity-ID")
        if raw:
            try:
                entity_id = UUID(raw)
            except ValueError:
                pass
    if not entity_id and current_user.default_entity_id:
        entity_id = current_user.default_entity_id

    if entity_id and await has_user_permission(current_user, entity_id, "core.users.manage", db):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Permission denied",
    )


async def check_verified_lock(
    record,
    current_user: User,
    *,
    allow_permission: str = "conformite.verify",
    entity_id=None,
    db=None,
) -> None:
    """Block updates on verified records unless user has the allow_permission.

    Raises 403 if the record is locked (verification_status == 'verified')
    and the current user doesn't have the required permission.
    """
    if not hasattr(record, 'verification_status'):
        return  # model doesn't use VerifiableMixin
    if record.verification_status != "verified":
        return  # not locked, allow edit

    # Record is verified/locked — check if user has override permission
    if entity_id and db:
        has_perm = await _has_permission(current_user, allow_permission, entity_id, db)
        if has_perm:
            return  # user has override permission, allow edit

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Cet enregistrement est vérifié et verrouillé. Seul un responsable conformité peut le modifier.",
    )
