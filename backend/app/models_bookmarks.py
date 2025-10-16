"""
Modèles pour le système de marque-pages (bookmarks).
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel

from app.core.models import AbstractBaseModel


class BookmarkBase(SQLModel):
    """Base model for bookmarks."""

    title: str = Field(max_length=255)
    path: str = Field(max_length=500)
    icon: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
    position: int = Field(default=0, description="Position pour l'ordre d'affichage")


class Bookmark(AbstractBaseModel, BookmarkBase, table=True):
    """
    Modèle de marque-page avec audit trail complet.
    Permet aux utilisateurs de sauvegarder des raccourcis vers leurs pages préférées.
    """

    __tablename__ = "bookmarks"

    user_id: UUID = Field(foreign_key="user.id", index=True)


class BookmarkCreate(SQLModel):
    """Schema for creating a bookmark."""

    title: str = Field(max_length=255)
    path: str = Field(max_length=500)
    icon: Optional[str] = None
    category: Optional[str] = None


class BookmarkPublic(BookmarkBase):
    """Public bookmark model."""

    id: UUID
    user_id: UUID


class BookmarksPublic(SQLModel):
    """List of bookmarks."""

    data: list[BookmarkPublic]
    count: int


class BookmarkUpdate(SQLModel):
    """Schema for updating bookmark."""

    title: Optional[str] = Field(default=None, max_length=255)
    path: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = None
    category: Optional[str] = None
    position: Optional[int] = None
