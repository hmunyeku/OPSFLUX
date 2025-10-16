from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    """
    Modèle pour stocker les logs d'audit de l'application.
    Enregistre toutes les requêtes API et événements importants.
    """

    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Informations sur l'événement
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    level: str = Field(max_length=10, index=True)  # INFO, WARN, ERROR, DEBUG
    event_type: str = Field(max_length=50, index=True)  # API, AUTH, CRUD, SYSTEM
    message: str = Field(max_length=1000)
    source: str = Field(max_length=200)  # Module/fichier source

    # Informations sur la requête HTTP
    method: Optional[str] = Field(default=None, max_length=10)  # GET, POST, etc.
    path: Optional[str] = Field(default=None, max_length=500)
    status_code: Optional[int] = Field(default=None)

    # Informations utilisateur
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = Field(default=None, max_length=500)

    # Métadonnées additionnelles
    environment: str = Field(default="production", max_length=20)  # development, production
    duration_ms: Optional[int] = Field(default=None)  # Durée de la requête en ms
    error_details: Optional[str] = Field(default=None, max_length=2000)

    # Données JSON additionnelles (optionnel)
    extra_metadata: Optional[str] = Field(default=None)
