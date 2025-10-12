import uuid
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.password_service import PasswordService
from app.core.security import get_password_hash, verify_password
from app.models import Item, ItemCreate, User, UserCreate, UserUpdate


def create_user(*, session: Session, user_create: UserCreate) -> User:
    """
    Crée un nouvel utilisateur avec validation stricte du mot de passe.
    """
    # Valider le mot de passe selon la politique stricte
    is_valid, errors = PasswordService.validate_password(user_create.password)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={"message": "Mot de passe non conforme à la politique de sécurité", "errors": errors}
        )

    hashed_password = get_password_hash(user_create.password)
    db_obj = User.model_validate(
        user_create, update={"hashed_password": hashed_password, "password_history": [hashed_password]}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    """
    Met à jour un utilisateur avec validation du mot de passe si changé.
    """
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}

    if "password" in user_data:
        password = user_data["password"]

        # Valider le nouveau mot de passe
        is_valid, errors = PasswordService.validate_password(password)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail={"message": "Mot de passe non conforme à la politique de sécurité", "errors": errors}
            )

        # Hasher le nouveau mot de passe
        hashed_password = get_password_hash(password)

        # Vérifier l'historique des mots de passe
        password_history = db_user.password_history or []
        if not PasswordService.check_password_history(hashed_password, password_history, history_size=5):
            raise HTTPException(
                status_code=400,
                detail="Ce mot de passe a déjà été utilisé récemment. Veuillez en choisir un nouveau."
            )

        # Mettre à jour l'historique (garder les 5 derniers)
        new_history = (password_history + [hashed_password])[-5:]
        extra_data["hashed_password"] = hashed_password
        extra_data["password_history"] = new_history

    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item
