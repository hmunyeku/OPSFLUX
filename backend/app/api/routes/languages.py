"""
Routes API pour le système de gestion multilingue (i18n).
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Message, User
from app.models_i18n import (
    Language,
    LanguageCreate,
    LanguageUpdate,
    LanguagePublic,
    LanguagesPublic,
    TranslationNamespace,
    TranslationNamespaceCreate,
    TranslationNamespacePublic,
    Translation,
    TranslationCreate,
    TranslationUpdate,
    TranslationPublic,
    TranslationsPublic,
    TranslationImportRequest,
    TranslationExportResponse,
    UserLanguagePreference,
    UserLanguagePreferencePublic,
)
from app.core.cache_service import cache_service


router = APIRouter(prefix="/languages", tags=["languages"])


# ==================== LANGUAGES ====================

@router.get("/", response_model=LanguagesPublic)
def read_languages(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    is_active: bool | None = None,
) -> Any:
    """
    Récupère la liste des langues disponibles (endpoint public).

    Filtres:
    - is_active: Filtrer par langues actives/inactives
    """
    # Base query
    statement = select(Language).where(Language.deleted_at == None)  # noqa: E711

    # Filtrer par statut actif
    if is_active is not None:
        statement = statement.where(Language.is_active == is_active)

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination et tri par ordre d'affichage
    statement = (
        statement
        .order_by(Language.display_order, Language.name)
        .offset(skip)
        .limit(limit)
    )
    languages = session.exec(statement).all()

    return LanguagesPublic(
        data=[LanguagePublic.model_validate(lang) for lang in languages],
        count=count
    )


@router.get("/default", response_model=LanguagePublic)
def read_default_language(
    session: SessionDep,
) -> Any:
    """
    Récupère la langue par défaut du système (endpoint public).
    """
    statement = select(Language).where(
        Language.is_default == True,
        Language.deleted_at == None  # noqa: E711
    )
    language = session.exec(statement).first()

    if not language:
        raise HTTPException(status_code=404, detail="No default language configured")

    return LanguagePublic.model_validate(language)


@router.post("/", response_model=LanguagePublic)
def create_language(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    language_in: LanguageCreate,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Crée une nouvelle langue.

    Requiert les privilèges superuser.
    """
    # Vérifier si le code existe déjà
    existing = session.exec(
        select(Language).where(
            Language.code == language_in.code,
            Language.deleted_at == None  # noqa: E711
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Language with code '{language_in.code}' already exists"
        )

    # Si is_default=True, retirer le flag des autres langues
    if language_in.is_default:
        statement = select(Language).where(
            Language.is_default == True,
            Language.deleted_at == None  # noqa: E711
        )
        current_defaults = session.exec(statement).all()
        for lang in current_defaults:
            lang.is_default = False
            session.add(lang)

    # Créer la langue
    language = Language.model_validate(
        language_in,
        update={"created_by_id": current_user.id}
    )
    session.add(language)
    session.commit()
    session.refresh(language)

    return LanguagePublic.model_validate(language)


@router.get("/{language_id}", response_model=LanguagePublic)
def read_language(
    language_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère une langue spécifique par ID.
    """
    language = session.get(Language, language_id)
    if not language or language.deleted_at:
        raise HTTPException(status_code=404, detail="Language not found")

    return LanguagePublic.model_validate(language)


@router.patch("/{language_id}", response_model=LanguagePublic)
def update_language(
    *,
    language_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    language_in: LanguageUpdate,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Met à jour une langue.

    Requiert les privilèges superuser.
    """
    language = session.get(Language, language_id)
    if not language or language.deleted_at:
        raise HTTPException(status_code=404, detail="Language not found")

    # Si is_default=True, retirer le flag des autres langues
    if language_in.is_default is True and not language.is_default:
        statement = select(Language).where(
            Language.is_default == True,
            Language.deleted_at == None  # noqa: E711
        )
        current_defaults = session.exec(statement).all()
        for lang in current_defaults:
            lang.is_default = False
            session.add(lang)

    # Mettre à jour uniquement les champs fournis
    update_data = language_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(language, key, value)

    language.updated_by_id = current_user.id

    session.add(language)
    session.commit()
    session.refresh(language)

    return LanguagePublic.model_validate(language)


@router.delete("/{language_id}", response_model=Message)
def delete_language(
    language_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Message:
    """
    Supprime une langue (soft delete).

    Requiert les privilèges superuser.
    """
    language = session.get(Language, language_id)
    if not language or language.deleted_at:
        raise HTTPException(status_code=404, detail="Language not found")

    # Empêcher la suppression de la langue par défaut
    if language.is_default:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the default language. Set another language as default first."
        )

    # Soft delete
    from datetime import datetime, timezone
    language.deleted_at = datetime.now(timezone.utc)
    language.deleted_by_id = current_user.id

    session.add(language)
    session.commit()

    return Message(message="Language deleted successfully")


# ==================== NAMESPACES ====================

@router.get("/namespaces/", response_model=list[TranslationNamespacePublic])
def read_namespaces(
    session: SessionDep,
    namespace_type: str | None = None,
    module_id: uuid.UUID | None = None,
) -> Any:
    """
    Récupère la liste des namespaces de traduction (endpoint public).

    Filtres:
    - namespace_type: "core" ou "module"
    - module_id: ID du module (pour les namespaces de type "module")
    """
    statement = select(TranslationNamespace).where(
        TranslationNamespace.deleted_at == None  # noqa: E711
    )

    if namespace_type:
        statement = statement.where(TranslationNamespace.namespace_type == namespace_type)

    if module_id:
        statement = statement.where(TranslationNamespace.module_id == module_id)

    statement = statement.order_by(TranslationNamespace.code)
    namespaces = session.exec(statement).all()

    return [TranslationNamespacePublic.model_validate(ns) for ns in namespaces]


@router.post("/namespaces/", response_model=TranslationNamespacePublic)
def create_namespace(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    namespace_in: TranslationNamespaceCreate,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Crée un nouveau namespace de traduction.

    Requiert les privilèges superuser.
    """
    # Vérifier si le code existe déjà
    existing = session.exec(
        select(TranslationNamespace).where(
            TranslationNamespace.code == namespace_in.code,
            TranslationNamespace.deleted_at == None  # noqa: E711
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Namespace with code '{namespace_in.code}' already exists"
        )

    # Créer le namespace
    namespace = TranslationNamespace.model_validate(
        namespace_in,
        update={"created_by_id": current_user.id}
    )
    session.add(namespace)
    session.commit()
    session.refresh(namespace)

    return TranslationNamespacePublic.model_validate(namespace)


# ==================== TRANSLATIONS ====================

@router.get("/translations/", response_model=TranslationsPublic)
def read_translations(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    namespace_id: uuid.UUID | None = None,
    language_id: uuid.UUID | None = None,
    key: str | None = None,
    is_verified: bool | None = None,
) -> Any:
    """
    Récupère la liste des traductions.

    Filtres:
    - namespace_id: Filtrer par namespace
    - language_id: Filtrer par langue
    - key: Recherche par clé (partielle)
    - is_verified: Filtrer par statut de vérification
    """
    statement = select(Translation).where(Translation.deleted_at == None)  # noqa: E711

    if namespace_id:
        statement = statement.where(Translation.namespace_id == namespace_id)

    if language_id:
        statement = statement.where(Translation.language_id == language_id)

    if key:
        statement = statement.where(Translation.key.ilike(f"%{key}%"))

    if is_verified is not None:
        statement = statement.where(Translation.is_verified == is_verified)

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination
    statement = (
        statement
        .order_by(Translation.key)
        .offset(skip)
        .limit(limit)
    )
    translations = session.exec(statement).all()

    return TranslationsPublic(
        data=[TranslationPublic.model_validate(t) for t in translations],
        count=count
    )


@router.post("/translations/", response_model=TranslationPublic)
async def create_translation(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    translation_in: TranslationCreate,
) -> Any:
    """
    Crée une nouvelle traduction.
    Invalidates i18n cache.
    """
    # Vérifier si la traduction existe déjà
    existing = session.exec(
        select(Translation).where(
            Translation.namespace_id == translation_in.namespace_id,
            Translation.language_id == translation_in.language_id,
            Translation.key == translation_in.key,
            Translation.deleted_at == None  # noqa: E711
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Translation for key '{translation_in.key}' already exists in this namespace and language"
        )

    # Créer la traduction
    translation = Translation.model_validate(
        translation_in,
        update={"created_by_id": current_user.id}
    )
    session.add(translation)
    session.commit()
    session.refresh(translation)

    # Invalidate i18n cache
    await cache_service.clear_namespace("i18n")

    return TranslationPublic.model_validate(translation)


@router.patch("/translations/{translation_id}", response_model=TranslationPublic)
async def update_translation(
    *,
    translation_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    translation_in: TranslationUpdate,
) -> Any:
    """
    Met à jour une traduction.
    Invalidates i18n cache.
    """
    translation = session.get(Translation, translation_id)
    if not translation or translation.deleted_at:
        raise HTTPException(status_code=404, detail="Translation not found")

    # Mettre à jour uniquement les champs fournis
    update_data = translation_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(translation, key, value)

    # Si is_verified est passé à True, enregistrer la date et l'utilisateur
    if translation_in.is_verified is True and not translation.is_verified:
        from datetime import datetime, timezone
        translation.verified_at = datetime.now(timezone.utc)
        translation.verified_by_id = current_user.id

    translation.updated_by_id = current_user.id

    session.add(translation)
    session.commit()
    session.refresh(translation)

    # Invalidate i18n cache
    await cache_service.clear_namespace("i18n")

    return TranslationPublic.model_validate(translation)


@router.delete("/translations/{translation_id}", response_model=Message)
async def delete_translation(
    translation_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Message:
    """
    Supprime une traduction (soft delete).
    Invalidates i18n cache.

    Requiert les privilèges superuser.
    """
    translation = session.get(Translation, translation_id)
    if not translation or translation.deleted_at:
        raise HTTPException(status_code=404, detail="Translation not found")

    # Soft delete
    from datetime import datetime, timezone
    translation.deleted_at = datetime.now(timezone.utc)
    translation.deleted_by_id = current_user.id

    session.add(translation)
    session.commit()

    # Invalidate i18n cache
    await cache_service.clear_namespace("i18n")

    return Message(message="Translation deleted successfully")


# ==================== BULK OPERATIONS ====================

@router.post("/translations/import", response_model=Message)
def import_translations(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    import_request: TranslationImportRequest,
    _: User = Depends(get_current_active_superuser),
) -> Message:
    """
    Importe des traductions en masse.

    Permet d'importer un dictionnaire de traductions {key: value}.
    Si overwrite_existing=True, écrase les traductions existantes.

    Requiert les privilèges superuser.
    """
    # Vérifier que le namespace existe
    namespace = session.get(TranslationNamespace, import_request.namespace_id)
    if not namespace or namespace.deleted_at:
        raise HTTPException(status_code=404, detail="Namespace not found")

    # Vérifier que la langue existe
    language = session.get(Language, import_request.language_id)
    if not language or language.deleted_at:
        raise HTTPException(status_code=404, detail="Language not found")

    imported_count = 0
    updated_count = 0

    for key, value in import_request.translations.items():
        # Chercher si la traduction existe
        existing = session.exec(
            select(Translation).where(
                Translation.namespace_id == import_request.namespace_id,
                Translation.language_id == import_request.language_id,
                Translation.key == key,
                Translation.deleted_at == None  # noqa: E711
            )
        ).first()

        if existing:
            if import_request.overwrite_existing:
                existing.value = value
                existing.updated_by_id = current_user.id
                session.add(existing)
                updated_count += 1
        else:
            # Créer nouvelle traduction
            translation = Translation(
                namespace_id=import_request.namespace_id,
                language_id=import_request.language_id,
                key=key,
                value=value,
                created_by_id=current_user.id,
            )
            session.add(translation)
            imported_count += 1

    session.commit()

    return Message(
        message=f"Import completed: {imported_count} created, {updated_count} updated"
    )


@router.get("/translations/export", response_model=TranslationExportResponse)
@cache_service.cached(
    namespace="i18n",
    key_builder=lambda session, namespace_id, language_id, namespace_code, language_code: f"export:{namespace_id}:{language_id}:{namespace_code}:{language_code}"
)
async def export_translations(
    session: SessionDep,
    namespace_id: uuid.UUID | None = None,
    language_id: uuid.UUID | None = None,
    namespace_code: str | None = None,
    language_code: str | None = None,
) -> Any:
    """
    Exporte toutes les traductions d'un namespace pour une langue donnée (endpoint public).
    Uses default TTL from settings (redis_default_ttl).

    Peut utiliser soit les IDs, soit les codes (namespace_code + language_code).
    Retourne un dictionnaire {key: value} de toutes les traductions.
    """
    # Résoudre le namespace
    if namespace_code:
        namespace_stmt = select(TranslationNamespace).where(
            TranslationNamespace.code == namespace_code,
            TranslationNamespace.deleted_at == None  # noqa: E711
        )
        namespace = session.exec(namespace_stmt).first()
    elif namespace_id:
        namespace = session.get(TranslationNamespace, namespace_id)
    else:
        raise HTTPException(status_code=400, detail="Either namespace_id or namespace_code is required")

    if not namespace or namespace.deleted_at:
        raise HTTPException(status_code=404, detail="Namespace not found")

    # Résoudre la langue
    if language_code:
        language_stmt = select(Language).where(
            Language.code == language_code,
            Language.deleted_at == None  # noqa: E711
        )
        language = session.exec(language_stmt).first()
    elif language_id:
        language = session.get(Language, language_id)
    else:
        raise HTTPException(status_code=400, detail="Either language_id or language_code is required")

    if not language or language.deleted_at:
        raise HTTPException(status_code=404, detail="Language not found")

    # Récupérer toutes les traductions
    statement = select(Translation).where(
        Translation.namespace_id == namespace.id,
        Translation.language_id == language.id,
        Translation.deleted_at == None  # noqa: E711
    )
    translations = session.exec(statement).all()

    # Construire le dictionnaire
    translations_dict = {t.key: t.value for t in translations}
    verified_count = sum(1 for t in translations if t.is_verified)

    return TranslationExportResponse(
        namespace_code=namespace.code,
        language_code=language.code,
        translations=translations_dict,
        total_keys=len(translations_dict),
        verified_keys=verified_count,
    )


# ==================== USER PREFERENCES ====================

@router.get("/preferences/me", response_model=UserLanguagePreferencePublic)
def read_my_language_preference(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère la préférence de langue de l'utilisateur connecté.
    """
    statement = select(UserLanguagePreference).where(
        UserLanguagePreference.user_id == current_user.id,
        UserLanguagePreference.deleted_at == None  # noqa: E711
    )
    preference = session.exec(statement).first()

    if not preference:
        # Retourner la langue par défaut du système
        default_lang = session.exec(
            select(Language).where(
                Language.is_default == True,
                Language.deleted_at == None  # noqa: E711
            )
        ).first()

        if not default_lang:
            raise HTTPException(status_code=404, detail="No language preference or default language found")

        # Créer une préférence avec la langue par défaut
        preference = UserLanguagePreference(
            user_id=current_user.id,
            language_id=default_lang.id,
            created_by_id=current_user.id,
        )
        session.add(preference)
        session.commit()
        session.refresh(preference)

    return UserLanguagePreferencePublic.model_validate(preference)


@router.put("/preferences/me", response_model=UserLanguagePreferencePublic)
def update_my_language_preference(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    language_id: uuid.UUID,
    fallback_language_id: uuid.UUID | None = None,
) -> Any:
    """
    Met à jour la préférence de langue de l'utilisateur connecté.
    """
    # Vérifier que la langue existe et est active
    language = session.get(Language, language_id)
    if not language or language.deleted_at or not language.is_active:
        raise HTTPException(status_code=404, detail="Language not found or inactive")

    # Vérifier la langue de secours si fournie
    if fallback_language_id:
        fallback = session.get(Language, fallback_language_id)
        if not fallback or fallback.deleted_at or not fallback.is_active:
            raise HTTPException(status_code=404, detail="Fallback language not found or inactive")

    # Chercher la préférence existante
    statement = select(UserLanguagePreference).where(
        UserLanguagePreference.user_id == current_user.id,
        UserLanguagePreference.deleted_at == None  # noqa: E711
    )
    preference = session.exec(statement).first()

    if preference:
        # Mettre à jour
        preference.language_id = language_id
        preference.fallback_language_id = fallback_language_id
        preference.updated_by_id = current_user.id
    else:
        # Créer
        preference = UserLanguagePreference(
            user_id=current_user.id,
            language_id=language_id,
            fallback_language_id=fallback_language_id,
            created_by_id=current_user.id,
        )

    session.add(preference)
    session.commit()
    session.refresh(preference)

    return UserLanguagePreferencePublic.model_validate(preference)
