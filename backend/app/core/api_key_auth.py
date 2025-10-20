"""
API Key Authentication Module
Middleware pour verifier les cles API dans les headers X-API-Key
"""

import hashlib
from datetime import datetime
from typing import Annotated

from fastapi import Header, HTTPException, status, Depends
from sqlmodel import Session, select

from app.core.db import engine
from app.models import User
from app.models_api_keys import UserApiKey


def get_db_for_api_key():
    """Get database session for API key verification"""
    with Session(engine) as session:
        yield session


async def verify_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    session: Session = Depends(get_db_for_api_key)
) -> User:
    """
    Verify API key and return associated user.

    Usage:
        Add as dependency to routes that need API key authentication:
        @router.get("/protected", dependencies=[Depends(verify_api_key)])

    Args:
        x_api_key: API key from X-API-Key header
        session: Database session

    Returns:
        User: The authenticated user

    Raises:
        HTTPException: If API key is missing, invalid, expired, or inactive
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key required. Use X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    # Verifier le format (doit commencer par "ofs_")
    if not x_api_key.startswith("ofs_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key format. Key must start with 'ofs_'",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    # Hash la cle fournie
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()

    # Chercher dans la DB
    statement = (
        select(UserApiKey, User)
        .join(User, UserApiKey.user_id == User.id)
        .where(UserApiKey.key_hash == key_hash)
        .where(UserApiKey.is_active == True)
        .where(UserApiKey.deleted_at == None)  # Exclure soft deleted
    )

    result = session.exec(statement).first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API Key",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    api_key, user = result

    # Verifier expiration
    if api_key.expires_at and datetime.utcnow() > api_key.expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key expired",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    # Verifier que l'utilisateur est actif
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Mettre a jour last_used_at (asynchrone, ne bloque pas la reponse)
    try:
        api_key.last_used_at = datetime.utcnow()
        session.add(api_key)
        session.commit()
    except Exception:
        # Si la mise a jour echoue, on continue quand meme
        # (ne pas bloquer l'authentification pour un probleme de log)
        pass

    return user


# Type annotation pour les dependances
ApiKeyUser = Annotated[User, Depends(verify_api_key)]


async def get_api_key_or_token(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    authorization: str | None = Header(None, alias="Authorization"),
    session: Session = Depends(get_db_for_api_key)
) -> User:
    """
    Verify either API key OR Bearer token.
    Permet d'avoir des routes accessibles avec les 2 methodes d'auth.

    Priority: API Key > Bearer Token

    Args:
        x_api_key: API key from X-API-Key header
        authorization: Bearer token from Authorization header
        session: Database session

    Returns:
        User: The authenticated user

    Raises:
        HTTPException: If neither auth method is valid
    """
    # Priorite a l'API key si presente
    if x_api_key:
        return await verify_api_key(x_api_key=x_api_key, session=session)

    # Sinon, essayer le Bearer token
    if authorization and authorization.startswith("Bearer "):
        # Importer ici pour eviter import circulaire
        from app.api.deps import get_current_user, reusable_oauth2

        token = authorization.replace("Bearer ", "")

        # Utiliser la logique existante de verification JWT
        try:
            # Note: Cette fonction utilise deja SessionDep donc on doit passer session
            return get_current_user(session=session, token=token)
        except Exception:
            pass

    # Aucune auth valide
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Use either X-API-Key header or Bearer token.",
        headers={"WWW-Authenticate": "ApiKey, Bearer"}
    )


# Type annotation pour les dependances hybrides
ApiKeyOrTokenUser = Annotated[User, Depends(get_api_key_or_token)]
