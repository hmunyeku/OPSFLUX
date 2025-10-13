"""
Modèles pour le système RBAC (Role-Based Access Control).
Gestion complète des permissions, rôles, et groupes avec tags pour l'affichage.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel, Column, String
from sqlalchemy import Index, UniqueConstraint, Table, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.core.models import AbstractBaseModel


class PermissionSource(str, Enum):
    """Source d'une permission pour un utilisateur"""
    DEFAULT = "default"  # Permission par défaut du système
    ROLE = "role"  # Permission héritée d'un rôle
    GROUP = "group"  # Permission héritée d'un groupe
    PERSONAL = "personal"  # Permission assignée directement à l'utilisateur


# ==================== TABLES D'ASSOCIATION ====================

# Table d'association User <-> Role (many-to-many)
class UserRoleLink(SQLModel, table=True):
    __tablename__ = "user_role_link"
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)


# Table d'association User <-> Permission (many-to-many) - Permissions personnelles
class UserPermissionLink(SQLModel, table=True):
    __tablename__ = "user_permission_link"
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)


# Table d'association Role <-> Permission (many-to-many)
class RolePermissionLink(SQLModel, table=True):
    __tablename__ = "role_permission_link"
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)


# Table d'association Group <-> Permission (many-to-many)
class GroupPermissionLink(SQLModel, table=True):
    __tablename__ = "group_permission_link"
    group_id: uuid.UUID = Field(foreign_key="group.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)


# Table d'association User <-> Group (many-to-many)
class UserGroupLink(SQLModel, table=True):
    __tablename__ = "user_group_link"
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    group_id: uuid.UUID = Field(foreign_key="group.id", primary_key=True)


# ==================== PERMISSION ====================

class PermissionBase(SQLModel):
    """Propriétés de base pour Permission"""
    code: str = Field(max_length=100, index=True, description="Code unique (ex: users.read, items.create)")
    name: str = Field(max_length=255, description="Nom lisible de la permission")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description détaillée")
    module: str = Field(max_length=50, description="Module/fonctionnalité (ex: users, items, settings)")
    is_default: bool = Field(default=False, description="Permission par défaut pour tous les utilisateurs")
    is_active: bool = Field(default=True, description="Permission active")


class PermissionCreate(PermissionBase):
    """Schéma pour créer une permission"""
    pass


class PermissionUpdate(PermissionBase):
    """Schéma pour mettre à jour une permission"""
    code: Optional[str] = Field(default=None, max_length=100)
    name: Optional[str] = Field(default=None, max_length=255)
    module: Optional[str] = Field(default=None, max_length=50)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class Permission(AbstractBaseModel, PermissionBase, table=True):
    """
    Modèle pour les permissions du système.
    Les permissions sont atomiques et représentent une action sur une ressource.
    """
    __tablename__ = "permission"
    __table_args__ = (
        UniqueConstraint("code", name="uq_permission_code"),
        Index("ix_permission_code", "code"),
        Index("ix_permission_module", "module"),
        Index("ix_permission_is_default", "is_default"),
    )

    # Relations
    roles: List["Role"] = Relationship(back_populates="permissions", link_model=RolePermissionLink)
    groups: List["Group"] = Relationship(back_populates="permissions", link_model=GroupPermissionLink)


class PermissionPublic(PermissionBase):
    """Schéma public pour Permission"""
    id: uuid.UUID


class PermissionsPublic(SQLModel):
    """Liste de permissions"""
    data: list[PermissionPublic]
    count: int


# ==================== ROLE ====================

class RoleBase(SQLModel):
    """Propriétés de base pour Role"""
    code: str = Field(max_length=50, index=True, description="Code unique (ex: admin, manager, user)")
    name: str = Field(max_length=255, description="Nom du rôle")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description du rôle")
    is_system: bool = Field(default=False, description="Rôle système non modifiable")
    is_active: bool = Field(default=True, description="Rôle actif")
    priority: int = Field(default=0, description="Priorité du rôle (plus élevé = plus de droits)")


class RoleCreate(RoleBase):
    """Schéma pour créer un rôle"""
    permission_ids: Optional[List[uuid.UUID]] = Field(default=None, description="IDs des permissions associées")


class RoleUpdate(RoleBase):
    """Schéma pour mettre à jour un rôle"""
    code: Optional[str] = Field(default=None, max_length=50)
    name: Optional[str] = Field(default=None, max_length=255)
    is_system: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    permission_ids: Optional[List[uuid.UUID]] = Field(default=None, description="IDs des permissions associées")


class Role(AbstractBaseModel, RoleBase, table=True):
    """
    Modèle pour les rôles du système.
    Un rôle regroupe un ensemble de permissions et peut être assigné à des utilisateurs.
    """
    __tablename__ = "role"
    __table_args__ = (
        UniqueConstraint("code", name="uq_role_code"),
        Index("ix_role_code", "code"),
        Index("ix_role_priority", "priority"),
        Index("ix_role_is_system", "is_system"),
    )

    # Relations
    permissions: List[Permission] = Relationship(back_populates="roles", link_model=RolePermissionLink)


class RolePublic(RoleBase):
    """Schéma public pour Role"""
    id: uuid.UUID
    permissions: Optional[List[PermissionPublic]] = None


class RolesPublic(SQLModel):
    """Liste de rôles"""
    data: list[RolePublic]
    count: int


# ==================== GROUP ====================

class GroupBase(SQLModel):
    """Propriétés de base pour Group"""
    code: str = Field(max_length=50, index=True, description="Code unique du groupe")
    name: str = Field(max_length=255, description="Nom du groupe")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description du groupe")
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="group.id", description="Groupe parent pour hiérarchie")
    is_active: bool = Field(default=True, description="Groupe actif")


