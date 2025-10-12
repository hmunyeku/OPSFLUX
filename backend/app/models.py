import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, JSON
from sqlmodel import Field, Relationship, SQLModel

from app.core.models import AbstractBaseModel


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(AbstractBaseModel, UserBase, table=True):
    """
    Modèle User avec audit trail complet et soft delete.
    Hérite de AbstractBaseModel pour les fonctionnalités communes.

    password_history: Historique des 5 derniers mots de passe hashés
    """
    hashed_password: str
    password_history: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(AbstractBaseModel, ItemBase, table=True):
    """
    Modèle Item avec audit trail complet et soft delete.
    Hérite de AbstractBaseModel pour les fonctionnalités communes.
    """
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token (not a database model, just Pydantic for validation)
class TokenPayload(BaseModel):
    sub: str | None = None
    exp: int | None = None  # Expiration timestamp
    type: str | None = None  # "access" or "refresh"
    sid: str | None = None  # session_id (optionnel)


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)
