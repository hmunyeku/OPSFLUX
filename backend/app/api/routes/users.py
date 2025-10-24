import asyncio
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, delete, func, select

logger = logging.getLogger(__name__)

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core.config import settings
from app.core.hook_trigger_service import hook_trigger
from app.core.security import get_password_hash, verify_password
from app.core.cache_service import cache_service
from app.core.metrics_decorator import track_business_event
from app.models import (
    Item,
    Message,
    UpdatePassword,
    User,
    UserCreate,
    UserGroupAssignment,
    UserPublic,
    UserRegister,
    UserRoleAssignment,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.models_rbac import (
    Role,
    Group,
    UserRoleLink,
    UserGroupLink,
    UserPermissionLink,
)
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(
    session: SessionDep, skip: int = 0, limit: int = 100, with_rbac: bool = False
) -> Any:
    """
    Retrieve users.
    Use with_rbac=true to include roles and groups relationships.
    """
    count_statement = select(func.count()).select_from(User).where(
        User.deleted_at.is_(None)
    )
    count = session.exec(count_statement).one()

    # Simple query without eager loading for now
    # TODO: Implement proper RBAC data loading when with_rbac=True
    statement = select(User).where(User.deleted_at.is_(None)).offset(skip).limit(limit)
    users = session.exec(statement).all()

    return UsersPublic(data=users, count=count)


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
@track_business_event("user.created", module="users")
async def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )

    # Trigger hook: user.created
    try:
        await hook_trigger.trigger_event(
            event="user.created",
            context={
                "user_id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
            },
            db=session,
        )
    except Exception as e:
        # Ne pas bloquer la création si le hook échoue
        logger.warning(f"Failed to trigger user.created hook: {e}")

    return user


@router.patch("/me", response_model=UserPublic)
async def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    Invalidates user cache.
    """

    # Interdire la modification de l'email
    if user_in.email and user_in.email != current_user.email:
        raise HTTPException(
            status_code=400, detail="La modification de l'email n'est pas autorisée"
        )

    user_data = user_in.model_dump(exclude_unset=True)
    # Supprimer l'email des données à mettre à jour pour plus de sécurité
    user_data.pop("email", None)
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    # Invalidate user cache
    await cache_service.delete(f"me:{current_user.id}", namespace="users")

    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password with strict validation.
    """
    # Vérifier le mot de passe actuel
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    # Vérifier que le nouveau mot de passe est différent
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="Le nouveau mot de passe doit être différent de l'ancien"
        )

    # Importer PasswordService localement pour éviter import circulaire
    from app.core.password_service import PasswordService

    # Valider le nouveau mot de passe
    is_valid, errors = PasswordService.validate_password(body.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={"message": "Mot de passe non conforme à la politique de sécurité", "errors": errors}
        )

    # Hasher le nouveau mot de passe
    hashed_password = get_password_hash(body.new_password)

    # Vérifier l'historique des mots de passe
    password_history = current_user.password_history or []
    if not PasswordService.check_password_history(hashed_password, password_history, history_size=5):
        raise HTTPException(
            status_code=400,
            detail="Ce mot de passe a déjà été utilisé récemment. Veuillez en choisir un nouveau."
        )

    # Mettre à jour le mot de passe et l'historique
    new_history = (password_history + [hashed_password])[-5:]
    current_user.hashed_password = hashed_password
    current_user.password_history = new_history

    session.add(current_user)
    session.commit()
    return Message(message="Mot de passe mis à jour avec succès")