class GroupCreate(GroupBase):
    """Schéma pour créer un groupe"""
    permission_ids: Optional[List[uuid.UUID]] = Field(default=None, description="IDs des permissions associées")


class GroupUpdate(GroupBase):
    """Schéma pour mettre à jour un groupe"""
    code: Optional[str] = Field(default=None, max_length=50)
    name: Optional[str] = Field(default=None, max_length=255)
    parent_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    permission_ids: Optional[List[uuid.UUID]] = Field(default=None, description="IDs des permissions associées")


class Group(AbstractBaseModel, GroupBase, table=True):
    """
    Modèle pour les groupes d'utilisateurs.
    Un groupe peut contenir des utilisateurs et avoir des permissions spécifiques.
    Supporte une hiérarchie via parent_id.
    """
    __tablename__ = "group"
    __table_args__ = (
        UniqueConstraint("code", name="uq_group_code"),
        Index("ix_group_code", "code"),
        Index("ix_group_parent_id", "parent_id"),
    )

    # Relations
    permissions: List[Permission] = Relationship(back_populates="groups", link_model=GroupPermissionLink)
    parent: Optional["Group"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Group.id", "foreign_keys": "[Group.parent_id]"}
    )


class GroupPublic(GroupBase):
    """Schéma public pour Group"""
    id: uuid.UUID
    permissions: Optional[List[PermissionPublic]] = None
    parent: Optional["GroupPublic"] = None


class GroupsPublic(SQLModel):
    """Liste de groupes"""
    data: list[GroupPublic]
    count: int


# ==================== USER PERMISSION (WITH SOURCE TAG) ====================

class UserPermissionWithSource(SQLModel):
    """Permission d'un utilisateur avec sa source"""
    permission: PermissionPublic
    source: PermissionSource
    source_name: Optional[str] = Field(default=None, description="Nom du rôle/groupe source")


class UserPermissionsWithSources(SQLModel):
    """Liste des permissions d'un utilisateur avec leurs sources"""
    data: list[UserPermissionWithSource]
    count: int


# ==================== MESSAGE ====================

class Message(SQLModel):
    """Generic message response"""
    message: str
