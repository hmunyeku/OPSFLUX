"""
Service d'authentification avancé.
Gestion des sessions, refresh tokens, rate limiting.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import ALGORITHM
from app.models import User
from app.models_auth import LoginAttempt, Session as UserSession, TokenPair


class AuthService:
    """Service d'authentification centralisé."""

    # Durées de validité des tokens
    ACCESS_TOKEN_EXPIRE_MINUTES = 15  # 15 minutes (court pour sécurité)
    REFRESH_TOKEN_EXPIRE_DAYS = 7  # 7 jours

    # Rate limiting
    MAX_LOGIN_ATTEMPTS = 5  # Max tentatives
    LOCKOUT_DURATION_MINUTES = 15  # Durée de blocage

    @staticmethod
    def create_access_token(user_id: uuid.UUID, session_id: Optional[uuid.UUID] = None) -> str:
        """
        Crée un access token JWT (courte durée).

        Args:
            user_id: ID de l'utilisateur
            session_id: ID de la session (optionnel)

        Returns:
            Access token JWT encodé
        """
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=AuthService.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        to_encode = {
            "exp": expire,
            "sub": str(user_id),
            "type": "access",
        }
        if session_id:
            to_encode["sid"] = str(session_id)

        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def create_refresh_token() -> str:
        """
        Crée un refresh token sécurisé (longue durée).
        Token opaque (pas JWT) pour plus de sécurité.

        Returns:
            Refresh token (string aléatoire sécurisé)
        """
        return secrets.token_urlsafe(64)

    @staticmethod
    def verify_access_token(token: str) -> dict:
        """
        Vérifie et décode un access token.

        Args:
            token: Access token JWT

        Returns:
            Payload décodé (user_id, session_id, etc.)

        Raises:
            HTTPException: Si le token est invalide ou expiré
        """
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid token type")
            return payload
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Could not validate credentials")

    @staticmethod
    def create_session(
        db: Session,
        user: User,
        request: Optional[Request] = None,
    ) -> UserSession:
        """
        Crée une nouvelle session utilisateur.

        Args:
            db: Session database
            user: Utilisateur
            request: Request FastAPI (pour extraire user-agent, IP, etc.)

        Returns:
            Session créée
        """
        # Extraire infos du request
        user_agent = None
        ip_address = None
        if request:
            user_agent = request.headers.get("user-agent")
            # IP réelle (derrière proxy)
            ip_address = request.headers.get("x-forwarded-for") or request.client.host if request.client else None

        # Créer refresh token
        refresh_token = AuthService.create_refresh_token()

        # Créer session
        expires_at = datetime.utcnow() + timedelta(days=AuthService.REFRESH_TOKEN_EXPIRE_DAYS)
        session = UserSession(
            user_id=user.id,
            refresh_token=refresh_token,
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=expires_at,
            is_active=True,
            last_activity_at=datetime.utcnow(),
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        return session

    @staticmethod
    def create_token_pair(
        db: Session,
        user: User,
        request: Optional[Request] = None,
    ) -> TokenPair:
        """
        Crée une paire access + refresh token avec session.

        Args:
            db: Session database
            user: Utilisateur
            request: Request FastAPI

        Returns:
            TokenPair avec access_token et refresh_token
        """
        # Créer session
        session = AuthService.create_session(db, user, request)

        # Créer access token
        access_token = AuthService.create_access_token(user.id, session.id)

        return TokenPair(
            access_token=access_token,
            refresh_token=session.refresh_token,
            token_type="bearer",
            expires_in=AuthService.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # En secondes
        )

    @staticmethod
    def refresh_access_token(db: Session, refresh_token: str) -> TokenPair:
        """
        Rafraîchit un access token avec un refresh token.

        Args:
            db: Session database
            refresh_token: Refresh token

        Returns:
            Nouveau TokenPair

        Raises:
            HTTPException: Si le refresh token est invalide ou expiré
        """
        # Chercher session par refresh token
        statement = select(UserSession).where(
            UserSession.refresh_token == refresh_token,
            UserSession.is_active == True,
        )
        session = db.exec(statement).first()

        if not session:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Vérifier expiration
        if session.expires_at < datetime.utcnow():
            session.is_active = False
            db.commit()
            raise HTTPException(status_code=401, detail="Refresh token expired")

        # Mettre à jour last_activity
        session.last_activity_at = datetime.utcnow()
        db.commit()

        # Récupérer user
        user = db.get(User, session.user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Créer nouveau access token
        access_token = AuthService.create_access_token(user.id, session.id)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,  # Même refresh token
            token_type="bearer",
            expires_in=AuthService.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    @staticmethod
    def revoke_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """
        Révoque une session (logout).

        Args:
            db: Session database
            session_id: ID de la session à révoquer
            user_id: ID de l'utilisateur (vérification propriété)

        Returns:
            True si révoquée, False sinon
        """
        statement = select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
        )
        session = db.exec(statement).first()

        if not session:
            return False

        session.is_active = False
        db.commit()
        return True

    @staticmethod
    def revoke_all_sessions(db: Session, user_id: uuid.UUID) -> int:
        """
        Révoque toutes les sessions d'un utilisateur.

        Args:
            db: Session database
            user_id: ID de l'utilisateur

        Returns:
            Nombre de sessions révoquées
        """
        statement = select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.is_active == True,
        )
        sessions = db.exec(statement).all()

        count = 0
        for session in sessions:
            session.is_active = False
            count += 1

        db.commit()
        return count

    @staticmethod
    def check_rate_limit(db: Session, email: str, ip_address: str) -> bool:
        """
        Vérifie le rate limiting sur les tentatives de login.

        Args:
            db: Session database
            email: Email de l'utilisateur
            ip_address: IP address

        Returns:
            True si autorisé, False si bloqué (trop de tentatives)
        """
        # Compter tentatives échouées récentes (dernières 15 min)
        since = datetime.utcnow() - timedelta(minutes=AuthService.LOCKOUT_DURATION_MINUTES)

        statement = select(LoginAttempt).where(
            LoginAttempt.email == email,
            LoginAttempt.ip_address == ip_address,
            LoginAttempt.success == False,
            LoginAttempt.created_at >= since,
        )
        failed_attempts = len(db.exec(statement).all())

        return failed_attempts < AuthService.MAX_LOGIN_ATTEMPTS

    @staticmethod
    def record_login_attempt(
        db: Session,
        email: str,
        ip_address: str,
        success: bool,
        user_agent: Optional[str] = None,
        failure_reason: Optional[str] = None,
    ) -> None:
        """
        Enregistre une tentative de login.

        Args:
            db: Session database
            email: Email utilisé
            ip_address: IP address
            success: Tentative réussie ou non
            user_agent: User agent
            failure_reason: Raison de l'échec
        """
        attempt = LoginAttempt(
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            failure_reason=failure_reason,
        )
        db.add(attempt)
        db.commit()

    @staticmethod
    def get_active_sessions(db: Session, user_id: uuid.UUID) -> list[UserSession]:
        """
        Récupère toutes les sessions actives d'un utilisateur.

        Args:
            db: Session database
            user_id: ID de l'utilisateur

        Returns:
            Liste des sessions actives
        """
        statement = select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.is_active == True,
            UserSession.expires_at > datetime.utcnow(),
        )
        return list(db.exec(statement).all())
