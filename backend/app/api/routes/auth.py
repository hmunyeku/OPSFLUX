"""
Routes d'authentification avancée.
Login avec refresh token, logout, session management.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.auth_service import AuthService
from app.models import Message
from app.models_auth import (
    RefreshTokenRequest,
    SessionPublic,
    SessionsPublic,
    TokenPair,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
def login_with_refresh_token(
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
) -> TokenPair:
    """
    Login avec création de session et refresh token.

    Retourne:
    - access_token: Token court (15 min) pour les requêtes API
    - refresh_token: Token long (7 jours) pour renouveler l'access token
    - expires_in: Durée de validité de l'access token (secondes)

    Rate limiting: Max 5 tentatives / 15 minutes par IP + email.
    """
    # Extraire IP
    ip_address = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "unknown"
    )
    user_agent = request.headers.get("user-agent")

    # Vérifier rate limit
    if not AuthService.check_rate_limit(session, form_data.username, ip_address):
        AuthService.record_login_attempt(
            session,
            email=form_data.username,
            ip_address=ip_address,
            success=False,
            user_agent=user_agent,
            failure_reason="Rate limit exceeded",
        )
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again in 15 minutes.",
        )

    # Authentifier utilisateur
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )

    if not user:
        # Enregistrer tentative échouée
        AuthService.record_login_attempt(
            session,
            email=form_data.username,
            ip_address=ip_address,
            success=False,
            user_agent=user_agent,
            failure_reason="Invalid credentials",
        )
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    if not user.is_active:
        AuthService.record_login_attempt(
            session,
            email=form_data.username,
            ip_address=ip_address,
            success=False,
            user_agent=user_agent,
            failure_reason="Inactive user",
        )
        raise HTTPException(status_code=400, detail="Inactive user")

    # Enregistrer tentative réussie
    AuthService.record_login_attempt(
        session,
        email=form_data.username,
        ip_address=ip_address,
        success=True,
        user_agent=user_agent,
    )

    # Créer token pair avec session
    token_pair = AuthService.create_token_pair(session, user, request)

    return token_pair


@router.post("/refresh", response_model=TokenPair)
def refresh_token(
    session: SessionDep,
    refresh_request: RefreshTokenRequest,
) -> TokenPair:
    """
    Rafraîchit l'access token avec un refresh token.

    Permet de renouveler un access token expiré sans re-login.
    Le refresh token reste valide jusqu'à expiration (7 jours).
    """
    return AuthService.refresh_access_token(session, refresh_request.refresh_token)


@router.post("/logout", response_model=Message)
def logout(
    session: SessionDep,
    current_user: CurrentUser,
    refresh_request: RefreshTokenRequest,
) -> Message:
    """
    Logout (révoque la session actuelle).

    Invalide le refresh token et révoque la session.
    L'access token devient inutilisable après révocation de la session.
    """
    # Trouver session par refresh token
    from sqlmodel import select

    from app.models_auth import Session as UserSession

    statement = select(UserSession).where(
        UserSession.refresh_token == refresh_request.refresh_token,
        UserSession.user_id == current_user.id,
    )
    user_session = session.exec(statement).first()

    if not user_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Révoquer session
    success = AuthService.revoke_session(session, user_session.id, current_user.id)

    if not success:
        raise HTTPException(status_code=400, detail="Could not revoke session")

    return Message(message="Successfully logged out")


@router.post("/logout-all", response_model=Message)
def logout_all(
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Logout de toutes les sessions (tous les appareils).

    Révoque toutes les sessions actives de l'utilisateur.
    Utile en cas de compromission ou changement de mot de passe.
    """
    count = AuthService.revoke_all_sessions(session, current_user.id)

    return Message(message=f"Successfully logged out from {count} session(s)")


@router.get("/sessions", response_model=SessionsPublic)
def get_active_sessions(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Liste toutes les sessions actives de l'utilisateur.

    Permet de voir tous les appareils/navigateurs connectés.
    """
    sessions = AuthService.get_active_sessions(session, current_user.id)

    return SessionsPublic(
        data=[SessionPublic.model_validate(s) for s in sessions],
        count=len(sessions),
    )


@router.delete("/sessions/{session_id}", response_model=Message)
def revoke_session(
    session_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Révoque une session spécifique (logout d'un appareil).

    Permet de déconnecter un appareil/navigateur spécifique.
    """
    success = AuthService.revoke_session(session, session_id, current_user.id)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return Message(message="Session successfully revoked")
