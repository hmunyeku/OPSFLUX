"""
Modèles pour Error Tracking & Monitoring
Permet de capturer, stocker et gérer les erreurs applicatives
"""

import uuid
from datetime import datetime
from typing import Optional
from enum import Enum

from sqlalchemy import Column, JSON, Text
from sqlmodel import Field, SQLModel

from app.core.models import AbstractBaseModel


class ErrorSeverity(str, Enum):
    """Niveaux de sévérité des erreurs"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class ErrorStatus(str, Enum):
    """Statut de résolution d'une erreur"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    IGNORED = "ignored"


class ErrorSource(str, Enum):
    """Source de l'erreur"""
    BACKEND = "backend"
    FRONTEND = "frontend"
    WORKER = "worker"
    DATABASE = "database"
    EXTERNAL_API = "external_api"
    SYSTEM = "system"


# Base model for ErrorLog
class ErrorLogBase(SQLModel):
    """Base pour ErrorLog"""
    error_type: str = Field(max_length=255, description="Type d'erreur (ex: ValueError, TypeError)")
    message: str = Field(sa_column=Column(Text), description="Message d'erreur")
    severity: ErrorSeverity = Field(default=ErrorSeverity.ERROR, description="Sévérité de l'erreur")
    source: ErrorSource = Field(default=ErrorSource.BACKEND, description="Source de l'erreur")
    status: ErrorStatus = Field(default=ErrorStatus.OPEN, description="Statut de résolution")

    # Contexte technique
    stacktrace: Optional[str] = Field(default=None, sa_column=Column(Text), description="Stack trace complète")
    file_path: Optional[str] = Field(default=None, max_length=500, description="Fichier source de l'erreur")
    line_number: Optional[int] = Field(default=None, description="Numéro de ligne")
    function_name: Optional[str] = Field(default=None, max_length=255, description="Nom de la fonction")

    # Contexte utilisateur
    user_id: Optional[uuid.UUID] = Field(default=None, description="ID utilisateur concerné")
    request_path: Optional[str] = Field(default=None, max_length=1000, description="URL/Path de la requête")
    request_method: Optional[str] = Field(default=None, max_length=10, description="Méthode HTTP")
    user_agent: Optional[str] = Field(default=None, max_length=500, description="User agent")
    ip_address: Optional[str] = Field(default=None, max_length=50, description="Adresse IP")

    # Résolution
    resolved_at: Optional[datetime] = Field(default=None, description="Date de résolution")
    resolved_by_id: Optional[uuid.UUID] = Field(default=None, description="ID de l'utilisateur ayant résolu")
    resolution_notes: Optional[str] = Field(default=None, sa_column=Column(Text), description="Notes de résolution")

    # Grouping (pour regrouper erreurs similaires)
    error_hash: Optional[str] = Field(default=None, max_length=64, index=True, description="Hash pour grouper erreurs similaires")
    occurrence_count: int = Field(default=1, description="Nombre d'occurrences")
    last_seen_at: datetime = Field(default_factory=datetime.utcnow, description="Dernière occurrence")


# Database model
class ErrorLog(AbstractBaseModel, ErrorLogBase, table=True):
    """
    Log d'erreur avec audit trail complet.
    Hérite de AbstractBaseModel pour les fonctionnalités communes.
    """
    __tablename__ = "error_logs"

    # Métadonnées supplémentaires (JSON) - défini ici avec sa_column
    # Renommé car 'metadata' est réservé par SQLAlchemy
    extra_data: Optional[dict] = Field(default=None, sa_column=Column(JSON), description="Données contextuelles additionnelles")


# Create model
class ErrorLogCreate(SQLModel):
    """Création d'un log d'erreur"""
    error_type: str
    message: str
    severity: ErrorSeverity = ErrorSeverity.ERROR
    source: ErrorSource = ErrorSource.BACKEND
    stacktrace: Optional[str] = None
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    function_name: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    request_path: Optional[str] = None
    request_method: Optional[str] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    extra_data: Optional[dict] = None
    error_hash: Optional[str] = None


# Update model
class ErrorLogUpdate(SQLModel):
    """Mise à jour d'un log d'erreur"""
    status: Optional[ErrorStatus] = None
    resolution_notes: Optional[str] = None
    resolved_by_id: Optional[uuid.UUID] = None


# Public response model
class ErrorLogPublic(ErrorLogBase):
    """Réponse publique d'un log d'erreur"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[uuid.UUID] = None


class ErrorLogsPublic(SQLModel):
    """Liste paginée de logs d'erreur"""
    data: list[ErrorLogPublic]
    count: int


class ErrorStatsResponse(SQLModel):
    """Statistiques d'erreurs"""
    total_errors: int
    open_errors: int
    resolved_errors: int
    critical_errors: int
    errors_by_severity: dict[str, int]
    errors_by_source: dict[str, int]
    errors_by_status: dict[str, int]
    recent_errors: list[ErrorLogPublic]
    top_errors: list[dict]  # erreurs les plus fréquentes
