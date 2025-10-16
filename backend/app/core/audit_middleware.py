"""
Middleware pour enregistrer automatiquement les requêtes API dans les logs d'audit.
"""
import time
from datetime import datetime
from typing import Callable, Optional
from uuid import UUID

from fastapi import Request, Response
from sqlmodel import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.db import engine
from app.models_audit import AuditLog


class AuditLogMiddleware(BaseHTTPMiddleware):
    """
    Middleware qui enregistre automatiquement toutes les requêtes API dans la table audit_logs.
    """

    # Routes à ignorer (pour éviter trop de logs)
    EXCLUDED_PATHS = [
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/utils/health-check",
        "/api/v1/ws/notifications",  # WebSocket
    ]

    # Mapping des status codes vers les niveaux de log
    STATUS_TO_LEVEL = {
        range(200, 300): "INFO",
        range(300, 400): "INFO",
        range(400, 500): "WARN",
        range(500, 600): "ERROR",
    }

    def _should_log(self, path: str) -> bool:
        """Vérifie si la route doit être loggée."""
        return not any(path.startswith(excluded) for excluded in self.EXCLUDED_PATHS)

    def _get_level_from_status(self, status_code: int) -> str:
        """Détermine le niveau de log selon le status code."""
        for status_range, level in self.STATUS_TO_LEVEL.items():
            if status_code in status_range:
                return level
        return "ERROR"

    def _get_event_type(self, path: str) -> str:
        """Détermine le type d'événement selon la route."""
        if "/login" in path or "/auth" in path or "/2fa" in path:
            return "AUTH"
        elif any(
            method in path.upper()
            for method in ["POST", "PUT", "PATCH", "DELETE"]
            if path.startswith("/api/v1/")
        ):
            return "CRUD"
        elif path.startswith("/api/"):
            return "API"
        else:
            return "SYSTEM"

    def _get_user_id(self, request: Request) -> Optional[UUID]:
        """Extrait l'ID utilisateur de la requête si disponible."""
        try:
            # L'utilisateur est disponible dans request.state après authentification
            if hasattr(request.state, "user") and request.state.user:
                return request.state.user.id
        except Exception:
            pass
        return None

    def _create_message(
        self, method: str, path: str, status_code: int, duration_ms: int
    ) -> str:
        """Crée un message descriptif pour le log."""
        return f"{method} {path} - {status_code} ({duration_ms}ms)"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Traite la requête et enregistre le log d'audit."""

        # Vérifier si on doit logger cette route
        if not self._should_log(request.url.path):
            return await call_next(request)

        # Mesurer le temps de traitement
        start_time = time.time()

        # Traiter la requête
        try:
            response = await call_next(request)
            error_details = None
        except Exception as e:
            # En cas d'erreur, créer une réponse 500
            response = Response(content=str(e), status_code=500)
            error_details = str(e)

        # Calculer la durée
        duration_ms = int((time.time() - start_time) * 1000)

        # Déterminer les informations du log
        status_code = response.status_code
        level = self._get_level_from_status(status_code)
        event_type = self._get_event_type(request.url.path)
        message = self._create_message(
            request.method, request.url.path, status_code, duration_ms
        )

        # Obtenir les informations client
        client_host = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        user_id = self._get_user_id(request)

        # Enregistrer dans la base de données (de manière asynchrone pour ne pas bloquer)
        try:
            with Session(engine) as session:
                audit_log = AuditLog(
                    timestamp=datetime.utcnow(),
                    level=level,
                    event_type=event_type,
                    message=message,
                    source="api_middleware",
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    user_id=user_id,
                    ip_address=client_host,
                    user_agent=user_agent,
                    environment="production",  # Peut être configuré via settings
                    duration_ms=duration_ms,
                    error_details=error_details,
                )
                session.add(audit_log)
                session.commit()
        except Exception as e:
            # Ne pas faire échouer la requête si le logging échoue
            print(f"Failed to log audit entry: {e}")

        return response
