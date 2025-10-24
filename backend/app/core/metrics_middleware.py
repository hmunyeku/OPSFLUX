"""
Middleware pour tracker les métriques HTTP.

Ce middleware mesure automatiquement :
- Le nombre total de requêtes HTTP (http_requests_total)
- La durée des requêtes HTTP (http_request_duration_seconds)
- Les erreurs HTTP par type (errors_total)
- Les utilisateurs actifs (active_users)
"""
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from typing import Callable
import logging
import jwt

from app.core.metrics_service import metrics_service
from app.core.active_users_tracker import active_users_tracker
from app.core.config import settings

logger = logging.getLogger(__name__)


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware qui collecte automatiquement les métriques HTTP pour chaque requête.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Intercepte chaque requête HTTP pour collecter les métriques.

        Args:
            request: La requête HTTP entrante
            call_next: Le prochain handler dans la chaîne

        Returns:
            La réponse HTTP
        """
        # Ignorer les requêtes vers /metrics pour éviter la récursion infinie
        if request.url.path.startswith("/api/v1/metrics"):
            return await call_next(request)

        # Ignorer les healthchecks et static files
        if request.url.path in ["/health", "/favicon.ico"] or request.url.path.startswith("/static"):
            return await call_next(request)

        # Mesurer le temps de début
        start_time = time.time()

        # Initialiser les labels
        method = request.method
        endpoint = request.url.path
        status_code = 500  # Par défaut en cas d'erreur

        # Tracker l'utilisateur actif (si authentifié)
        user_id = self._extract_user_id_from_request(request)
        if user_id:
            active_users_tracker.record_activity(user_id)

        try:
            # Exécuter la requête
            response = await call_next(request)
            status_code = response.status_code

            # Tracker les erreurs si status >= 400
            if status_code >= 400:
                error_type = "client_error" if status_code < 500 else "server_error"
                metrics_service.increment(
                    "errors_total",
                    labels={"type": error_type, "module": "http"}
                )

            return response

        except Exception as e:
            # En cas d'exception non catchée
            logger.error(f"Unhandled exception in request {method} {endpoint}: {e}")
            metrics_service.increment(
                "errors_total",
                labels={"type": "exception", "module": "http"}
            )
            status_code = 500
            raise

        finally:
            # Mesurer la durée totale
            duration = time.time() - start_time

            # Simplifier l'endpoint pour éviter trop de cardinalité
            # Remplacer les UUIDs et IDs par des placeholders
            simplified_endpoint = self._simplify_endpoint(endpoint)

            # Incrémenter le compteur de requêtes
            metrics_service.increment(
                "http_requests_total",
                labels={
                    "method": method,
                    "endpoint": simplified_endpoint,
                    "status": str(status_code)
                }
            )

            # Observer la durée de la requête
            metrics_service.observe(
                "http_request_duration_seconds",
                duration,
                labels={
                    "method": method,
                    "endpoint": simplified_endpoint
                }
            )

    def _simplify_endpoint(self, endpoint: str) -> str:
        """
        Simplifie l'endpoint pour réduire la cardinalité des métriques.

        Exemples:
            /api/v1/users/123e4567-e89b-12d3-a456-426614174000 -> /api/v1/users/{id}
            /api/v1/companies/42 -> /api/v1/companies/{id}
            /api/v1/dashboards/my-dashboard-123 -> /api/v1/dashboards/{id}

        Args:
            endpoint: L'endpoint original

        Returns:
            L'endpoint simplifié
        """
        import re

        # Remplacer les UUIDs par {id}
        endpoint = re.sub(
            r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            '/{id}',
            endpoint,
            flags=re.IGNORECASE
        )

        # Remplacer les IDs numériques par {id}
        endpoint = re.sub(r'/\d+', '/{id}', endpoint)

        # Remplacer les slugs/noms (après les segments connus) par {id}
        # Ex: /api/v1/dashboards/my-custom-dashboard -> /api/v1/dashboards/{id}
        parts = endpoint.split('/')
        if len(parts) > 4:  # /api/v1/resource/...
            # Si le 4ème segment n'est pas un verbe connu, c'est probablement un ID
            known_actions = {'search', 'export', 'import', 'stats', 'reset', 'list', 'create'}
            if parts[4] and parts[4] not in known_actions and not parts[4].startswith('{'):
                parts[4] = '{id}'
                endpoint = '/'.join(parts)

        return endpoint

    def _extract_user_id_from_request(self, request: Request) -> str | None:
        """
        Extrait l'ID de l'utilisateur depuis le token JWT dans les headers.

        Args:
            request: La requête HTTP

        Returns:
            L'ID de l'utilisateur (UUID) ou None si pas authentifié
        """
        try:
            # Essayer de récupérer le token JWT depuis le header Authorization
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return None

            token = auth_header.replace("Bearer ", "")

            # Décoder le token pour extraire le user_id (sub)
            from app.core import security
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[security.ALGORITHM]
            )

            # Le user_id est dans le claim 'sub' (subject)
            user_id = payload.get("sub")
            return user_id

        except Exception:
            # En cas d'erreur (token invalide, expiré, etc.), ne pas tracker l'utilisateur
            # Pas de log d'erreur car c'est normal pour les requêtes non authentifiées
            return None
