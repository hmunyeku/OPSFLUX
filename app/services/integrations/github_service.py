"""GitHub integration — connection testing (Sprint 1 scope).

Sprint 1 only needs the `test_connection` entry point: hit the REST API
once to confirm the credentials work and the repo is reachable. Issue /
PR / webhook / branch-creation helpers arrive in Sprint 2+.

Auth methods supported:
  * `personal_access_token` — classic/fine-grained PAT in `Authorization`
    header.
  * `github_app` — exchange the App's private RSA key for an installation
    token, then call the API with that short-lived token. Validates that
    all the pieces (App ID, installation ID, private key) fit together.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_GITHUB_API = "https://api.github.com"
_TEST_TIMEOUT_S = 15.0


async def test_connection(
    config: dict[str, Any],
    credentials: dict[str, Any],
) -> tuple[bool, str, dict[str, Any]]:
    """Verify a GitHub connector is usable.

    Returns `(ok, human_message, details_dict)`. `details_dict` is stored
    verbatim on `IntegrationConnection.last_test_result` so the UI can
    surface whatever the API returned (repo full_name, default branch
    advertised by GitHub, permissions granted, etc.).
    """
    auth_method = config.get("auth_method")
    repo_owner = config.get("repo_owner")
    repo_name = config.get("repo_name")

    if not (repo_owner and repo_name):
        return False, "repo_owner and repo_name are required", {}

    try:
        if auth_method == "personal_access_token":
            token = credentials.get("token")
            if not token:
                return False, "Missing PAT in credentials.token", {}
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        elif auth_method == "github_app":
            app_id = config.get("app_id")
            installation_id = config.get("installation_id")
            private_key = credentials.get("private_key")
            if not (app_id and installation_id and private_key):
                return False, (
                    "github_app requires app_id, installation_id and "
                    "credentials.private_key"
                ), {}
            try:
                token = await _mint_installation_token(
                    app_id, installation_id, private_key
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("GitHub App token mint failed: %s", exc)
                return False, f"Failed to mint installation token: {exc}", {}
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        else:
            return False, f"Unknown auth_method: {auth_method}", {}

        async with httpx.AsyncClient(timeout=_TEST_TIMEOUT_S) as client:
            resp = await client.get(
                f"{_GITHUB_API}/repos/{repo_owner}/{repo_name}",
                headers=headers,
            )
            if resp.status_code == 404:
                return False, "Repository not found or no access", {}
            if resp.status_code == 401:
                return False, "Authentication rejected", {}
            if resp.status_code == 403:
                return False, "Forbidden — missing scopes/permissions", {}
            resp.raise_for_status()
            data = resp.json()

        details = {
            "full_name": data.get("full_name"),
            "default_branch": data.get("default_branch"),
            "private": data.get("private"),
            "permissions": data.get("permissions"),
        }
        return True, f"Connected to {data.get('full_name')}", details

    except httpx.HTTPError as exc:
        logger.warning("GitHub test HTTP error: %s", exc)
        return False, f"HTTP error: {exc}", {}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected GitHub test failure")
        return False, f"Unexpected error: {exc}", {}


async def _mint_installation_token(
    app_id: str, installation_id: str, private_key_pem: str
) -> str:
    """Exchange the App's RSA private key for an installation token.

    GitHub Apps use a 2-step dance: a JWT signed with the App's private
    key authenticates the App itself, then an API call creates a short-
    lived (1 hour) installation token scoped to the installation.
    """
    # `python-jose[cryptography]` is already a dependency of OPSFLUX for
    # OAuth/OIDC token signing, so we reuse it here instead of adding
    # PyJWT.
    from jose import jwt as jose_jwt

    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 9 * 60,  # max 10 min per GitHub docs, leave margin
        "iss": app_id,
    }
    app_jwt = jose_jwt.encode(payload, private_key_pem, algorithm="RS256")

    async with httpx.AsyncClient(timeout=_TEST_TIMEOUT_S) as client:
        resp = await client.post(
            f"{_GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        resp.raise_for_status()
        return resp.json()["token"]
