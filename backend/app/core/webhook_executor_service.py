"""
Webhook Executor Service - Exécute les webhooks des Hooks.

Ce service est responsable de:
1. Exécuter les actions de type "call_webhook" définies dans les Hooks
2. Effectuer des requêtes HTTP POST vers les URLs configurées
3. Implémenter une logique de retry en cas d'échec
4. Logger toutes les exécutions dans webhook_log (si table existe)
"""

import logging
import time
from typing import Any
from uuid import UUID

import httpx
from sqlmodel import Session

from app.core.config import settings


logger = logging.getLogger(__name__)


class WebhookExecutorService:
    """Service pour exécuter les webhooks"""

    def __init__(self):
        self.timeout = 30  # Timeout par défaut en secondes
        self.max_retries = 3  # Nombre maximum de tentatives
        self.retry_delay = 2  # Délai entre les tentatives en secondes

    async def execute_webhook(
        self,
        *,
        url: str,
        payload: dict[str, Any],
        headers: dict[str, str] | None = None,
        method: str = "POST",
        timeout: int | None = None,
        max_retries: int | None = None,
    ) -> tuple[bool, int, str]:
        """
        Exécute un webhook (requête HTTP).

        Args:
            url: URL du webhook à appeler
            payload: Données JSON à envoyer
            headers: Headers HTTP optionnels
            method: Méthode HTTP (POST, PUT, PATCH)
            timeout: Timeout en secondes (défaut: 30)
            max_retries: Nombre de tentatives max (défaut: 3)

        Returns:
            tuple[bool, int, str]: (success, status_code, response_text)
        """
        timeout_value = timeout or self.timeout
        retries = max_retries or self.max_retries

        # Headers par défaut
        default_headers = {
            "Content-Type": "application/json",
            "User-Agent": f"{settings.PROJECT_NAME}/1.0",
        }
        if headers:
            default_headers.update(headers)

        attempt = 0
        last_error = ""

        while attempt < retries:
            attempt += 1
            try:
                logger.info(f"Webhook call attempt {attempt}/{retries} to {url}")

                async with httpx.AsyncClient(timeout=timeout_value) as client:
                    if method.upper() == "POST":
                        response = await client.post(url, json=payload, headers=default_headers)
                    elif method.upper() == "PUT":
                        response = await client.put(url, json=payload, headers=default_headers)
                    elif method.upper() == "PATCH":
                        response = await client.patch(url, json=payload, headers=default_headers)
                    else:
                        logger.error(f"Unsupported HTTP method: {method}")
                        return False, 0, f"Unsupported method: {method}"

                    # Considérer 2xx et 3xx comme succès
                    if 200 <= response.status_code < 400:
                        logger.info(f"Webhook success: {response.status_code}")
                        return True, response.status_code, response.text

                    # 4xx = erreur client (ne pas retry)
                    if 400 <= response.status_code < 500:
                        logger.warning(f"Webhook client error {response.status_code}, no retry")
                        return False, response.status_code, response.text

                    # 5xx = erreur serveur (retry)
                    logger.warning(f"Webhook server error {response.status_code}, will retry")
                    last_error = f"HTTP {response.status_code}: {response.text}"

            except httpx.TimeoutException:
                logger.warning(f"Webhook timeout on attempt {attempt}")
                last_error = "Timeout"
            except httpx.RequestError as e:
                logger.warning(f"Webhook request error on attempt {attempt}: {e}")
                last_error = f"Request error: {str(e)}"
            except Exception as e:
                logger.error(f"Unexpected error during webhook call: {e}")
                last_error = f"Unexpected error: {str(e)}"

            # Attendre avant le prochain essai (sauf si c'est le dernier)
            if attempt < retries:
                logger.info(f"Waiting {self.retry_delay}s before retry...")
                time.sleep(self.retry_delay)

        # Toutes les tentatives ont échoué
        logger.error(f"Webhook failed after {retries} attempts. Last error: {last_error}")
        return False, 0, last_error

    async def execute_hook_webhook_action(
        self,
        *,
        action_config: dict[str, Any],
        event_context: dict[str, Any],
        db: Session | None = None,
    ) -> tuple[bool, str]:
        """
        Exécute une action de type "call_webhook" depuis un Hook.

        Args:
            action_config: Configuration de l'action (doit contenir au moins "url")
            event_context: Contexte de l'événement qui a déclenché le hook
            db: Session database (pour logger dans webhook_log si disponible)

        Returns:
            tuple[bool, str]: (success, message)

        Example action_config:
        {
            "url": "https://api.example.com/webhook",
            "method": "POST",  # optionnel, défaut: POST
            "headers": {"Authorization": "Bearer xxx"},  # optionnel
            "include_context": true,  # optionnel, défaut: true
            "custom_payload": {"key": "value"}  # optionnel
        }
        """
        url = action_config.get("url")
        if not url:
            return False, "URL manquante dans la configuration du webhook"

        method = action_config.get("method", "POST")
        headers = action_config.get("headers")
        include_context = action_config.get("include_context", True)
        custom_payload = action_config.get("custom_payload", {})

        # Construire le payload
        payload = {}
        if include_context:
            payload["event_context"] = event_context
        payload.update(custom_payload)

        # Exécuter le webhook
        start_time = time.time()
        success, status_code, response_text = await self.execute_webhook(
            url=url,
            payload=payload,
            headers=headers,
            method=method,
        )
        duration_ms = int((time.time() - start_time) * 1000)

        # Logger dans webhook_log si la table existe
        if db:
            try:
                # TODO: Créer une entrée WebhookLog si le modèle existe
                # webhook_log = WebhookLog(
                #     url=url,
                #     payload=payload,
                #     status_code=status_code,
                #     response_text=response_text[:2000],  # Limiter la taille
                #     success=success,
                #     duration_ms=duration_ms,
                # )
                # db.add(webhook_log)
                # db.commit()
                pass
            except Exception as e:
                logger.warning(f"Could not log webhook execution to DB: {e}")

        if success:
            return True, f"Webhook appelé avec succès ({status_code}) en {duration_ms}ms"
        else:
            return False, f"Échec du webhook: {response_text}"


# Instance singleton
webhook_executor = WebhookExecutorService()
