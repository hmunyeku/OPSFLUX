"""
Routes API REST pour les marque-pages (bookmarks).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_bookmarks import (
    Bookmark,
    BookmarkCreate,
    BookmarkPublic,
    BookmarksPublic,
    BookmarkUpdate,
)

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.get("/", response_model=BookmarksPublic)
def get_bookmarks(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère tous les marque-pages de l'utilisateur connecté,
    triés par position.
    """
    statement = (
        select(Bookmark)
        .where(Bookmark.user_id == current_user.id)
        .order_by(Bookmark.position, Bookmark.created_at.desc())
    )
    bookmarks = session.exec(statement).all()

    return BookmarksPublic(data=bookmarks, count=len(bookmarks))


@router.post("/", response_model=BookmarkPublic)
def create_bookmark(
    session: SessionDep,
    current_user: CurrentUser,
    bookmark_in: BookmarkCreate,
) -> Any:
    """
    Crée un nouveau marque-page pour l'utilisateur connecté.
    """
    # Vérifier si le bookmark existe déjà pour cet utilisateur
    existing = session.exec(
        select(Bookmark)
        .where(Bookmark.user_id == current_user.id)
        .where(Bookmark.path == bookmark_in.path)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Un marque-page existe déjà pour cette page",
        )

    # Obtenir la position maximale actuelle
    max_position = session.exec(
        select(func.max(Bookmark.position)).where(
            Bookmark.user_id == current_user.id
        )
    ).first()

    position = (max_position or 0) + 1

    bookmark = Bookmark(
        **bookmark_in.model_dump(),
        user_id=current_user.id,
        position=position,
    )

    session.add(bookmark)
    session.commit()
    session.refresh(bookmark)

    return bookmark


@router.patch("/{bookmark_id}", response_model=BookmarkPublic)
def update_bookmark(
    session: SessionDep,
    current_user: CurrentUser,
    bookmark_id: UUID,
    bookmark_in: BookmarkUpdate,
) -> Any:
    """
    Met à jour un marque-page existant.
    """
    bookmark = session.get(Bookmark, bookmark_id)

    if not bookmark:
        raise HTTPException(status_code=404, detail="Marque-page non trouvé")

    if bookmark.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de modifier ce marque-page",
        )

    update_data = bookmark_in.model_dump(exclude_unset=True)
    bookmark.sqlmodel_update(update_data)

    session.add(bookmark)
    session.commit()
    session.refresh(bookmark)

    return bookmark


@router.delete("/{bookmark_id}", response_model=Message)
def delete_bookmark(
    session: SessionDep,
    current_user: CurrentUser,
    bookmark_id: UUID,
) -> Any:
    """
    Supprime un marque-page.
    """
    bookmark = session.get(Bookmark, bookmark_id)

    if not bookmark:
        raise HTTPException(status_code=404, detail="Marque-page non trouvé")

    if bookmark.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de supprimer ce marque-page",
        )

    session.delete(bookmark)
    session.commit()

    return Message(message="Marque-page supprimé avec succès")


@router.delete("/all", response_model=Message)
def delete_all_bookmarks(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Supprime tous les marque-pages de l'utilisateur.
    """
    statement = select(Bookmark).where(Bookmark.user_id == current_user.id)
    bookmarks = session.exec(statement).all()

    for bookmark in bookmarks:
        session.delete(bookmark)

    session.commit()

    return Message(message=f"{len(bookmarks)} marque-page(s) supprimé(s)")


@router.post("/reorder", response_model=Message)
def reorder_bookmarks(
    session: SessionDep,
    current_user: CurrentUser,
    bookmark_ids: list[UUID],
) -> Any:
    """
    Réorganise les marque-pages selon l'ordre fourni.

    Args:
        bookmark_ids: Liste des IDs de bookmarks dans l'ordre souhaité
    """
    for index, bookmark_id in enumerate(bookmark_ids):
        bookmark = session.get(Bookmark, bookmark_id)

        if not bookmark:
            continue

        if bookmark.user_id != current_user.id:
            continue

        bookmark.position = index
        session.add(bookmark)

    session.commit()

    return Message(message="Ordre des marque-pages mis à jour")
