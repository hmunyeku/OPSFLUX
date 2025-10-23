"""
Modèles pour le système de backup/restore.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel

from app.core.models import AbstractBaseModel


class BackupBase(SQLModel):
    """Modèle de base pour les backups."""
    name: str = Field(max_length=255, description="Nom du backup")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description du backup")
    backup_type: str = Field(max_length=50, description="Type de backup: full, database, storage, config")
    status: str = Field(max_length=50, description="Statut: pending, in_progress, completed, failed")
    file_path: Optional[str] = Field(default=None, max_length=500, description="Chemin du fichier de backup")
    file_size: Optional[int] = Field(default=None, description="Taille du fichier en bytes")
    error_message: Optional[str] = Field(default=None, max_length=2000, description="Message d'erreur si échec")


class Backup(AbstractBaseModel, BackupBase, table=True):
    """
    Modèle de backup en base de données.
    Hérite de AbstractBaseModel pour audit trail et soft delete.
    """
    __tablename__ = "backups"

    # Champs spécifiques au backup (id, created_at, created_by_id hérités de AbstractBaseModel)
    completed_at: Optional[datetime] = Field(default=None, description="Date de complétion du backup")

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


class BackupEstimateRequest(SQLModel):
    """Schéma pour estimer la taille d'un backup."""
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


# Scheduled Backups Models

class ScheduledBackupBase(SQLModel):
    """Modèle de base pour les sauvegardes planifiées."""
    name: str = Field(max_length=255, description="Nom de la planification")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description")
    backup_type: str = Field(default="full", max_length=50, description="Type: full, incremental")
    includes_database: bool = Field(default=True, description="Inclut la DB")
    includes_storage: bool = Field(default=True, description="Inclut le storage")
    includes_config: bool = Field(default=True, description="Inclut la config")

    # Schedule configuration
    schedule_frequency: str = Field(max_length=50, description="Fréquence: daily, weekly, monthly")
    schedule_time: str = Field(max_length=10, description="Heure d'exécution (HH:MM)")
    schedule_day: Optional[int] = Field(default=None, description="Jour (0-6 pour semaine, 1-31 pour mois)")

    # Status
    is_active: bool = Field(default=True, description="Planification active")
    last_run_at: Optional[datetime] = Field(default=None, description="Dernière exécution")
    next_run_at: Optional[datetime] = Field(default=None, description="Prochaine exécution")


class ScheduledBackup(AbstractBaseModel, ScheduledBackupBase, table=True):
    """
    Modèle de sauvegarde planifiée en base de données.
    Hérite de AbstractBaseModel pour audit trail et soft delete.
    """
    __tablename__ = "scheduled_backups"

    # Champs spécifiques (id, created_at, updated_at, created_by_id hérités de AbstractBaseModel)

    # Statistics
    total_runs: int = Field(default=0, description="Nombre total d'exécutions")
    successful_runs: int = Field(default=0, description="Nombre d'exécutions réussies")
    failed_runs: int = Field(default=0, description="Nombre d'échecs")


class ScheduledBackupCreate(SQLModel):
    """Schéma pour créer une sauvegarde planifiée."""
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    backup_type: str = Field(default="full", max_length=50)
    includes_database: bool = Field(default=True)
    includes_storage: bool = Field(default=True)
    includes_config: bool = Field(default=True)
    schedule_frequency: str = Field(max_length=50)
    schedule_time: str = Field(max_length=10)
    schedule_day: Optional[int] = Field(default=None)
    is_active: bool = Field(default=True)


class ScheduledBackupUpdate(SQLModel):
    """Schéma pour mettre à jour une sauvegarde planifiée."""
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    backup_type: Optional[str] = Field(default=None, max_length=50)
    includes_database: Optional[bool] = Field(default=None)
    includes_storage: Optional[bool] = Field(default=None)
    includes_config: Optional[bool] = Field(default=None)
    schedule_frequency: Optional[str] = Field(default=None, max_length=50)
    schedule_time: Optional[str] = Field(default=None, max_length=10)
    schedule_day: Optional[int] = Field(default=None)
    is_active: Optional[bool] = Field(default=None)


class ScheduledBackupPublic(ScheduledBackupBase):
    """Schéma public pour une sauvegarde planifiée."""
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime]
    created_by_id: Optional[UUID]
    total_runs: int
    successful_runs: int
    failed_runs: int


class ScheduledBackupsPublic(SQLModel):
    """Liste publique de sauvegardes planifiées."""
    data: list[ScheduledBackupPublic]
    count: int
