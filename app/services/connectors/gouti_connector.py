"""
Gouti Connector — Syncs project data from Gouti project management API.

API: https://apiprd.gouti.net/v1/client
Auth: OAuth2 code → token flow, or cached long-lived token.
Data: Projects, Reports, Status updates
"""
import httpx
from typing import Any
from datetime import datetime


def _extract_items(data: Any, key: str) -> list[dict[str, Any]]:
    """Extract list items from Gouti's various response shapes.

    Gouti returns list endpoints in at least 5 different shapes:
    - ``[...]`` : plain list
    - ``{"projects": [...]}`` : explicit key wrapper
    - ``{"data": [...]}`` / ``{"items": [...]}`` / ``{"results": [...]}``: generic
    - ``{"28364": {...}, "28365": {...}}`` : **dict keyed by entity ID —
      the most common shape for projects, users, tasks, etc.**

    The last shape is the reason older code paths silently returned []. When
    the container is dict-keyed-by-id, we inject the key as ``_id`` on each
    item so downstream code (the upsert) can still read a stable identifier.
    """
    if data is None:
        return []
    if isinstance(data, list):
        return [it for it in data if isinstance(it, dict)]
    if isinstance(data, dict):
        # 1. Explicit list wrappers
        for candidate_key in (key, "data", "items", "results"):
            val = data.get(candidate_key)
            if isinstance(val, list):
                return [it for it in val if isinstance(it, dict)]
            if isinstance(val, dict):
                nested = list(val.values())
                if nested and all(isinstance(v, dict) for v in nested):
                    return [{"_id": str(k), **v} for k, v in val.items()]
        # 2. Top-level dict keyed by ID (most common Gouti pattern)
        values = list(data.values())
        if values and all(isinstance(v, dict) for v in values):
            return [{"_id": str(k), **v} for k, v in data.items()]
    return []


class GoutiConnector:
    """Client for the Gouti project management API."""

    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        entity_code: str,
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.entity_code = entity_code
        self._token: str | None = token or None
        self._token_expires: datetime | None = None

    async def _authenticate(self) -> str:
        """Two-step OAuth: request code → exchange for token.

        Skipped when an initial token was supplied to __init__ — callers
        using token-based auth don't have a client_secret and should not
        attempt the OAuth code exchange.
        """
        if self._token:
            return self._token
        if not self.client_secret:
            raise ValueError(
                "Gouti auth failed: no cached token and no client_secret "
                "to perform the OAuth code exchange."
            )
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Request authorization code
            code_resp = await client.post(
                f"{self.base_url}/code",
                json={
                    "callback_url": f"{self.base_url}/callback",
                    "client_id": self.client_id,
                },
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            code_resp.raise_for_status()
            code_data = code_resp.json()
            auth_code = code_data.get("code") or code_data.get("authorization_code")
            if not auth_code:
                raise ValueError("No authorization code returned from Gouti API")

            # Step 2: Exchange code for token
            token_resp = await client.post(
                f"{self.base_url}/token",
                json={
                    "code": auth_code,
                    "client_id": self.client_id,
                    "secret_client": self.client_secret,
                },
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            token_resp.raise_for_status()
            token_data = token_resp.json()
            token = token_data.get("token") or token_data.get("access_token")
            if not token:
                raise ValueError("No token returned from Gouti API")

            self._token = token
            return token

    async def _get_headers(self) -> dict[str, str]:
        """Get authenticated headers, refreshing token if needed."""
        if not self._token:
            await self._authenticate()
        return {
            "Authorization": f"Bearer {self._token}",
            "Client-Id": self.client_id,
            "Entity-Code": self.entity_code,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def get_projects(self) -> list[dict[str, Any]]:
        """Fetch all projects from Gouti.

        Handles all response shapes via ``_extract_items`` — notably the
        dict-keyed-by-id shape which is Gouti's default for list endpoints.
        """
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.base_url}/projects", headers=headers)
            resp.raise_for_status()
            return _extract_items(resp.json(), "projects")

    async def get_project(self, project_id: str) -> dict[str, Any]:
        """Fetch a single project by ID."""
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.base_url}/projects/{project_id}", headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def get_project_reports(self, project_id: str) -> list[dict[str, Any]]:
        """Fetch reports for a project."""
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.base_url}/projects/{project_id}/reports", headers=headers)
            resp.raise_for_status()
            return _extract_items(resp.json(), "reports")

    async def get_raw_projects_response(self) -> dict[str, Any]:
        """Diagnostic: returns the untransformed Gouti /projects response
        plus metadata (status, shape). Used by the /gouti/debug endpoint."""
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.base_url}/projects", headers=headers)
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            return {
                "http_status": resp.status_code,
                "shape": type(body).__name__,
                "top_level_keys": list(body.keys()) if isinstance(body, dict) else None,
                "sample_body_preview": (
                    {k: (list(v.keys())[:3] if isinstance(v, dict) else v) for k, v in list(body.items())[:3]}
                    if isinstance(body, dict) else
                    body[:3] if isinstance(body, list) else str(body)[:300]
                ),
            }

    async def test_connection(self) -> tuple[str, str]:
        """Test the connection to Gouti API."""
        try:
            await self._authenticate()
            return ("ok", "Connexion réussie à l'API Gouti")
        except httpx.HTTPStatusError as e:
            return ("error", f"Erreur HTTP {e.response.status_code}: {e.response.text[:200]}")
        except httpx.ConnectError:
            return ("error", f"Impossible de se connecter à {self.base_url}")
        except Exception as e:
            return ("error", str(e)[:300])


def create_gouti_connector(settings: dict[str, Any]) -> GoutiConnector:
    """Factory: create GoutiConnector from integration settings dict."""
    return GoutiConnector(
        base_url=settings.get("base_url", "https://apiprd.gouti.net/v1/client"),
        client_id=settings.get("client_id", ""),
        client_secret=settings.get("client_secret", ""),
        entity_code=settings.get("entity_code", ""),
        token=settings.get("token") or None,
    )
