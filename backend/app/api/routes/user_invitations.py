"""
Routes API pour la gestion des invitations d'utilisateurs
"""
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models import (
    UserInvitation,
    UserInvitationCreate,
    UserInvitationPublic,
    UserInvitationsPublic,
    AcceptInvitation,
    UserPublic,
    User,
    AppSettings,
)
from app.core.email_service import EmailService
from app.core.security import get_password_hash
from app.core.hook_trigger_service import hook_trigger
from app import crud

router = APIRouter(prefix="/users/invitations", tags=["user-invitations"])


def get_invitation_expiry_days(session: SessionDep) -> int:
    """Get the invitation expiry days from settings, fallback to 7 days"""
    settings_statement = select(AppSettings)
    settings = session.exec(settings_statement).first()
    if settings and settings.invitation_expiry_days:
        return settings.invitation_expiry_days
    return 7  # Default fallback


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserInvitationPublic,
)
async def invite_user(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    invitation_in: UserInvitationCreate,
) -> Any:
    """
    Invite a new user by email.
    Sends an invitation email with a unique token.
    """
    # Vérifier que l'utilisateur n'existe pas déjà
    existing_user = crud.get_user_by_email(session=session, email=invitation_in.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists in the system.",
        )

    # Vérifier qu'il n'y a pas déjà une invitation active pour cet email
    statement = select(UserInvitation).where(
        UserInvitation.email == invitation_in.email,
        UserInvitation.accepted_at == None,
        UserInvitation.deleted_at == None,
    )
    existing_invitation = session.exec(statement).first()

    if existing_invitation:
        # Vérifier si l'invitation est encore valide
        expires_at = datetime.fromisoformat(existing_invitation.expires_at)
        if expires_at > datetime.now():
            raise HTTPException(
                status_code=400,
                detail="An active invitation for this email already exists.",
            )

    # Générer un token unique
    token = str(uuid.uuid4())

    # Date d'expiration: récupérer depuis les settings
    expiry_days = get_invitation_expiry_days(session)
    expires_at = (datetime.now() + timedelta(days=expiry_days)).isoformat()

    # Créer l'invitation
    invitation = UserInvitation(
        email=invitation_in.email,
        role_id=invitation_in.role_id,
        first_name=invitation_in.first_name,
        last_name=invitation_in.last_name,
        token=token,
        invited_by_id=current_user.id,
        expires_at=expires_at,
        created_by_id=current_user.id,
        created_at=datetime.now(),
    )

    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    # Envoyer l'email d'invitation
    inviter_name = current_user.full_name or current_user.email
    EmailService.send_user_invitation_email(
        email_to=invitation_in.email,
        inviter_name=inviter_name,
        invitation_token=token,
        db=session,
    )

    # Déclencher le hook user.invitation.created
    await hook_trigger.trigger_event(
        event="user.invitation.created",
        context={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
            "first_name": invitation.first_name,
            "last_name": invitation.last_name,
            "role_id": str(invitation.role_id) if invitation.role_id else None,
            "invited_by_id": str(current_user.id),
            "invited_by_name": inviter_name,
            "expires_at": invitation.expires_at,
            "expiry_days": expiry_days,
        },
        db=session,
    )

    return invitation


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserInvitationsPublic,
)
def list_invitations(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    include_accepted: bool = False,
) -> Any:
    """
    List all user invitations.
    By default, only shows pending (non-accepted) invitations.
    """
    statement = select(UserInvitation).where(UserInvitation.deleted_at == None)

    if not include_accepted:
        statement = statement.where(UserInvitation.accepted_at == None)

    statement = statement.offset(skip).limit(limit)

    invitations = session.exec(statement).all()
    count = len(invitations)

    return UserInvitationsPublic(data=invitations, count=count)


@router.post("/accept", response_model=UserPublic)
async def accept_invitation(
    *,
    session: SessionDep,
    accept_data: AcceptInvitation,
) -> Any:
    """
    Accept a user invitation and create the user account.
    This endpoint does not require authentication.
    """
    # Trouver l'invitation par token
    statement = select(UserInvitation).where(
        UserInvitation.token == accept_data.token,
        UserInvitation.deleted_at == None,
    )
    invitation = session.exec(statement).first()

    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found or has been revoked.",
        )

    # Vérifier que l'invitation n'a pas déjà été acceptée
    if invitation.accepted_at:
        raise HTTPException(
            status_code=400,
            detail="This invitation has already been accepted.",
        )

    # Vérifier que l'invitation n'a pas expiré
    expires_at = datetime.fromisoformat(invitation.expires_at)
    if expires_at < datetime.now():
        raise HTTPException(
            status_code=400,
            detail="This invitation has expired.",
        )

    # Vérifier que l'utilisateur n'existe pas déjà
    existing_user = crud.get_user_by_email(session=session, email=invitation.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists.",
        )

    # Créer l'utilisateur
    first_name = accept_data.first_name or invitation.first_name
    last_name = accept_data.last_name or invitation.last_name
    full_name = f"{first_name} {last_name}".strip() if first_name and last_name else None

    user = User(
        email=invitation.email,
        hashed_password=get_password_hash(accept_data.password),
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        is_active=True,
        is_superuser=False,
        created_at=datetime.now(),
        created_by_id=invitation.invited_by_id,
    )

    session.add(user)
    session.commit()
    session.refresh(user)

    # Assigner le rôle si spécifié
    if invitation.role_id:
        from app.models_rbac import UserRoleLink

        role_link = UserRoleLink(
            user_id=user.id,
            role_id=invitation.role_id,
            created_at=datetime.now(),
            created_by_id=invitation.invited_by_id,
        )
        session.add(role_link)

    # Marquer l'invitation comme acceptée
    invitation.accepted_at = datetime.now().isoformat()
    invitation.updated_at = datetime.now()
    invitation.updated_by_id = user.id

    session.add(invitation)
    session.commit()
    session.refresh(user)

    # Déclencher le hook user.invitation.accepted
    await hook_trigger.trigger_event(
        event="user.invitation.accepted",
        context={
            "invitation_id": str(invitation.id),
            "user_id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
            "role_id": str(invitation.role_id) if invitation.role_id else None,
            "invited_by_id": str(invitation.invited_by_id),
            "accepted_at": invitation.accepted_at,
        },
        db=session,
    )

    return user


@router.delete(
    "/{invitation_id}",
    dependencies=[Depends(get_current_active_superuser)],
)
async def revoke_invitation(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    invitation_id: uuid.UUID,
) -> dict:
    """
    Revoke (soft delete) a user invitation.
    """
    invitation = session.get(UserInvitation, invitation_id)

    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    if invitation.accepted_at:
        raise HTTPException(
            status_code=400,
            detail="Cannot revoke an invitation that has already been accepted.",
        )

    # Soft delete
    invitation.deleted_at = datetime.now()
    invitation.deleted_by_id = current_user.id

    session.add(invitation)
    session.commit()

    # Déclencher le hook user.invitation.revoked
    await hook_trigger.trigger_event(
        event="user.invitation.revoked",
        context={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
            "first_name": invitation.first_name,
            "last_name": invitation.last_name,
            "role_id": str(invitation.role_id) if invitation.role_id else None,
            "invited_by_id": str(invitation.invited_by_id),
            "revoked_by_id": str(current_user.id),
            "revoked_by_name": current_user.full_name or current_user.email,
            "revoked_at": invitation.deleted_at.isoformat(),
        },
        db=session,
    )

    return {"message": "Invitation revoked successfully"}
