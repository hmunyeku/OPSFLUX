"""
Modèles pour le système de backup/restore.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class BackupBase(SQLModel):
    """Modèle de base pour les backups."""
    name: str = Field(max_length=255, description="Nom du backup")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description du backup")
    backup_type: str = Field(max_length=50, description="Type de backup: full, database, storage, config")
    status: str = Field(max_length=50, description="Statut: pending, in_progress, completed, failed")
    file_path: Optional[str] = Field(default=None, max_length=500, description="Chemin du fichier de backup")
    file_size: Optional[int] = Field(default=None, description="Taille du fichier en bytes")
    error_message: Optional[str] = Field(default=None, max_length=2000, description="Message d'erreur si échec")


class Backup(BackupBase, table=True):
    """Modèle de backup en base de données."""
    __tablename__ = "backups"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None, description="Date de complétion du backup")
    created_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")

    # Métadonnées additionnelles
    includes_database: bool = Field(default=False, description="Inclut la base de données")
    includes_storage: bool = Field(default=False, description="Inclut les fichiers storage")
    includes_config: bool = Field(default=False, description="Inclut la configuration")

    # Stats
    database_size: Optional[int] = Field(default=None, description="Taille de la DB en bytes")
    storage_size: Optional[int] = Field(default=None, description="Taille du storage en bytes")
    config_size: Optional[int] = Field(default=None, description="Taille de la config en bytes")


class BackupCreate(SQLModel):
    """Schéma pour créer un backup."""
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    backup_type: str = Field(default="full", max_length=50)
    includes_database: bool = Field(default=True)
    includes_storage: bool = Field(default=True)
    includes_config: bool = Field(default=True)


class BackupPublic(BackupBase):
    """Schéma public pour un backup."""
    id: UUID
    created_at: datetime
    completed_at: Optional[datetime]
    created_by_id: Optional[UUID]
    includes_database: bool
    includes_storage: bool
    includes_config: bool
    database_size: Optional[int]
    storage_size: Optional[int]
    config_size: Optional[int]


class BackupsPublic(SQLModel):
    """Liste publique de backups."""
    data: list[BackupPublic]
    count: int


class BackupRestore(SQLModel):
    """Schéma pour restaurer un backup."""
    backup_id: UUID
    restore_database: bool = Field(default=True)
    restore_storage: bool = Field(default=True)
    restore_config: bool = Field(default=True)