@router.get("/me")
async def read_user_me(
    current_user: CurrentUser,
    session: SessionDep,
    with_rbac: bool = False
) -> Any:
    """
    Get current user.
    Optionally include RBAC information (roles, groups, permissions) with with_rbac=true
    """
    if not with_rbac:
        return current_user

    # Load RBAC information
    from app.models_rbac import UserRole, UserGroup, Role, Group, RolePermission, GroupPermission
    from sqlmodel import select

    # Get user roles
    user_roles_statement = (
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id)
        .where(Role.deleted_at == None)
    )
    user_roles = session.exec(user_roles_statement).all()

    # Get user groups
    user_groups_statement = (
        select(Group)
        .join(UserGroup, UserGroup.group_id == Group.id)
        .where(UserGroup.user_id == current_user.id)
        .where(Group.deleted_at == None)
    )
    user_groups = session.exec(user_groups_statement).all()

    # Collect all permissions from roles and groups
    permissions_set = set()

    # Permissions from roles
    for role in user_roles:
        role_perms_statement = (
            select(RolePermission.permission_code)
            .where(RolePermission.role_id == role.id)
        )
        role_perms = session.exec(role_perms_statement).all()
        permissions_set.update(role_perms)

    # Permissions from groups
    for group in user_groups:
        group_perms_statement = (
            select(GroupPermission.permission_code)
            .where(GroupPermission.group_id == group.id)
        )
        group_perms = session.exec(group_perms_statement).all()
        permissions_set.update(group_perms)

    # Convert user to dict and add RBAC info
    user_dict = {
        **current_user.model_dump(),
        "roles": [{"id": str(role.id), "name": role.name, "description": role.description} for role in user_roles],
        "groups": [{"id": str(group.id), "name": group.name, "description": group.description} for group in user_groups],
        "permissions": sorted(list(permissions_set))
    }

    return user_dict


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user (soft delete).
    Utilise soft delete pour éviter les problèmes de contraintes FK.
    """
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )

    # Soft delete: marquer comme supprimé au lieu de supprimer physiquement
    from datetime import datetime, timezone
    current_user.deleted_at = datetime.now(timezone.utc)
    current_user.is_active = False
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if user == current_user:
        return user
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    return user


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
async def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)

    # Trigger hook: user.updated
    try:
        await hook_trigger.trigger_event(
            event="user.updated",
            context={
                "user_id": str(db_user.id),
                "email": db_user.email,
                "full_name": db_user.full_name,
                "is_active": db_user.is_active,
                "changes": user_in.model_dump(exclude_unset=True),
            },
            db=session,
        )
    except Exception as e:
        logger.warning(f"Failed to trigger user.updated hook: {e}")

    return db_user


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
async def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user (soft delete).
    Utilise soft delete pour éviter les problèmes de contraintes FK.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    # Capturer les infos avant suppression pour le hook
    user_context = {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "deleted_by": str(current_user.id),
    }

    # Soft delete: marquer comme supprimé au lieu de supprimer physiquement
    from datetime import datetime, timezone
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    session.add(user)
    session.commit()
    session.refresh(user)

    # Trigger hook: user.deleted
    try:
        await hook_trigger.trigger_event(
            event="user.deleted",
            context=user_context,
            db=session,
        )
    except Exception as e:
        logger.warning(f"Failed to trigger user.deleted hook: {e}")

    return Message(message="User deleted successfully")


@router.post(
    "/{user_id}/roles",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def assign_roles_to_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    assignment: UserRoleAssignment,
) -> Any:
    """
    Assign roles to a user.
    Replaces all existing role assignments with the new ones.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify all roles exist
    for role_id in assignment.role_ids:
        role = session.get(Role, role_id)
        if not role:
            raise HTTPException(
                status_code=404, detail=f"Role with id {role_id} not found"
            )

    # Delete existing role assignments
    statement = delete(UserRoleLink).where(col(UserRoleLink.user_id) == user_id)
    session.exec(statement)

    # Create new role assignments
    for role_id in assignment.role_ids:
        link = UserRoleLink(user_id=user_id, role_id=role_id)
        session.add(link)

    session.commit()
    session.refresh(user)
    return user


@router.post(
    "/{user_id}/groups",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def assign_groups_to_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    assignment: UserGroupAssignment,
) -> Any:
    """
    Assign groups to a user.
    Replaces all existing group assignments with the new ones.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify all groups exist
    for group_id in assignment.group_ids:
        group = session.get(Group, group_id)
        if not group:
            raise HTTPException(
                status_code=404, detail=f"Group with id {group_id} not found"
            )

    # Delete existing group assignments
    statement = delete(UserGroupLink).where(col(UserGroupLink.user_id) == user_id)
    session.exec(statement)

    # Create new group assignments
    for group_id in assignment.group_ids:
        link = UserGroupLink(user_id=user_id, group_id=group_id)
        session.add(link)

    session.commit()
    session.refresh(user)
    return user
