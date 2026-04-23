"""GitHub integration — connection testing and Issue/PR sync.

Sprint 1 delivered `test_connection`. Sprint 2 adds the minimal Issue /
Comment surface used by the Support↔GitHub bidirectional sync:

  * `get_token_for(config, credentials)` — returns a short-lived API
    token regardless of auth method (installation token for Apps,
    raw PAT otherwise).
  * `create_issue`, `add_issue_comment`, `close_issue`, `reopen_issue`
  * `get_pr` — used to resolve PR URL/number referenced in an Issue.
  * `verify_webhook_signature` — HMAC-SHA256 check before acting on
    any incoming webhook payload.

Auth methods supported:
  * `personal_access_token` — classic/fine-grained PAT in `Authorization`
    header.
  * `github_app` — exchange the App's private RSA key for an installation
    token, then call the API with that short-lived token. Validates that
    all the pieces (App ID, installation ID, private key) fit together.
"""
from __future__ import annotations

import hashlib
import hmac
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


# ─── Sprint 2 — Issue / Comment sync surface ────────────────────────────

_API_TIMEOUT_S = 20.0


async def get_token_for(
    config: dict[str, Any], credentials: dict[str, Any]
) -> str:
    """Return a usable GitHub API token for the given connector config.

    For PAT auth that's just the stored token. For GitHub App auth we
    mint a fresh installation token (TTL 1h) per call — cheap enough at
    our volume, and avoids caching stale tokens after App rotations.
    """
    if config.get("auth_method") == "personal_access_token":
        token = credentials.get("token")
        if not token:
            raise ValueError("PAT auth: credentials.token is empty")
        return token
    if config.get("auth_method") == "github_app":
        return await _mint_installation_token(
            config["app_id"], config["installation_id"], credentials["private_key"]
        )
    raise ValueError(f"Unsupported auth_method: {config.get('auth_method')}")


def _repo_path(config: dict[str, Any]) -> str:
    return f"{config['repo_owner']}/{config['repo_name']}"


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def create_issue(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """Create a GitHub Issue in the configured repo."""
    token = await get_token_for(config, credentials)
    payload: dict[str, Any] = {"title": title, "body": body}
    if labels:
        payload["labels"] = labels
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.post(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/issues",
            json=payload,
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


async def add_issue_comment(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    issue_number: int,
    body: str,
) -> dict[str, Any]:
    """Post a comment on an Issue. Returns the created comment."""
    token = await get_token_for(config, credentials)
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.post(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/issues/{issue_number}/comments",
            json={"body": body},
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


async def update_issue_state(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    issue_number: int,
    state: str,  # 'open' | 'closed'
    state_reason: str | None = None,
) -> dict[str, Any]:
    """Open / close an Issue."""
    token = await get_token_for(config, credentials)
    payload: dict[str, Any] = {"state": state}
    if state_reason:
        payload["state_reason"] = state_reason
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.patch(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/issues/{issue_number}",
            json=payload,
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


def verify_webhook_signature(
    *, payload_body: bytes, signature_header: str | None, secret: str | None
) -> bool:
    """Constant-time HMAC-SHA256 verification.

    GitHub sends the header `X-Hub-Signature-256: sha256=<hex>`. We refuse
    any payload when either the header or the stored secret is missing —
    no fallback, no optional skip.
    """
    if not signature_header or not secret:
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    provided = signature_header.split("=", 1)[1]
    return hmac.compare_digest(expected, provided)


# ─── Sprint 5 — PR inspection + merge ──────────────────────────────────

async def get_pr(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    pr_number: int,
) -> dict[str, Any]:
    """Fetch a pull request's metadata."""
    token = await get_token_for(config, credentials)
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.get(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/pulls/{pr_number}",
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


async def get_pr_files(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    pr_number: int,
) -> list[dict[str, Any]]:
    """List files changed in a PR with their filename/additions/deletions."""
    token = await get_token_for(config, credentials)
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.get(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/pulls/{pr_number}/files",
            headers=_headers(token),
            params={"per_page": 300},
        )
        resp.raise_for_status()
        return resp.json()


async def get_pr_checks(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    commit_sha: str,
) -> dict[str, Any]:
    """Aggregate CI status for a commit.

    GitHub exposes this via `/commits/{sha}/check-runs`. We return a
    minimal shape: `{"total": N, "succeeded": N, "failed": N,
    "pending": N, "runs": [...]}`.
    """
    token = await get_token_for(config, credentials)
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.get(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/commits/{commit_sha}/check-runs",
            headers=_headers(token),
            params={"per_page": 100},
        )
        resp.raise_for_status()
        data = resp.json()
    runs = data.get("check_runs") or []
    total = len(runs)
    succeeded = sum(1 for r in runs if r.get("conclusion") == "success")
    failed = sum(1 for r in runs if r.get("conclusion") in ("failure", "timed_out", "cancelled"))
    pending = sum(1 for r in runs if r.get("status") in ("queued", "in_progress"))
    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "pending": pending,
        "runs": [
            {
                "name": r.get("name"),
                "status": r.get("status"),
                "conclusion": r.get("conclusion"),
            }
            for r in runs
        ],
    }


async def merge_pr(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    pr_number: int,
    merge_method: str = "squash",
    commit_title: str | None = None,
    commit_message: str | None = None,
) -> dict[str, Any]:
    """Merge a PR. Returns the merge payload or raises on 4xx/5xx."""
    token = await get_token_for(config, credentials)
    payload: dict[str, Any] = {"merge_method": merge_method}
    if commit_title:
        payload["commit_title"] = commit_title
    if commit_message:
        payload["commit_message"] = commit_message
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.put(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/pulls/{pr_number}/merge",
            json=payload,
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


async def close_pr(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    pr_number: int,
    rejection_reason: str | None = None,
) -> dict[str, Any]:
    """Close a PR without merging. Optionally post a rejection comment first."""
    token = await get_token_for(config, credentials)
    if rejection_reason:
        async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
            await client.post(
                f"{_GITHUB_API}/repos/{_repo_path(config)}/issues/{pr_number}/comments",
                json={"body": f"PR rejetée : {rejection_reason}"},
                headers=_headers(token),
            )
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        resp = await client.patch(
            f"{_GITHUB_API}/repos/{_repo_path(config)}/pulls/{pr_number}",
            json={"state": "closed"},
            headers=_headers(token),
        )
        resp.raise_for_status()
        return resp.json()


async def mark_pr_ready_for_review(
    config: dict[str, Any],
    credentials: dict[str, Any],
    *,
    pr_node_id: str,
) -> None:
    """Convert a draft PR to ready-for-review (GraphQL only — REST has no PATCH field)."""
    token = await get_token_for(config, credentials)
    async with httpx.AsyncClient(timeout=_API_TIMEOUT_S) as client:
        await client.post(
            f"{_GITHUB_API}/graphql",
            headers=_headers(token),
            json={
                "query": "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){clientMutationId}}",
                "variables": {"id": pr_node_id},
            },
        )
