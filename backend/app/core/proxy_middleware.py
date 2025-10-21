"""
Middleware pour gérer les headers de proxy (X-Forwarded-Proto, X-Forwarded-Host, etc.)

Ce middleware force FastAPI à générer des URLs HTTPS dans les redirects
quand l'application est derrière un reverse proxy HTTPS (Traefik, nginx, etc.)
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from typing import Callable


class ProxyHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware pour gérer les headers de proxy et forcer HTTPS dans les redirects.

    Ce middleware lit les headers X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-Port
    envoyés par le reverse proxy et met à jour la requête pour que FastAPI
    génère des URLs correctes dans les redirects.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Lire les headers de proxy
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "https")
        forwarded_host = request.headers.get("X-Forwarded-Host")
        forwarded_port = request.headers.get("X-Forwarded-Port")

        # Mettre à jour le scope de la requête
        if forwarded_proto:
            request.scope["scheme"] = forwarded_proto

        if forwarded_host:
            request.scope["server"] = (
                forwarded_host,
                int(forwarded_port) if forwarded_port else (443 if forwarded_proto == "https" else 80)
            )

        # Traiter la requête
        response = await call_next(request)

        # Si c'est un redirect, forcer HTTPS dans la location
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location", "")
            if location.startswith("http://"):
                # Remplacer http:// par https://
                response.headers["location"] = location.replace("http://", "https://", 1)

        return response
