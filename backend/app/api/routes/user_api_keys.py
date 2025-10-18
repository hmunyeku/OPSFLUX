"""
User API Keys Routes
Routes pour gerer les cles API personnelles des utilisateurs
"""

import hashlib
import secrets
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_api_keys import (
    UserApiKey,
    UserApiKeyCreate,
    UserApiKeyPublic,
    UserApiKeyResponse,
    UserApiKeysPublic,
)

router = APIRouter(prefix="/users/me/api-key", tags=["User API Keys"])


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate API key with format: ofs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

    Returns:
        tuple[str, str, str]: (full_key, key_hash, key_prefix)
            - full_key: La cle complete a afficher UNE SEULE FOIS
            - key_hash: Hash SHA256 pour stockage securise
            - key_prefix: Prefixe pour affichage (ex: "ofs_abc12345...")
    """
    # Generer 32 caracteres aleatoires securises
    random_part = secrets.token_urlsafe(32)[:32]

    # Prefixe pour identifier les cles OpsFlux
    prefix = "ofs_"
    full_key = f"{prefix}{random_part}"

    # Hash pour stockage securise (SHA256)
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()

    # Prefixe pour affichage (ex: "ofs_abc12345...")
    key_prefix = f"{prefix}{random_part[:8]}..."

    return full_key, key_hash, key_prefix


@router.post("/", response_model=UserApiKeyResponse, status_code=status.HTTP_201_CREATED)
def create_user_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    key_in: UserApiKeyCreate,
) -> Any:
    """
    Generer une nouvelle cle API pour l'utilisateur courant.

    IMPORTANT:
    - Un utilisateur ne peut avoir qu'UNE SEULE cle API active a la fois
    - Si une cle existe deja, elle sera automatiquement revoquee
    - La cle complete n'est affichee QU'UNE SEULE FOIS
    - Stockez-la en lieu sur, elle ne pourra pas etre recuperee

    Returns:
        UserApiKeyResponse contenant la cle complete (affichee une seule fois)
    """
    # Verifier si l'utilisateur a deja une cle active
    existing_statement = (
        select(UserApiKey)
        .where(UserApiKey.user_id == current_user.id)
        .where(UserApiKey.is_active == True)
        .where(UserApiKey.deleted_at == None)
    )
    existing_key = session.exec(existing_statement).first()

    if existing_key:
        # Revoquer automatiquement l'ancienne cle
        existing_key.is_active = False
        existing_key.update_audit_trail(updated_by_id=current_user.id)
        session.add(existing_key)

    # Generer la nouvelle cle
    full_key, key_hash, key_prefix = generate_api_key()

    # Creer l'enregistrement
    db_api_key = UserApiKey(
        user_id=current_user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=key_in.name,
        expires_at=key_in.expires_at,
        is_active=True,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )

    session.add(db_api_key)
    session.commit()
    session.refresh(db_api_key)

    # Retourner la reponse avec la cle complete (UNE SEULE FOIS!)
    return UserApiKeyResponse(
        id=db_api_key.id,
        name=db_api_key.name,
        key=full_key,  # CLE COMPLETE - AFFICHEE UNE SEULE FOIS
        key_prefix=key_prefix,
        created_at=db_api_key.created_at,
        expires_at=db_api_key.expires_at,
    )


@router.get("/", response_model=UserApiKeyPublic | None)
def get_user_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Recuperer la cle API active de l'utilisateur courant (sans le secret complet).

    Returns:
        UserApiKeyPublic ou None si aucune cle active
    """
    statement = (
        select(UserApiKey)
        .where(UserApiKey.user_id == current_user.id)
        .where(UserApiKey.is_active == True)
        .where(UserApiKey.deleted_at == None)
    )
    api_key = session.exec(statement).first()

    if not api_key:
        return None

    return UserApiKeyPublic(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        is_active=api_key.is_active,
    )


@router.get("/all", response_model=UserApiKeysPublic)
def get_all_user_api_keys(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Recuperer toutes les cles API de l'utilisateur (actives et revoquees).

    Utile pour voir l'historique des cles.
    """
    count_statement = (
        select(func.count())
        .select_from(UserApiKey)
        .where(UserApiKey.user_id == current_user.id)
        .where(UserApiKey.deleted_at == None)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(UserApiKey)
        .where(UserApiKey.user_id == current_user.id)
        .where(UserApiKey.deleted_at == None)
        .order_by(UserApiKey.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    api_keys = session.exec(statement).all()

    return UserApiKeysPublic(
        data=[
            UserApiKeyPublic(
                id=key.id,
                name=key.name,
                key_prefix=key.key_prefix,
                created_at=key.created_at,
                last_used_at=key.last_used_at,
                expires_at=key.expires_at,
                is_active=key.is_active,
            )
            for key in api_keys
        ],
        count=count,
    )


@router.delete("/", response_model=Message)
def revoke_user_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Revoquer la cle API active de l'utilisateur courant.

    La cle est desactivee (is_active = False) mais conservee en base
    pour l'audit et l'historique.
    """
    statement = (
        select(UserApiKey)
        .where(UserApiKey.user_id == current_user.id)
        .where(UserApiKey.is_active == True)
        .where(UserApiKey.deleted_at == None)
    )
    api_key = session.exec(statement).first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active API key found"
        )

    # Revoquer la cle
    api_key.is_active = False
    api_key.update_audit_trail(updated_by_id=current_user.id)
    session.add(api_key)
    session.commit()

    return Message(message="API key revoked successfully")


@router.put("/regenerate", response_model=UserApiKeyResponse)
def regenerate_user_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    key_in: UserApiKeyCreate,
) -> Any:
    """
    Regenerer une nouvelle cle API (alias pour create).

    Cette route est un alias de POST / pour plus de clarte semantique.
    Revoque automatiquement l'ancienne cle et cree une nouvelle.

    IMPORTANT:
    - La cle complete n'est affichee QU'UNE SEULE FOIS
    - Stockez-la en lieu sur, elle ne pourra pas etre recuperee

    Returns:
        UserApiKeyResponse contenant la nouvelle cle complete
    """
    # Utilise la meme logique que create
    return create_user_api_key(
        session=session,
        current_user=current_user,
        key_in=key_in,
    )


@router.delete("/{api_key_id}", response_model=Message)
def delete_user_api_key_by_id(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    api_key_id: uuid.UUID,
) -> Any:
    """
    Supprimer definitivement une cle API specifique (soft delete).

    Seules les cles de l'utilisateur courant peuvent etre supprimees.
    Utilise le soft delete (deleted_at) pour conserver l'audit trail.
    """
    api_key = session.get(UserApiKey, api_key_id)

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )

    # Verifier que la cle appartient bien a l'utilisateur courant
    if api_key.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own API keys"
        )

    # Soft delete
    api_key.soft_delete(deleted_by_id=current_user.id)
    session.add(api_key)
    session.commit()

    return Message(message="API key deleted successfully")
