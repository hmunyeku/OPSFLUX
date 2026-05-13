"""Attach the default role to a newly created user, based on user_type and tenant settings."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    Role,
    Setting,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)


async def _get_default_role_code(db: AsyncSession, entity_id: UUID, user: User) -> str:
    """Resolve the default role code for a user based on user_type + tenant setting.

    Resolution order:
      - If the user is a tier contact, use 'rbac.default_role.tier_contact'.
      - If user_type == 'external', use 'rbac.default_role.external'.
      - Otherwise (internal), use 'rbac.default_role.internal'.
    """
    if user.tier_contact_id:
        key = "rbac.default_role.tier_contact"
        default = "TIER_CONTACT"
    elif user.user_type == "external":
        key = "rbac.default_role.external"
        default = "PAX"
    else:
        key = "rbac.default_role.internal"
        default = "READER"

    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    value = result.scalar_one_or_none()
    if value is None:
        return default
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value if isinstance(value, str) else default


async def _get_or_create_default_group(
    db: AsyncSession, entity_id: UUID, role_code: str
) -> UserGroup:
    """Find or create the 'Default {role_code}' group for an entity, with role attached."""
    group_name = f"Default {role_code}"
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.entity_id == entity_id, UserGroup.name == group_name
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    new_group = UserGroup(entity_id=entity_id, name=group_name, active=True)
    db.add(new_group)
    await db.flush()
    db.add(UserGroupRole(group_id=new_group.id, role_code=role_code))
    await db.flush()
    return new_group


async def attach_default_role_to_user(
    db: AsyncSession, user: User, entity_id: UUID
) -> None:
    """Attach the user to a default group based on user_type. No-op if role_code is empty/None."""
    role_code = await _get_default_role_code(db, entity_id, user)
    if not role_code or role_code == "NONE":
        return

    # Verify role exists
    role = await db.get(Role, role_code)
    if not role:
        # Setting points to an invalid role — log but don't fail user creation
        return

    group = await _get_or_create_default_group(db, entity_id, role_code)

    # Check if user is already a member
    existing_q = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.user_id == user.id,
            UserGroupMember.group_id == group.id,
        )
    )
    if existing_q.scalar_one_or_none():
        return

    db.add(UserGroupMember(user_id=user.id, group_id=group.id))
    await db.flush()
