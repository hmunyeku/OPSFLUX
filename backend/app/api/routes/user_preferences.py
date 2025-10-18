"""
Routes API pour les préférences utilisateur.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models_preferences import (
    UserPreference,
    UserPreferenceCreate,
    UserPreferenceUpdate,
    UserPreferencePublic,
    UserPreferencesPublic,
    UserPreferencesBulkUpdate,
)


router = APIRouter(prefix="/user-preferences", tags=["user-preferences"])


@router.get("/", response_model=UserPreferencesPublic)
def read_user_preferences(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    module_id: Optional[UUID] = None,
) -> Any:
    """
    Récupère les préférences de l'utilisateur connecté.

    Filtres:
    - module_id: Filtrer par module (None = préférences CORE uniquement)
    """
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if module_id is not None:
        statement = statement.where(UserPreference.module_id == module_id)
    else:
        # Par défaut, récupérer uniquement les préférences CORE
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    # Compter
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination
    statement = statement.offset(skip).limit(limit).order_by(UserPreference.preference_key)
    preferences = session.exec(statement).all()

    return UserPreferencesPublic(
        data=[UserPreferencePublic.model_validate(p) for p in preferences],
        count=count,
    )


@router.get("/all", response_model=dict[str, dict])
def read_all_user_preferences(
    session: SessionDep,
    current_user: CurrentUser,
    module_id: Optional[UUID] = None,
) -> Any:
    """
    Récupère toutes les préférences de l'utilisateur sous forme de dictionnaire.

    Format retourné: {preference_key: {value, type}}

    Utile pour charger toutes les préférences d'un coup côté frontend.
    """
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if module_id is not None:
        statement = statement.where(UserPreference.module_id == module_id)
    else:
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    preferences = session.exec(statement).all()

    # Construire le dictionnaire
    result = {}
    for pref in preferences:
        result[pref.preference_key] = {
            "value": pref.preference_value,
            "type": pref.preference_type,
        }

    return result


@router.get("/{preference_key}", response_model=UserPreferencePublic)
def read_user_preference(
    preference_key: str,
    session: SessionDep,
    current_user: CurrentUser,
    module_id: Optional[UUID] = None,
) -> Any:
    """
    Récupère une préférence spécifique de l'utilisateur.
    """
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.preference_key == preference_key,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if module_id is not None:
        statement = statement.where(UserPreference.module_id == module_id)
    else:
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    preference = session.exec(statement).first()

    if not preference:
        raise HTTPException(status_code=404, detail="Preference not found")

    return UserPreferencePublic.model_validate(preference)


@router.post("/", response_model=UserPreferencePublic)
def create_user_preference(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    preference_in: UserPreferenceCreate,
) -> Any:
    """
    Crée ou met à jour une préférence utilisateur.

    Si la préférence existe déjà, elle est mise à jour (upsert).
    """
    # Chercher si existe déjà
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.preference_key == preference_in.preference_key,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if preference_in.module_id is not None:
        statement = statement.where(UserPreference.module_id == preference_in.module_id)
    else:
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    existing = session.exec(statement).first()

    if existing:
        # Mettre à jour
        existing.preference_value = preference_in.preference_value
        existing.preference_type = preference_in.preference_type
        if preference_in.description is not None:
            existing.description = preference_in.description
        existing.updated_by_id = current_user.id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return UserPreferencePublic.model_validate(existing)
    else:
        # Créer
        preference = UserPreference.model_validate(
            preference_in,
            update={
                "user_id": current_user.id,
                "created_by_id": current_user.id,
            }
        )
        session.add(preference)
        session.commit()
        session.refresh(preference)
        return UserPreferencePublic.model_validate(preference)


@router.post("/bulk", response_model=dict[str, int])
def bulk_update_user_preferences(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    bulk_update: UserPreferencesBulkUpdate,
) -> Any:
    """
    Met à jour plusieurs préférences en une seule requête (bulk upsert).

    Format attendu:
    {
        "preferences": {
            "colorTheme": {"value": "zinc", "type": "string"},
            "darkMode": {"value": "dark", "type": "string"},
            ...
        },
        "module_id": null  // ou UUID du module
    }

    Retourne: {"updated": count, "created": count}
    """
    updated_count = 0
    created_count = 0

    for key, data in bulk_update.preferences.items():
        # Chercher si existe
        statement = select(UserPreference).where(
            UserPreference.user_id == current_user.id,
            UserPreference.preference_key == key,
            UserPreference.deleted_at == None  # noqa: E711
        )

        if bulk_update.module_id is not None:
            statement = statement.where(UserPreference.module_id == bulk_update.module_id)
        else:
            statement = statement.where(UserPreference.module_id == None)  # noqa: E711

        existing = session.exec(statement).first()

        if existing:
            # Update
            existing.preference_value = data.get("value", {})
            existing.preference_type = data.get("type", "json")
            existing.updated_by_id = current_user.id
            session.add(existing)
            updated_count += 1
        else:
            # Create
            preference = UserPreference(
                user_id=current_user.id,
                module_id=bulk_update.module_id,
                preference_key=key,
                preference_value=data.get("value", {}),
                preference_type=data.get("type", "json"),
                created_by_id=current_user.id,
            )
            session.add(preference)
            created_count += 1

    session.commit()

    return {
        "updated": updated_count,
        "created": created_count,
        "total": updated_count + created_count,
    }


@router.delete("/{preference_key}")
def delete_user_preference(
    preference_key: str,
    session: SessionDep,
    current_user: CurrentUser,
    module_id: Optional[UUID] = None,
) -> Any:
    """
    Supprime une préférence utilisateur (soft delete).
    """
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.preference_key == preference_key,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if module_id is not None:
        statement = statement.where(UserPreference.module_id == module_id)
    else:
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    preference = session.exec(statement).first()

    if not preference:
        raise HTTPException(status_code=404, detail="Preference not found")

    # Soft delete
    from datetime import datetime, timezone
    preference.deleted_at = datetime.now(timezone.utc)
    preference.deleted_by_id = current_user.id
    session.add(preference)
    session.commit()

    return {"success": True, "message": "Preference deleted"}


@router.post("/reset")
def reset_user_preferences(
    session: SessionDep,
    current_user: CurrentUser,
    module_id: Optional[UUID] = None,
) -> Any:
    """
    Réinitialise toutes les préférences de l'utilisateur (soft delete).

    Si module_id est fourni, réinitialise uniquement les préférences de ce module.
    Sinon, réinitialise toutes les préférences CORE.
    """
    statement = select(UserPreference).where(
        UserPreference.user_id == current_user.id,
        UserPreference.deleted_at == None  # noqa: E711
    )

    if module_id is not None:
        statement = statement.where(UserPreference.module_id == module_id)
    else:
        statement = statement.where(UserPreference.module_id == None)  # noqa: E711

    preferences = session.exec(statement).all()

    from datetime import datetime, timezone
    for pref in preferences:
        pref.deleted_at = datetime.now(timezone.utc)
        pref.deleted_by_id = current_user.id
        session.add(pref)

    session.commit()

    return {
        "success": True,
        "message": f"Reset {len(preferences)} preferences",
        "count": len(preferences),
    }
